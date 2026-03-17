const CACHE_NAME = 'numnum-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/numnum-logo.svg',
  '/exercises.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(e => console.warn('[SW] Failed to cache:', url, e)))
      );
    })
  );
});

// Activate: clean up old caches, claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - API calls: network-first with offline queueing for POST/PUT
// - Navigation: cache-first (prevents login flash on pull-to-refresh)
// - Static assets: stale-while-revalidate
// - Fonts: cache-first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Queue POST/PUT API calls when offline (background sync)
  if (event.request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(
        fetch(event.request.clone()).catch(() => {
          // Offline — queue for later sync
          return saveToSyncQueue(event.request.clone()).then(() => {
            return new Response(JSON.stringify({ queued: true }), {
              status: 202,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
      );
    }
    return;
  }

  // Skip admin routes from caching
  if (url.pathname.startsWith('/admin')) return;

  // API GET calls: network-first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || new Response(JSON.stringify({ offline: true }), {
            status: 503, headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Google Fonts: cache-first
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const resp = await fetch(event.request);
          if (resp.ok) cache.put(event.request, resp.clone());
          return resp;
        } catch {
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // Skip other cross-origin
  if (url.origin !== self.location.origin) return;

  // Navigation requests (page loads, pull-to-refresh): CACHE FIRST
  // This prevents the login screen flash on refresh
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match('/index.html');
        // Always try to update cache in background
        const fetchPromise = fetch(event.request).then(resp => {
          if (resp.ok) cache.put('/index.html', resp.clone());
          return resp;
        }).catch(() => null);

        if (cached) {
          // Return cached immediately, update in background
          fetchPromise; // fire and forget
          return cached;
        }
        // No cache — must wait for network
        const networkResp = await fetchPromise;
        return networkResp || new Response('Offline — please check your connection.', {
          status: 503, headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fetchPromise = fetch(event.request).then(resp => {
        if (resp.ok) cache.put(event.request, resp.clone());
        return resp;
      }).catch(() => cached || new Response('Offline', { status: 503 }));

      return cached || fetchPromise;
    })
  );
});

// ==================== OFFLINE SYNC QUEUE ====================
// Store failed POST/PUT requests in IndexedDB for later replay
const DB_NAME = 'numnum-sync';
const STORE_NAME = 'queue';

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToSyncQueue(request) {
  try {
    const body = await request.text();
    const db = await openSyncDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    console.log('[SW] Queued request for later:', request.url);
  } catch (e) {
    console.warn('[SW] Failed to queue request:', e);
  }
}

async function replaySyncQueue() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const allReq = store.getAll();
    const allKeys = store.getAllKeys();

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });

    const items = allReq.result || [];
    const keys = allKeys.result || [];

    if (items.length === 0) return;
    console.log(`[SW] Replaying ${items.length} queued requests`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const resp = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
        if (resp.ok || resp.status < 500) {
          // Success or client error — remove from queue
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(keys[i]);
          console.log('[SW] Replayed:', item.url);
        }
      } catch {
        console.warn('[SW] Replay failed, will retry later:', item.url);
        break; // Stop replaying if network is still down
      }
    }
  } catch (e) {
    console.warn('[SW] Sync queue replay error:', e);
  }
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'replaySync') {
    replaySyncQueue();
  }
});

// When coming back online, replay queued requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-workouts') {
    event.waitUntil(replaySyncQueue());
  }
});
