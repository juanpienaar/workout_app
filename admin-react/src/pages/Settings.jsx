import React, { useState, useEffect } from 'react'
import { Icon } from '../components/Icons'
import { API } from '../api'


export default function Settings() {
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [copied, setCopied] = useState(false)

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
