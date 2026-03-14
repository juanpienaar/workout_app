import React, { useState, useEffect } from 'react'
import { Icon } from '../components/Icons'
import { API } from '../api'

export default function Settings() {
  const [theme, setTheme] = useState(() => localStorage.getItem('admin-theme') || 'dark')
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [copied, setCopied] = useState(false)

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

  function formatLogsText() {
    return logs.map(log => {
      const ts = new Date(log.timestamp).toLocaleString()
      let line = `[${ts}] ${log.type} | ${log.status} | ${log.message}`
      if (log.details) {
        line += '\n' + JSON.stringify(log.details, null, 2)
      }
      return line
    }).join('\n\n---\n\n')
  }

  function copyLogs() {
    navigator.clipboard.writeText(formatLogsText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={copyLogs} disabled={logs.length === 0}
              style={{ fontSize: 12, padding: '6px 14px' }}>
              {copied ? 'Copied!' : 'Copy All'}
            </button>
            <button className="btn btn-secondary" onClick={loadLogs} disabled={logsLoading}
              style={{ fontSize: 12, padding: '6px 14px' }}>
              {logsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {logs.length === 0 && !logsLoading && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic' }}>No logs yet.</div>
        )}

        {logs.length > 0 && (
          <pre style={{
            padding: 14, background: 'var(--surface2)', borderRadius: 10,
            border: '1px solid var(--glass-border)',
            fontSize: 11, overflow: 'auto', maxHeight: 600,
            color: 'var(--text)', fontFamily: "'Space Mono', monospace",
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6,
          }}>
            {formatLogsText()}
          </pre>
        )}
      </div>
    </div>
  )
}
