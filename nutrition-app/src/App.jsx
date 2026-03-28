import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './auth'
import { configureApi } from './api'
import Login from './pages/Login'
import DailyLog from './pages/DailyLog'
import Recipes from './pages/Recipes'
import MealPlans from './pages/MealPlans'

function AppRoutes() {
  const { token, user, role, ready, logout, refreshAccessToken } = useAuth()

  useEffect(() => {
    configureApi({
      getTokenFn: () => localStorage.getItem('nn_access_token'),
      onExpired: logout,
      refreshToken: refreshAccessToken,
    })
  }, [logout, refreshAccessToken])

  if (!ready) return <div className="spinner" />

  if (!token) return <Login />

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1>NumNum Nutrition</h1>
        <button className="btn-ghost" onClick={logout} title="Logout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      <div className="app-content">
        <Routes>
          <Route path="/" element={<DailyLog />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/plans" element={<MealPlans />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      <nav className="bottom-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          Today
        </NavLink>
        <NavLink to="/recipes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          Recipes
        </NavLink>
        <NavLink to="/plans" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Plans
        </NavLink>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/nutrition">
      <AuthProvider>
        <Toaster position="top-center" toastOptions={{
          style: { background: '#1a1a2e', color: '#f0f0f8', border: '1px solid rgba(255,255,255,0.08)' },
        }} />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
