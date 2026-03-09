import React, { useState, useEffect } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import { Icon } from '../components/Icons'

export default function Deploy() {
  const toast = useToast()
  const [status, setStatus] = useState(null)
  const [commitMsg, setCommitMsg] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [result, setResult] = useState(null)

  async function loadStatus() {
    try { setStatus(await API.getDeployStatus()) }
    catch { setStatus({ error: true }) }
  }

  useEffect(() => { loadStatus() }, [])

  async function doDeploy() {
    if (!commitMsg.trim()) { toast('Enter a commit message', 'error'); return }
    setDeploying(true); setResult(null)
    try {
      const d = await API.deploy(commitMsg.trim())
      if (d.ok) {
        setResult(d)
        toast('Deployed successfully!')
        setCommitMsg('')
        loadStatus()
      } else {
        toast(d.detail || 'Deploy failed', 'error')
      }
    } catch { toast('Deploy failed', 'error') }
    setDeploying(false)
  }

  return (
    <div>
      <div className="page-title"><Icon name="deploy" size={22} style={{ color: 'var(--accent2)' }} /> Deploy</div>

      <div className="card">
        <div className="card-header">
          <h3>Git Status</h3>
          <button className="btn btn-secondary btn-sm" onClick={loadStatus}>Refresh</button>
        </div>
        {!status && <p style={{ color: 'var(--text-dim)' }}>Loading...</p>}
        {status?.error && <p style={{ color: 'var(--text-dim)' }}>Could not read git status. Make sure this is a git repository.</p>}
        {status && !status.error && (
          <>
            {status.changed_files?.length > 0 ? (
              <>
                <p style={{ marginBottom: 8 }}>{status.changed_files.length} changed file(s):</p>
                <ul className="file-list">
                  {status.changed_files.map((f, i) => {
                    const s = f.charAt(0)
                    return (
                      <li key={i}>
                        <span className={`status-${s === 'M' ? 'm' : s === 'A' ? 'a' : s === 'D' ? 'd' : 'm'}`}>{s}</span>
                        <span>{f.slice(2).trim()}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p style={{ color: 'var(--green)' }}>✓ Working tree clean — nothing to deploy.</p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Deploy</h3>
        <p style={{ color: 'var(--text-dim)', marginBottom: 12, fontSize: 13 }}>
          This will run build.py, then git add, commit, and push.
        </p>
        <div className="form-group">
          <label>Commit Message</label>
          <input type="text" value={commitMsg} onChange={e => setCommitMsg(e.target.value)}
            placeholder="e.g. Update programs and exercises"
            onKeyDown={e => { if (e.key === 'Enter') doDeploy() }} />
        </div>
        <button className="btn btn-primary" onClick={doDeploy} disabled={deploying}>
          {deploying ? 'Deploying...' : 'Build & Deploy'}
        </button>

        {result && (
          <div style={{ marginTop: 16, padding: 12, background: 'var(--input-bg)', borderRadius: 8 }}>
            <div style={{ color: 'var(--green)', marginBottom: 4 }}>✓ Deployed successfully</div>
            {result.commit_hash && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Commit: {result.commit_hash}</div>}
            {result.output && <pre style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{result.output}</pre>}
          </div>
        )}
      </div>
    </div>
  )
}
