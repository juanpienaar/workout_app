import React, { useState, useEffect } from 'react'
import { Icon } from '../components/Icons'
import { API } from '../api'

export default function Settings() {
  const [theme, setTheme] = useState(() => localStorage.getItem('admin-theme') || 'dark')
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsExpanded, setLogsExpanded] = useState(new Set())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('admin-theme', theme)
  }, [theme])

  function loadLogs() {
    setLogsLoading(true)
    API.getLogs(50).then(d => {
      setLogs((d.logs || []).reverse())
      setLogsLoading(false)
    }).catch(() => setLogsLoading(false))
  }

  useEffect(() => { loadLogs() }, [])

  function toggleLog(idx) {
    setLogsExpanded(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const statusColor = (s) => {
    if (s === 'success' || s === 'api_complete') return 'var(--green)'
    if (s === 'error') return '#dc2626'
    if (s === 'started') return '#fbbf24'
    return 'var(--text-dim)'
  }

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

      {/* Logs */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>Activity Logs</h3>
          <button className="btn btn-secondary" onClick={loadLogs} disabled={logsLoading}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            {logsLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {logs.length === 0 && !logsLoading && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic' }}>No logs yet.</div>
        )}

        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {logs.map((log, idx) => (
            <div key={idx} style={{
              padding: '10px 14px', marginBottom: 6,
              background: 'var(--surface2)', borderRadius: 8,
              border: '1px solid var(--glass-border)',
              cursor: log.details ? 'pointer' : 'default',
            }} onClick={() => log.details && toggleLog(idx)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: statusColor(log.status),
                }} />
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Space Mono', monospace", minWidth: 130 }}>
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                  background: 'rgba(167,139,250,0.12)', color: 'var(--accent2)', textTransform: 'uppercase',
                }}>{log.type}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                  background: log.status === 'error' ? 'rgba(220,38,38,0.12)' : 'transparent',
                  color: statusColor(log.status),
                }}>{log.status}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{log.message}</span>
                {log.details && (
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{logsExpanded.has(idx) ? '−' : '+'}</span>
                )}
              </div>
              {logsExpanded.has(idx) && log.details && (
                <pre style={{
                  marginTop: 8, padding: 10, background: 'var(--surface)',
                  borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 300,
                  color: 'var(--text-dim)', fontFamily: "'Space Mono', monospace",
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
