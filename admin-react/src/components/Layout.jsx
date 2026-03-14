import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { Icon, LogoIcon } from './Icons'

const mainPages = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'programs', icon: 'programs', label: 'Programs' },
]

const toolPages = []

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const [resetKey, setResetKey] = useState(0)
  const currentPath = location.pathname.replace('/admin/', '').replace('/admin', '') || 'dashboard'

  function handleNav(pageId) {
    if (currentPath === pageId) {
      // Already on this page — force remount to reset to default view
      setResetKey(k => k + 1)
    } else {
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
        <Outlet key={resetKey} />
      </main>
    </div>
  )
}
