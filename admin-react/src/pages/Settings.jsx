import React, { useState, useEffect } from 'react'
import { Icon } from '../components/Icons'

export default function Settings() {
  const [theme, setTheme] = useState(() => localStorage.getItem('admin-theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('admin-theme', theme)
  }, [theme])

  return (
    <div>
      <div className="page-title"><Icon name="settings" size={22} style={{ color: 'var(--accent2)' }} /> Settings</div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Appearance</h3>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div
            onClick={() => setTheme('dark')}
            style={{
              flex: 1, padding: 20, borderRadius: 14, cursor: 'pointer',
              background: theme === 'dark' ? 'rgba(124,110,240,0.15)' : 'var(--surface2)',
              border: `1px solid ${theme === 'dark' ? 'rgba(124,110,240,0.45)' : 'var(--glass-border)'}`,
              textAlign: 'center', transition: 'all 0.2s',
            }}
          >
            <div style={{ width: 60, height: 40, borderRadius: 8, background: '#080810', border: '1px solid rgba(255,255,255,0.1)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 30, height: 4, borderRadius: 2, background: 'rgba(167,139,250,0.5)' }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme === 'dark' ? 'var(--accent2)' : 'var(--text-dim)' }}>Dark</div>
          </div>

          <div
            onClick={() => setTheme('light')}
            style={{
              flex: 1, padding: 20, borderRadius: 14, cursor: 'pointer',
              background: theme === 'light' ? 'rgba(124,110,240,0.15)' : 'var(--surface2)',
              border: `1px solid ${theme === 'light' ? 'rgba(124,110,240,0.45)' : 'var(--glass-border)'}`,
              textAlign: 'center', transition: 'all 0.2s',
            }}
          >
            <div style={{ width: 60, height: 40, borderRadius: 8, background: '#f5f5f8', border: '1px solid rgba(0,0,0,0.1)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 30, height: 4, borderRadius: 2, background: 'rgba(100,80,200,0.5)' }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: theme === 'light' ? 'var(--accent2)' : 'var(--text-dim)' }}>Light</div>
          </div>
        </div>
      </div>
    </div>
  )
}
