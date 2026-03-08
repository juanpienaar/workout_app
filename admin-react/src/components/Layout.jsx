import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

const pages = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'users', icon: '👥', label: 'Users' },
  { id: 'programs', icon: '📋', label: 'Programs' },
  { id: 'exercises', icon: '🏋️', label: 'Exercises' },
  { id: 'ai-builder', icon: '🤖', label: 'AI Builder' },
  { id: 'import', icon: '📥', label: 'Import CSV' },
  { id: 'deploy', icon: '🚀', label: 'Deploy' },
]

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuth()
  const currentPath = location.pathname.replace('/admin/', '').replace('/admin', '') || 'dashboard'

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <h2>NumNum</h2>
          <small>Coach Admin</small>
        </div>
        {pages.map((p, i) => (
          <React.Fragment key={p.id}>
            {(p.id === 'ai-builder' || p.id === 'deploy') && i > 0 && <div className="nav-divider" />}
            <div
              className={`nav-item ${currentPath === p.id ? 'active' : ''}`}
              onClick={() => navigate(p.id)}
            >
              <span className="icon">{p.icon}</span>
              <span className="nav-text">{p.label}</span>
            </div>
          </React.Fragment>
        ))}
        <div className="nav-divider" />
        <div className="nav-item" onClick={logout}>
          <span className="icon">🚪</span>
          <span className="nav-text">Logout</span>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
