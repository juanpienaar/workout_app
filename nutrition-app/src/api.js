/* Nutrition API client with JWT auth */

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
  // Targets
  getTargets: (username) =>
    authFetch(`/api/nutrition/targets${username ? `?username=${encodeURIComponent(username)}` : ''}`).then(r => r.json()),
  setTargets: (username, targets) =>
    authFetch('/api/nutrition/targets', { method: 'POST', body: JSON.stringify({ username, targets }) }).then(r => r.json()),

  // Daily logs
  getDailyLog: (date, username) =>
    authFetch(`/api/nutrition/logs/${date}${username ? `?username=${encodeURIComponent(username)}` : ''}`).then(r => r.json()),
  addFoodEntry: (date, entry) =>
    authFetch(`/api/nutrition/logs/${date}`, { method: 'POST', body: JSON.stringify(entry) }).then(r => r.json()),
  updateFoodEntry: (date, entryId, entry) =>
    authFetch(`/api/nutrition/logs/${date}/${entryId}`, { method: 'PUT', body: JSON.stringify(entry) }).then(r => r.json()),
  deleteFoodEntry: (date, entryId) =>
    authFetch(`/api/nutrition/logs/${date}/${entryId}`, { method: 'DELETE' }).then(r => r.json()),
  getWeeklyLogs: (startDate, username) =>
    authFetch(`/api/nutrition/logs/week/${startDate}${username ? `?username=${encodeURIComponent(username)}` : ''}`).then(r => r.json()),

  // Food lookup
  searchFood: (query) =>
    authFetch('/api/nutrition/lookup/food', { method: 'POST', body: JSON.stringify({ query }) }).then(r => r.json()),
  recognizeText: (query) =>
    authFetch('/api/nutrition/lookup/text', { method: 'POST', body: JSON.stringify({ query }) }).then(r => r.json()),
  recognizePhoto: (file, description) => {
    const fd = new FormData()
    fd.append('file', file)
    if (description) fd.append('description', description)
    return authFetch('/api/nutrition/lookup/photo', { method: 'POST', body: fd }).then(r => r.json())
  },

  // Recipes
  listRecipes: (username) =>
    authFetch(`/api/nutrition/recipes${username ? `?username=${encodeURIComponent(username)}` : ''}`).then(r => r.json()),
  saveRecipe: (recipe) =>
    authFetch('/api/nutrition/recipes', { method: 'POST', body: JSON.stringify(recipe) }).then(r => r.json()),
  deleteRecipe: (id) =>
    authFetch(`/api/nutrition/recipes/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Meal plans
  listMealPlans: (username) =>
    authFetch(`/api/nutrition/meal-plans${username ? `?username=${encodeURIComponent(username)}` : ''}`).then(r => r.json()),
  generateMealPlan: (data) =>
    authFetch('/api/nutrition/meal-plans/generate', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  suggestRecipes: (data) =>
    authFetch('/api/nutrition/ai/suggest-recipes', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
  deleteMealPlan: (id) =>
    authFetch(`/api/nutrition/meal-plans/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Coach
  coachOverview: () =>
    authFetch('/api/nutrition/coach/overview').then(r => r.json()),
}
