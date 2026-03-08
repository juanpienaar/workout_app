/* NumNum Admin Dashboard — Vanilla JS */

const API = window.location.origin;
let accessToken = null;
let refreshToken = null;
let currentUser = null;
let currentPage = 'dashboard';

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════

function getStoredTokens() {
  accessToken = localStorage.getItem('nn_access_token') || sessionStorage.getItem('nn_access_token');
  refreshToken = localStorage.getItem('nn_refresh_token') || sessionStorage.getItem('nn_refresh_token');
  currentUser = localStorage.getItem('nn_user') || sessionStorage.getItem('nn_user');
}

function storeTokens(at, rt, user) {
  accessToken = at; refreshToken = rt; currentUser = user;
  localStorage.setItem('nn_access_token', at);
  localStorage.setItem('nn_refresh_token', rt);
  localStorage.setItem('nn_user', user);
}

function clearTokens() {
  accessToken = null; refreshToken = null; currentUser = null;
  ['nn_access_token','nn_refresh_token','nn_user','nn_role'].forEach(k => {
    localStorage.removeItem(k); sessionStorage.removeItem(k);
  });
}

async function refreshAccessToken() {
  if (!refreshToken) return false;
  try {
    const r = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refresh_token: refreshToken}),
    });
    if (!r.ok) return false;
    const d = await r.json();
    accessToken = d.access_token;
    localStorage.setItem('nn_access_token', accessToken);
    return true;
  } catch { return false; }
}

async function authFetch(url, opts = {}) {
  if (!opts.headers) opts.headers = {};
  opts.headers['Authorization'] = `Bearer ${accessToken}`;
  if (!(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  }
  let r = await fetch(url, opts);
  if (r.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) {
      opts.headers['Authorization'] = `Bearer ${accessToken}`;
      r = await fetch(url, opts);
    } else {
      clearTokens();
      showLogin();
      throw new Error('auth_expired');
    }
  }
  return r;
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  try {
    const r = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password: pw}),
    });
    const d = await r.json();
    if (!r.ok) { errEl.textContent = d.detail || 'Login failed'; errEl.style.display = 'block'; return; }
    if (d.role !== 'coach') { errEl.textContent = 'Coach access required'; errEl.style.display = 'block'; return; }
    storeTokens(d.access_token, d.refresh_token, d.user_name);
    showApp();
  } catch (e) {
    errEl.textContent = 'Could not connect to server'; errEl.style.display = 'block';
  }
}

function doLogout() {
  clearTokens();
  showLogin();
}

function showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appLayout').style.display = 'none';
}

function showApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appLayout').style.display = 'flex';
  navigate(currentPage);
}

// ══════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  window.location.hash = page;
  renderPage(page);
}

function renderPage(page) {
  const mc = document.getElementById('mainContent');
  switch (page) {
    case 'dashboard': renderDashboard(mc); break;
    case 'users': renderUsers(mc); break;
    case 'programs': renderPrograms(mc); break;
    case 'exercises': renderExercises(mc); break;
    case 'import': renderImport(mc); break;
    default: mc.innerHTML = '<p>Page not found</p>';
  }
}

// ══════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ══════════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════════

function showModal(title, bodyHtml, actions) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modalOverlay';
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<h3>${title}</h3><div id="modalBody">${bodyHtml}</div>
    <div class="modal-actions" id="modalActions"></div>`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  if (actions) {
    const actDiv = document.getElementById('modalActions');
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = `btn ${a.cls || 'btn-secondary'}`;
      btn.textContent = a.label;
      btn.onclick = a.onclick;
      actDiv.appendChild(btn);
    });
  }
}

function closeModal() {
  const el = document.getElementById('modalOverlay');
  if (el) el.remove();
}

// ══════════════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════

async function renderDashboard(mc) {
  mc.innerHTML = `<div class="page-title"><span class="icon">📊</span> Coach Dashboard</div>
    <div class="athlete-select">
      <label style="font-size:14px;color:var(--text-dim)">Athlete:</label>
      <select id="athleteSelect" onchange="loadAthleteData()">
        <option value="">Loading...</option>
      </select>
    </div>
    <div id="dashContent"><p style="color:var(--text-dim)">Select an athlete to view their data.</p></div>`;
  try {
    const r = await authFetch(`${API}/api/admin/users`);
    const d = await r.json();
    const sel = document.getElementById('athleteSelect');
    sel.innerHTML = '<option value="">Select athlete...</option>';
    d.users.forEach(u => {
      sel.innerHTML += `<option value="${u.username}">${u.username} (${u.program || 'No program'})</option>`;
    });
  } catch (e) {
    if (e.message !== 'auth_expired') mc.innerHTML += '<p style="color:#dc2626">Failed to load users</p>';
  }
}

let tonnageChart = null;

async function loadAthleteData() {
  const username = document.getElementById('athleteSelect').value;
  const dc = document.getElementById('dashContent');
  if (!username) { dc.innerHTML = '<p style="color:var(--text-dim)">Select an athlete to view their data.</p>'; return; }
  dc.innerHTML = '<p style="color:var(--text-dim)">Loading...</p>';
  try {
    const r = await authFetch(`${API}/api/admin/users/${encodeURIComponent(username)}/data`);
    const data = await r.json();

    // Get user info for program/start date
    const ur = await authFetch(`${API}/api/admin/users`);
    const ud = await ur.json();
    const userInfo = ud.users.find(u => u.username === username) || {};

    const logs = data.workout_logs || {};
    const whoop = data.whoop_snapshots || [];
    const metrics = data.metrics || [];

    // Build workout log table with tonnage
    const logEntries = [];
    for (const [dayKey, dayData] of Object.entries(logs)) {
      const meta = dayData.meta || {};
      const exData = dayData.data || {};
      let tonnage = 0;
      for (const [exName, sets] of Object.entries(exData)) {
        if (Array.isArray(sets)) {
          sets.forEach(s => { tonnage += (parseFloat(s.weight) || 0) * (parseInt(s.actualReps) || 0); });
        }
      }
      logEntries.push({
        dayKey,
        date: meta.date || '',
        week: meta.weekNum || '',
        day: meta.dayNum || '',
        tonnage: Math.round(tonnage),
        exercises: Object.keys(exData).length,
      });
    }
    logEntries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Stats
    const totalSessions = logEntries.length;
    const totalTonnage = logEntries.reduce((s, e) => s + e.tonnage, 0);
    const latestWhoop = whoop.length > 0 ? whoop[whoop.length - 1] : null;

    let html = `<div class="stats-row">
      <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${(totalTonnage/1000).toFixed(1)}t</div><div class="stat-label">Total Tonnage</div></div>
      <div class="stat-card"><div class="stat-value">${latestWhoop ? Math.round(latestWhoop.recovery_score || 0) + '%' : '—'}</div><div class="stat-label">Recovery</div></div>
      <div class="stat-card"><div class="stat-value">${userInfo.program || '—'}</div><div class="stat-label">Program</div></div>
    </div>`;

    // Tonnage chart
    html += `<div class="chart-container"><h4>Tonnage Over Time</h4><canvas id="tonnageCanvas"></canvas></div>`;

    // Workout log table
    html += `<div class="card"><div class="card-header"><h3>Workout Logs</h3></div>`;
    if (logEntries.length === 0) {
      html += '<p style="color:var(--text-dim);padding:8px 0">No workouts recorded yet.</p>';
    } else {
      html += '<div>';
      logEntries.forEach(e => {
        html += `<div class="log-row">
          <span class="date">${e.date || e.dayKey}</span>
          <span>W${e.week} D${e.day} · ${e.exercises} exercises</span>
          <span class="tonnage">${e.tonnage > 0 ? e.tonnage + ' kg' : '—'}</span>
        </div>`;
      });
      html += '</div>';
    }
    html += '</div>';

    // Whoop data
    if (whoop.length > 0) {
      html += `<div class="card"><div class="card-header"><h3>Whoop Snapshots (Last ${whoop.length})</h3></div>`;
      const recent = whoop.slice(-7).reverse();
      recent.forEach(s => {
        html += `<div class="log-row">
          <span class="date">${(s.date || '').slice(0,10)}</span>
          <span>Recovery: ${s.recovery_score || '—'}% · Sleep: ${s.sleep_score || '—'}</span>
          <span class="tonnage">${s.strain_score ? s.strain_score.toFixed(1) : '—'} strain</span>
        </div>`;
      });
      html += '</div>';
    }

    dc.innerHTML = html;

    // Render tonnage chart
    if (logEntries.length > 0 && document.getElementById('tonnageCanvas')) {
      if (tonnageChart) tonnageChart.destroy();
      const ctx = document.getElementById('tonnageCanvas').getContext('2d');
      tonnageChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: logEntries.map(e => e.date || e.dayKey),
          datasets: [{
            label: 'Tonnage (kg)',
            data: logEntries.map(e => e.tonnage),
            backgroundColor: 'rgba(232,71,95,0.6)',
            borderColor: '#E8475F',
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(42,42,74,0.3)' } },
            y: { ticks: { color: '#888' }, grid: { color: 'rgba(42,42,74,0.3)' }, beginAtZero: true },
          }
        }
      });
    }
  } catch (e) {
    if (e.message !== 'auth_expired') dc.innerHTML = '<p style="color:#dc2626">Failed to load athlete data</p>';
  }
}


// ══════════════════════════════════════════════════════════════════
// USERS PAGE
// ══════════════════════════════════════════════════════════════════

async function renderUsers(mc) {
  mc.innerHTML = `<div class="page-title"><span class="icon">👥</span> Users</div>
    <div class="toolbar">
      <input type="search" class="search-input" id="userSearch" placeholder="Search users..." oninput="filterUsers()">
      <button class="btn btn-primary" onclick="showUserModal()">+ Add User</button>
    </div>
    <div id="usersTable"><p style="color:var(--text-dim)">Loading...</p></div>`;
  await loadUsersTable();
}

let usersCache = [];

async function loadUsersTable() {
  try {
    const r = await authFetch(`${API}/api/admin/users`);
    const d = await r.json();
    usersCache = d.users;
    renderUsersTable(usersCache);
  } catch (e) {
    if (e.message !== 'auth_expired')
      document.getElementById('usersTable').innerHTML = '<p style="color:#dc2626">Failed to load users</p>';
  }
}

function renderUsersTable(users) {
  const container = document.getElementById('usersTable');
  if (!users.length) { container.innerHTML = '<p style="color:var(--text-dim)">No users found.</p>'; return; }
  let html = `<table class="data-table"><thead><tr>
    <th>Name</th><th>Email</th><th>Program</th><th>Start Date</th><th>Role</th><th>Verified</th><th></th>
  </tr></thead><tbody>`;
  users.forEach(u => {
    html += `<tr>
      <td><strong>${esc(u.username)}</strong></td>
      <td style="color:var(--text-dim)">${esc(u.email)}</td>
      <td>${esc(u.program || '—')}</td>
      <td style="color:var(--text-dim)">${u.startDate || '—'}</td>
      <td><span class="badge ${u.role === 'coach' ? 'badge-coach' : 'badge-athlete'}">${u.role}</span></td>
      <td>${u.email_verified ? '<span class="badge badge-verified">✓</span>' : '—'}</td>
      <td style="text-align:right">
        <button class="btn btn-icon" title="Edit" onclick="showUserModal('${esc(u.username)}')">✏️</button>
        <button class="btn btn-icon" title="Delete" onclick="deleteUser('${esc(u.username)}')">🗑️</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function filterUsers() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  renderUsersTable(usersCache.filter(u =>
    u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  ));
}

async function showUserModal(editUsername) {
  const isEdit = !!editUsername;
  let user = {};
  // Get available programs for dropdown
  let programs = [];
  try {
    const r = await authFetch(`${API}/api/admin/programs`);
    const d = await r.json();
    programs = d.programs.map(p => p.name);
  } catch {}

  if (isEdit) {
    user = usersCache.find(u => u.username === editUsername) || {};
  }

  const progOptions = programs.map(p => `<option value="${esc(p)}" ${p === user.program ? 'selected' : ''}>${esc(p)}</option>`).join('');

  showModal(isEdit ? 'Edit User' : 'Add User', `
    <div class="form-group">
      <label>Username</label>
      <input type="text" id="mUsername" value="${esc(user.username || '')}" ${isEdit ? 'disabled style="opacity:0.6"' : ''}>
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="mEmail" value="${esc(user.email || '')}">
    </div>
    <div class="form-group">
      <label>${isEdit ? 'New Password (leave blank to keep)' : 'Password'}</label>
      <input type="password" id="mPassword">
    </div>
    <div class="form-group">
      <label>Program</label>
      <select id="mProgram"><option value="">None</option>${progOptions}</select>
    </div>
    <div class="form-group">
      <label>Start Date</label>
      <input type="date" id="mStartDate" value="${user.startDate || ''}">
    </div>
    <div class="form-group">
      <label>Role</label>
      <select id="mRole">
        <option value="athlete" ${user.role !== 'coach' ? 'selected' : ''}>Athlete</option>
        <option value="coach" ${user.role === 'coach' ? 'selected' : ''}>Coach</option>
      </select>
    </div>
  `, [
    {label: 'Cancel', cls: 'btn-secondary', onclick: closeModal},
    {label: isEdit ? 'Save Changes' : 'Create User', cls: 'btn-primary', onclick: () => saveUser(isEdit, editUsername)},
  ]);
}

async function saveUser(isEdit, editUsername) {
  const email = document.getElementById('mEmail').value.trim();
  const password = document.getElementById('mPassword').value;
  const program = document.getElementById('mProgram').value;
  const startDate = document.getElementById('mStartDate').value;
  const role = document.getElementById('mRole').value;

  try {
    if (isEdit) {
      const body = {email, program, startDate, role};
      if (password) body.password = password;
      const r = await authFetch(`${API}/api/admin/users/${encodeURIComponent(editUsername)}`, {
        method: 'PUT', body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); toast(d.detail || 'Failed', 'error'); return; }
      toast('User updated');
    } else {
      const username = document.getElementById('mUsername').value.trim();
      if (!username || !email || !password) { toast('Fill in all required fields', 'error'); return; }
      const r = await authFetch(`${API}/api/admin/users`, {
        method: 'POST', body: JSON.stringify({username, email, password, program, startDate, role}),
      });
      if (!r.ok) { const d = await r.json(); toast(d.detail || 'Failed', 'error'); return; }
      toast('User created');
    }
    closeModal();
    await loadUsersTable();
  } catch (e) {
    if (e.message !== 'auth_expired') toast('Error saving user', 'error');
  }
}

async function deleteUser(username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  try {
    const r = await authFetch(`${API}/api/admin/users/${encodeURIComponent(username)}`, {method: 'DELETE'});
    if (!r.ok) { const d = await r.json(); toast(d.detail || 'Failed', 'error'); return; }
    toast('User deleted');
    await loadUsersTable();
  } catch (e) {
    if (e.message !== 'auth_expired') toast('Error deleting user', 'error');
  }
}


// ══════════════════════════════════════════════════════════════════
// PROGRAMS PAGE
// ══════════════════════════════════════════════════════════════════

let programsCache = {};

async function renderPrograms(mc) {
  mc.innerHTML = `<div class="page-title"><span class="icon">📋</span> Programs</div>
    <div class="toolbar">
      <div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="buildPrograms()">🔨 Rebuild JSON</button>
      </div>
    </div>
    <div id="programsList"><p style="color:var(--text-dim)">Loading...</p></div>`;
  await loadProgramsList();
}

async function loadProgramsList() {
  try {
    const r = await authFetch(`${API}/api/admin/programs`);
    const d = await r.json();
    const container = document.getElementById('programsList');
    if (!d.programs.length) { container.innerHTML = '<p style="color:var(--text-dim)">No programs found.</p>'; return; }

    let html = '';
    d.programs.forEach(p => {
      html += `<div class="program-card" id="prog-${css(p.name)}">
        <div class="program-header" onclick="toggleProgram('${esc(p.name)}')">
          <div>
            <h3>${esc(p.name)}</h3>
            <span class="meta">${p.weeks} weeks · ${p.days_per_week} days/week</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();duplicateProgram('${esc(p.name)}')">📋 Duplicate</button>
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteProgram('${esc(p.name)}')">Delete</button>
          </div>
        </div>
        <div class="program-body" id="progBody-${css(p.name)}"></div>
      </div>`;
    });
    container.innerHTML = html;
  } catch (e) {
    if (e.message !== 'auth_expired')
      document.getElementById('programsList').innerHTML = '<p style="color:#dc2626">Failed to load programs</p>';
  }
}

async function toggleProgram(name) {
  const body = document.getElementById(`progBody-${css(name)}`);
  if (body.classList.contains('open')) { body.classList.remove('open'); return; }
  body.innerHTML = '<p style="color:var(--text-dim);padding:8px">Loading...</p>';
  body.classList.add('open');
  try {
    const r = await authFetch(`${API}/api/admin/programs/${encodeURIComponent(name)}`);
    const prog = await r.json();
    programsCache[name] = prog;
    renderProgramDetail(name, prog, body);
  } catch (e) {
    body.innerHTML = '<p style="color:#dc2626">Failed to load program</p>';
  }
}

function renderProgramDetail(name, prog, container) {
  let html = '';
  (prog.weeks || []).forEach(week => {
    html += `<div class="week-block"><div class="week-label">Week ${week.week}</div>`;
    (week.days || []).forEach(day => {
      html += `<div class="day-block"><div class="day-label">Day ${day.day}${day.isRest ? ' (Rest)' : ''}</div>`;
      if (day.isRest) {
        html += `<div class="day-rest">${esc(day.restNote || 'Rest day')}</div>`;
      } else {
        (day.exerciseGroups || []).forEach(group => {
          const isMulti = group.exercises.length > 1;
          if (isMulti) html += '<div class="superset-bar">';
          if (isMulti) html += `<div style="font-size:11px;color:var(--accent);margin-bottom:2px">${group.type === 'superset' ? 'Superset' : group.type === 'circuit' ? 'Circuit' : ''}</div>`;
          html += `<div class="exercise-row" style="font-weight:600;color:var(--text-dim);font-size:11px">
            <span>#</span><span>Exercise</span><span>Sets</span><span>Reps</span><span>Tempo</span><span>Rest</span><span>RPE</span>
          </div>`;
          group.exercises.forEach(ex => {
            html += `<div class="exercise-row">
              <span class="order">${esc(ex.order)}</span>
              <span>${esc(ex.name)}</span>
              <span class="dim">${ex.sets}</span>
              <span class="dim">${esc(ex.reps)}</span>
              <span class="dim">${esc(ex.tempo)}</span>
              <span class="dim">${esc(ex.rest)}</span>
              <span class="dim">${esc(ex.rpe || '')}</span>
            </div>`;
          });
          if (isMulti) html += '</div>';
        });
      }
      html += '</div>';
    });
    html += '</div>';
  });
  container.innerHTML = html;
}

async function duplicateProgram(name) {
  const newName = prompt(`Duplicate "${name}" as:`, `${name} (Copy)`);
  if (!newName) return;
  try {
    const r = await authFetch(`${API}/api/admin/programs/${encodeURIComponent(name)}/duplicate`, {
      method: 'POST', body: JSON.stringify({new_name: newName}),
    });
    if (!r.ok) { const d = await r.json(); toast(d.detail || 'Failed', 'error'); return; }
    toast('Program duplicated');
    await loadProgramsList();
  } catch (e) {
    if (e.message !== 'auth_expired') toast('Error duplicating', 'error');
  }
}

async function deleteProgram(name) {
  if (!confirm(`Delete program "${name}"? This cannot be undone.`)) return;
  try {
    const r = await authFetch(`${API}/api/admin/programs/${encodeURIComponent(name)}`, {method: 'DELETE'});
    if (!r.ok) { const d = await r.json(); toast(d.detail || 'Failed', 'error'); return; }
    toast('Program deleted');
    await loadProgramsList();
  } catch (e) {
    if (e.message !== 'auth_expired') toast('Error deleting', 'error');
  }
}

async function buildPrograms() {
  try {
    const r = await authFetch(`${API}/api/admin/build`, {method: 'POST'});
    const d = await r.json();
    if (!r.ok) { toast(d.detail || 'Build failed', 'error'); return; }
    toast('Build complete!');
    await loadProgramsList();
  } catch (e) {
    if (e.message !== 'auth_expired') toast('Build failed', 'error');
  }
}


// ══════════════════════════════════════════════════════════════════
// EXERCISES PAGE
// ══════════════════════════════════════════════════════════════════

let exercisesCache = {};

async function renderExercises(mc) {
  mc.innerHTML = `<div class="page-title"><span class="icon">🏋️</span> Exercises</div>
    <div class="toolbar">
      <input type="search" id="exSearch" placeholder="Search exercises..." oninput="filterExercises()">
      <button class="btn btn-primary btn-sm" onclick="showAddExerciseModal()">+ Add Exercise</button>
    </div>
    <div id="exercisesList"><p style="color:var(--text-dim)">Loading...</p></div>`;
  await loadExercises();
}

async function loadExercises() {
  try {
    const r = await authFetch(`${API}/api/admin/exercises`);
    exercisesCache = await r.json();
    renderExercisesList(exercisesCache);
  } catch (e) {
    if (e.message !== 'auth_expired')
      document.getElementById('exercisesList').innerHTML = '<p style="color:#dc2626">Failed to load exercises</p>';
  }
}

function renderExercisesList(data, filter = '') {
  const container = document.getElementById('exercisesList');
  const groups = Object.keys(data);
  if (!groups.length) { container.innerHTML = '<p style="color:var(--text-dim)">No exercises found.</p>'; return; }

  let html = '';
  groups.forEach(group => {
    const equipTypes = data[group];
    // Count exercises in this group
    let count = 0;
    let matchingHtml = '';
    for (const [equip, exList] of Object.entries(equipTypes)) {
      const filtered = filter ? exList.filter(e => e.name.toLowerCase().includes(filter)) : exList;
      if (filtered.length === 0) continue;
      count += filtered.length;
      matchingHtml += `<div class="equip-section"><div class="equip-label">${esc(equip)}</div>`;
      filtered.forEach(ex => {
        matchingHtml += `<div class="exercise-item">
          <span>${esc(ex.name)}</span>
          <button class="btn btn-icon btn-sm" title="Delete" onclick="deleteExercise('${esc(group)}','${esc(ex.name)}')">🗑️</button>
        </div>`;
      });
      matchingHtml += '</div>';
    }
    if (filter && count === 0) return; // Skip group if no matches

    html += `<div class="muscle-group">
      <div class="muscle-group-header" onclick="this.nextElementSibling.classList.toggle('open')">
        <span>${esc(group)}</span>
        <span style="color:var(--text-dim);font-size:13px">${count} exercises</span>
      </div>
      <div class="muscle-group-body">${matchingHtml}</div>
    </div>`;
  });
  container.innerHTML = html || '<p style="color:var(--text-dim)">No matching exercises.</p>';
}

function filterExercises() {
  const q = document.getElementById('exSearch').value.toLowerCase();
  renderExercisesList(exercisesCache, q);
  // Auto-open groups when filtering
  if (q) document.querySelectorAll('.muscle-group-body').forEach(el => el.classList.add('open'));
}

function showAddExerciseModal() {
  const groups = Object.keys(exercisesCache);
  const opts = groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
  showModal('Add Exercise', `
    <div class="form-group">
      <label>Muscle Group</label>
      <select id="mExGroup">${opts}</select>
    </div>
    <div class="form-group">
      <label>Exercise Name</label>
      <input type="text" id="mExName" placeholder="e.g. Incline Cable Fly">
    </div>
    <div class="form-group">
      <label>Equipment</label>
      <input type="text" id="mExEquip" placeholder="e.g. Cable, Dumbbell, Barbell">
    </div>
  `, [
    {label: 'Cancel', cls: 'btn-secondary', onclick: closeModal},
    {label: 'Add', cls: 'btn-primary', onclick: addExercise},
  ]);
}

async function addExercise() {
  const group = document.getElementById('mExGroup').value;
  const name = document.getElementById('mExName').value.trim();
  const equipment = document.getElementById('mExEquip').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  try {
    const r = await authFetch(`${API}/api/admin/exercises/${encodeURIComponent(group)}`, {
      method: 'POST', body: JSON.stringify({name, equipment}),
    });
    if (!r.ok) { const d = await r.json(); toast(d.detail || 'Failed', 'error'); return; }
    toast('Exercise added');
    closeModal();
    await loadExercises();
  } catch (e) {
    if (e.message !== 'auth_expired') toast('Error adding exercise', 'error');
  }
}

async function deleteExercise(group, name) {
  if (!confirm(`Delete "${name}" from ${group}?`)) return;
  try {
    const r = await authFetch(`${API}/api/admin/exercises/${encodeURIComponent(group)}/${encodeURIComponent(name)}`, {method: 'DELETE'});
    if (!r.ok) { const d = await r.json(); toast(d.detail || 'Failed', 'error'); return; }
    toast('Exercise deleted');
    await loadExercises();
  } catch (e) {
    if (e.message !== 'auth_expired') toast('Error deleting', 'error');
  }
}


// ══════════════════════════════════════════════════════════════════
// IMPORT CSV PAGE
// ══════════════════════════════════════════════════════════════════

function renderImport(mc) {
  mc.innerHTML = `<div class="page-title"><span class="icon">📥</span> Import CSV</div>
    <div class="card">
      <p style="color:var(--text-dim);margin-bottom:16px">Upload a program CSV file. It will replace the current program.csv and rebuild program.json.</p>
      <p style="color:var(--text-dim);margin-bottom:16px;font-size:13px">Required columns: Program, Week, Day, Order, Exercise, Sets, Reps, Tempo, Rest, RPE, Instruction</p>
      <div class="drop-zone" id="dropZone" onclick="document.getElementById('csvFileInput').click()"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="event.preventDefault();this.classList.remove('dragover');handleCSVDrop(event)">
        <p style="font-size:32px;margin-bottom:8px">📄</p>
        <p>Drop CSV file here or click to browse</p>
      </div>
      <input type="file" id="csvFileInput" accept=".csv" style="display:none" onchange="handleCSVSelect(event)">
      <div id="importResult" style="margin-top:16px"></div>
    </div>`;
}

function handleCSVDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) uploadCSV(file);
}

function handleCSVSelect(event) {
  const file = event.target.files[0];
  if (file) uploadCSV(file);
}

async function uploadCSV(file) {
  const result = document.getElementById('importResult');
  result.innerHTML = '<p style="color:var(--text-dim)">Uploading and building...</p>';
  const formData = new FormData();
  formData.append('file', file);
  try {
    const r = await authFetch(`${API}/api/admin/import-csv`, {
      method: 'POST',
      body: formData,
      headers: {'Authorization': `Bearer ${accessToken}`}, // Override: no Content-Type for FormData
    });
    const d = await r.json();
    if (!r.ok) {
      result.innerHTML = `<p style="color:#dc2626">Import failed: ${esc(d.detail || 'Unknown error')}</p>`;
      return;
    }
    result.innerHTML = `<div style="color:var(--green);margin-bottom:8px">✓ Import successful!</div>
      <pre style="background:var(--input-bg);padding:12px;border-radius:8px;font-size:12px;color:var(--text-dim);overflow-x:auto">${esc(d.output || '')}</pre>`;
    toast('CSV imported & built');
  } catch (e) {
    if (e.message !== 'auth_expired')
      result.innerHTML = '<p style="color:#dc2626">Upload failed. Check server connection.</p>';
  }
}


// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function css(s) {
  return String(s).replace(/[^a-zA-Z0-9]/g, '_');
}


// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════

(function init() {
  getStoredTokens();
  // Read page from hash
  const hash = window.location.hash.replace('#', '');
  if (hash) currentPage = hash;

  if (accessToken) {
    // Verify token is still valid
    authFetch(`${API}/api/health`).then(r => {
      if (r.ok) showApp();
      else { clearTokens(); showLogin(); }
    }).catch(() => { clearTokens(); showLogin(); });
  } else {
    showLogin();
  }

  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (h && h !== currentPage) navigate(h);
  });
})();
