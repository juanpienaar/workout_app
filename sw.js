const CACHE_NAME = 'numnum-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/numnum-logo.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls (/api/*): network-only (don't cache auth/data requests)
// - App shell & static assets: stale-while-revalidate (serve cached, update in background)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls, auth endpoints, and admin routes
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Update cache with fresh response
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed — return cached or offline fallback
          if (cachedResponse) return cachedResponse;
          // For navigation requests, return cached index.html
          if (event.request.mode === 'navigate') {
            return cache.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });

      // Return cached immediately if available, update in background
      return cachedResponse || fetchPromise;
    })
  );
});
