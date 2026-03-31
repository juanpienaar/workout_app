import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { Icon, LogoIcon } from './Icons'

const mainPages = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'programs', icon: 'programs', label: 'Programs' },
  { id: 'nutrition', icon: 'nutrition', label: 'Nutrition' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
]


export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const [resetKey, setResetKey] = useState(0)
  const [theme, setTheme] = useState(() => localStorage.getItem('admin-theme') || 'dark')
  const currentPath = location.pathname.replace(/^\//, '') || 'dashboard'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('admin-theme', theme)
  }, [theme])

  function handleNav(pageId) {
    if (currentPath === pageId) {
      // Already on this page — force remount to reset to default view
      setResetKey(k => k + 1)
    } else {
      // Navigate and also bump resetKey to ensure fresh mount at first tab
      setResetKey(k => k + 1)
      navigate(pageId)
    }
  }

  function renderNav(pages) {
    return pages.map(p => (
      <div
        key={p.id}
        className={`nav-item ${currentPath === p.id ? 'active' : ''}`}
        onClick={() => handleNav(p.id)}
      >
        <span className="icon"><Icon name={p.icon} /></span>
        <span className="nav-text">{p.label}</span>
      </div>
    ))
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <LogoIcon />
            <span className="logo-text">NumNum</span>
          </div>
          <div className="logo-sub">Coach Admin</div>
        </div>
        <div className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {renderNav(mainPages)}
        </div>
        <div className="sidebar-footer">
          <div className="nav-item" onClick={logout}>
            <span className="icon"><Icon name="logout" /></span>
            <span className="nav-text">Logout</span>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <button
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            position: 'fixed', top: 14, right: 18, zIndex: 100,
            background: 'var(--surface2)', border: '1px solid var(--glass-border)',
            borderRadius: 10, padding: '7px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text)', fontSize: 12, fontWeight: 500,
            backdropFilter: 'blur(12px)', transition: 'all 0.2s',
          }}
        >
          {theme === 'dark'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
        <Outlet key={resetKey} />
      </main>
    </div>
  )
}
