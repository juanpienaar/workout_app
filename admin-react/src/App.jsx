import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { configureApi } from './api'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Programs from './pages/Programs'

function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')

  async function doLogin() {
    setError('')
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.detail || 'Login failed'); return }
      if (d.role !== 'coach') { setError('Coach access required'); return }
      login(d.access_token, d.refresh_token, d.user_name, d.role)
    } catch { setError('Could not connect to server') }
  }

  return (
    <div className="login-overlay">
      <div className="login-box">
        <h2>NumNum Admin</h2>
        <p className="sub">Coach Dashboard</p>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@numnum.fit" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Password"
            onKeyDown={e => { if (e.key === 'Enter') doLogin() }} />
        </div>
        {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={doLogin}>Sign In</button>
      </div>
    </div>
  )
}

function AppInner() {
  const { token, ready, logout, refreshAccessToken } = useAuth()

  useEffect(() => {
    configureApi({
      getTokenFn: () => localStorage.getItem('nn_access_token'),
      onExpired: logout,
      refreshToken: refreshAccessToken,
    })
  }, [logout, refreshAccessToken])

  if (!ready) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-dim)' }}>Loading...</div>
  if (!token) return <LoginPage />

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="programs" element={<Programs />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </AuthProvider>
  )
}
