/* Centralized API client with JWT auth */

let getToken = () => localStorage.getItem('nn_access_token')
let onAuthExpired = () => {}
let refreshFn = async () => false

export function configureApi({ getTokenFn, onExpired, refreshToken }) {
  if (getTokenFn) getToken = getTokenFn
  if (onExpired) onAuthExpired = onExpired
  if (refreshToken) refreshFn = refreshToken
}

export async function authFetch(url, opts = {}) {
  const headers = { ...opts.headers }
  headers['Authorization'] = `Bearer ${getToken()}`
  if (!(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  // Remove Content-Type for FormData (browser sets boundary)
  if (opts.body instanceof FormData) delete headers['Content-Type']

  let r = await fetch(url, { ...opts, headers })
  if (r.status === 401) {
    const newToken = await refreshFn()
    if (newToken) {
      headers['Authorization'] = `Bearer ${typeof newToken === 'string' ? newToken : getToken()}`
      r = await fetch(url, { ...opts, headers })
    } else {
      onAuthExpired()
      throw new Error('auth_expired')
    }
  }
  return r
}

export const API = {
  // Users
  listUsers: () => authFetch('/api/admin/users').then(r => r.json()),
  createUser: (data) => authFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  updateUser: (name, data) => authFetch(`/api/admin/users/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  deleteUser: (name) => authFetch(`/api/admin/users/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(r => r.json()),
  getUserData: (name) => authFetch(`/api/admin/users/${encodeURIComponent(name)}/data`).then(r => r.json()),
  getUserMetrics: (name) => authFetch(`/api/admin/users/${encodeURIComponent(name)}/metrics`).then(r => r.json()),
  getTargetWeights: (name) => authFetch(`/api/admin/users/${encodeURIComponent(name)}/target-weights`).then(r => r.json()),
  setTargetWeights: (name, weights) => authFetch(`/api/admin/users/${encodeURIComponent(name)}/target-weights`, { method: 'PUT', body: JSON.stringify({ target_weights: weights }) }).then(r => r.json()),

  // Programs
  listPrograms: () => authFetch('/api/admin/programs').then(r => r.json()),
  getProgram: (name) => authFetch(`/api/admin/programs/${encodeURIComponent(name)}`).then(r => r.json()),
  updateProgram: (name, data) => authFetch(`/api/admin/programs/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  createProgram: (data) => authFetch('/api/admin/programs', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  deleteProgram: (name) => authFetch(`/api/admin/programs/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(r => r.json()),
  duplicateProgram: (name, newName) => authFetch(`/api/admin/programs/${encodeURIComponent(name)}/duplicate`, { method: 'POST', body: JSON.stringify({ new_name: newName }) }).then(r => r.json()),
  assignProgram: (data) => authFetch('/api/admin/assign-program', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),

  // Exercises
  getExercises: () => authFetch('/api/admin/exercises').then(r => r.json()),
  updateExercises: (data) => authFetch('/api/admin/exercises', { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),
  addExercise: (group, item) => authFetch(`/api/admin/exercises/${encodeURIComponent(group)}`, { method: 'POST', body: JSON.stringify(item) }).then(r => r.json()),
  deleteExercise: (group, name) => authFetch(`/api/admin/exercises/${encodeURIComponent(group)}/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(r => r.json()),

  // Messages
  getMessages: (name) => authFetch(`/api/admin/users/${encodeURIComponent(name)}/messages`).then(r => r.json()),
  sendMessage: (name, data) => authFetch(`/api/admin/users/${encodeURIComponent(name)}/messages`, { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  deleteMessage: (name, msgId) => authFetch(`/api/admin/users/${encodeURIComponent(name)}/messages/${encodeURIComponent(msgId)}`, { method: 'DELETE' }).then(r => r.json()),

  // Build / Import
  build: () => authFetch('/api/admin/build', { method: 'POST' }).then(r => r.json()),
  importCSV: (file) => {
    const fd = new FormData(); fd.append('file', file)
    return authFetch('/api/admin/import-csv', { method: 'POST', body: fd }).then(r => r.json())
  },
  aiTransformCSV: (file) => {
    const fd = new FormData(); fd.append('file', file)
    return authFetch('/api/admin/ai/transform-csv', { method: 'POST', body: fd }).then(r => r.json())
  },
  importTransformedCSV: (csvContent) => {
    return authFetch('/api/admin/import-transformed-csv', { method: 'POST', body: JSON.stringify({ csv: csvContent }) }).then(r => r.json())
  },

  // Coach Settings
  getCoachSettings: () => authFetch('/api/admin/coach-settings').then(r => r.json()),
  updateCoachSettings: (data) => authFetch('/api/admin/coach-settings', { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json()),

  // AI Builder
  generateProgram: (config, timeoutMs = 300000) => {
    const opts = { method: 'POST', body: JSON.stringify(config) }
    if (timeoutMs && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(timeoutMs)
    }
    return authFetch('/api/admin/ai/generate', opts).then(r => r.json())
  },
  modifyProgram: (data, timeoutMs = 300000) => {
    const opts = { method: 'POST', body: JSON.stringify(data) }
    if (timeoutMs && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(timeoutMs)
    }
    return authFetch('/api/admin/ai/modify-program', opts).then(r => r.json())
  },
  getCosts: () => authFetch('/api/admin/ai/costs').then(r => r.json()),

  // Day Plan Templates
  listTemplates: () => authFetch('/api/admin/dayplan-templates').then(r => r.json()),
  saveTemplate: (data) => authFetch('/api/admin/dayplan-templates', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  deleteTemplate: (name) => authFetch(`/api/admin/dayplan-templates/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(r => r.json()),

  // Deploy
  getDeployStatus: () => authFetch('/api/admin/deploy/status').then(r => r.json()),
  deploy: (msg) => authFetch('/api/admin/deploy', { method: 'POST', body: JSON.stringify({ commit_msg: msg }) }).then(r => r.json()),

  // Logs
  getLogs: (limit = 50, type = null) => authFetch(`/api/admin/logs?limit=${limit}${type ? `&type=${type}` : ''}`).then(r => r.json()),
}
