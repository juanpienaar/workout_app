import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('nn_access_token'))
  const [refreshTk, setRefreshTk] = useState(() => localStorage.getItem('nn_refresh_token'))
  const [user, setUser] = useState(() => localStorage.getItem('nn_user'))
  const [role, setRole] = useState(() => localStorage.getItem('nn_role'))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (token) {
      localStorage.setItem('nn_access_token', token)
    } else {
      localStorage.removeItem('nn_access_token')
    }
  }, [token])

  useEffect(() => {
    if (refreshTk) localStorage.setItem('nn_refresh_token', refreshTk)
    else localStorage.removeItem('nn_refresh_token')
  }, [refreshTk])

  useEffect(() => {
    if (user) localStorage.setItem('nn_user', user)
    else localStorage.removeItem('nn_user')
    if (role) localStorage.setItem('nn_role', role)
    else localStorage.removeItem('nn_role')
  }, [user, role])

  // Verify token on mount
  useEffect(() => {
    if (!token) { setReady(true); return }
    fetch('/api/health', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); setReady(true) })
      .catch(() => { setToken(null); setRefreshTk(null); setUser(null); setRole(null); setReady(true) })
  }, [])

  const login = useCallback((accessToken, refreshToken, userName, userRole) => {
    setToken(accessToken)
    setRefreshTk(refreshToken)
    setUser(userName)
    setRole(userRole)
  }, [])

  const logout = useCallback(() => {
    setToken(null); setRefreshTk(null); setUser(null); setRole(null)
  }, [])

  const refreshAccessToken = useCallback(async () => {
    if (!refreshTk) return false
    try {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshTk }),
      })
      if (!r.ok) return false
      const d = await r.json()
      setToken(d.access_token)
      return d.access_token
    } catch { return false }
  }, [refreshTk])

  return (
    <AuthContext.Provider value={{ token, user, role, ready, login, logout, refreshAccessToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
