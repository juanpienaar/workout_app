import React, { useState, useEffect } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import { Icon } from '../components/Icons'
import HelpTip from '../components/HelpTip'

/* ── Target Weights Modal ────────────────────────────────── */
function TargetWeightsModal({ username, onClose }) {
  const toast = useToast()
  const [weights, setWeights] = useState({})      // {exerciseName: {set1: kg, set2: kg, ...}}
  const [exercises, setExercises] = useState([])   // [{name, sets}] from program
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newRow, setNewRow] = useState({ name: '', sets: 3 })
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        // Load target weights + user data (to get program exercises)
        const [tw, userData] = await Promise.all([
          API.getTargetWeights(username),
          API.getUserData(username),
        ])
        setWeights(tw.target_weights || {})

        // Extract exercises from workout_logs or program
        const exerciseNames = new Set()
        const exerciseSets = {}

        // From workout_logs (actual data)
        const logs = userData.workout_logs || {}
        for (const dayData of Object.values(logs)) {
          for (const [key, val] of Object.entries(dayData)) {
            if (key.startsWith('_') || key === 'date') continue
            // Keys look like "A1_Bench Press" or exercise names
            const name = key.includes('_') ? key.split('_').slice(1).join('_') : key
            if (!name) continue
            exerciseNames.add(name)
            // Count sets from data
            const setCount = Object.keys(val).filter(k => k.startsWith('set')).length
            if (!exerciseSets[name] || setCount > exerciseSets[name]) {
              exerciseSets[name] = setCount
            }
          }
        }

        // Also include any exercises already in target weights
        for (const [name, setData] of Object.entries(tw.target_weights || {})) {
          exerciseNames.add(name)
          const setCount = Object.keys(setData).filter(k => k.startsWith('set')).length
          if (!exerciseSets[name] || setCount > exerciseSets[name]) {
            exerciseSets[name] = setCount
          }
        }

        const exList = [...exerciseNames].sort().map(name => ({
          name,
          sets: exerciseSets[name] || 3,
        }))
        setExercises(exList)
      } catch {
        toast('Failed to load data', 'error')
      }
      setLoading(false)
    })()
  }, [username])

  function updateWeight(exName, setKey, value) {
    setWeights(prev => {
      const updated = { ...prev }
      if (!updated[exName]) updated[exName] = {}
      updated[exName] = { ...updated[exName] }
      if (value === '' || value === null) {
        delete updated[exName][setKey]
        if (Object.keys(updated[exName]).length === 0) delete updated[exName]
      } else {
        updated[exName][setKey] = parseFloat(value) || 0
      }
      return updated
    })
  }

  function addExercise() {
    if (!newRow.name.trim()) return
    const name = newRow.name.trim()
    if (exercises.some(e => e.name === name)) {
      toast('Exercise already listed', 'error')
      return
    }
    setExercises(prev => [...prev, { name, sets: newRow.sets }])
    setNewRow({ name: '', sets: 3 })
    setShowAdd(false)
  }

  function removeExercise(name) {
    setExercises(prev => prev.filter(e => e.name !== name))
    setWeights(prev => {
      const updated = { ...prev }
      delete updated[name]
      return updated
    })
  }

  async function save() {
    setSaving(true)
    try {
      await API.setTargetWeights(username, weights)
      toast('Target weights saved')
      onClose()
    } catch {
      toast('Save failed', 'error')
    }
    setSaving(false)
  }

  // Exercises that have weights set (show first) vs empty
  const withWeights = exercises.filter(e => weights[e.name] && Object.keys(weights[e.name]).length > 0)
  const withoutWeights = exercises.filter(e => !weights[e.name] || Object.keys(weights[e.name]).length === 0)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 600, maxWidth: '95vw' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2"><path d="M6.5 6.5h11M6.5 17.5h11M2 10v4M22 10v4M4 8v8M20 8v8"/></svg> Target Weights — {username}
        </h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 16 }}>
          Set target weights per exercise. Athletes see these as pre-filled values in lavender until they log their own weights.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading...</div>
        ) : exercises.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>
            No exercises found. The athlete needs to sync workout data first, or you can add exercises manually.
          </div>
        ) : (
          <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: 12 }}>
            {[...withWeights, ...withoutWeights].map(ex => {
              const exWeights = weights[ex.name] || {}
              const maxSets = Math.max(ex.sets, ...Object.keys(exWeights).filter(k => k.startsWith('set')).map(k => parseInt(k.replace('set', '')) || 0))
              return (
                <div key={ex.name} style={{
                  marginBottom: 8, padding: '10px 12px',
                  background: 'var(--surface2)', borderRadius: 10,
                  border: '1px solid var(--glass-border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</span>
                    <button className="btn-icon" style={{ fontSize: 12 }} onClick={() => removeExercise(ex.name)}>
                      <Icon name="delete" size={12} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Array.from({ length: maxSets }, (_, i) => i + 1).map(s => (
                      <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 9, color: 'var(--muted2)', fontFamily: "'Space Mono', monospace" }}>SET {s}</span>
                        <input
                          type="number"
                          value={exWeights[`set${s}`] ?? ''}
                          onChange={e => updateWeight(ex.name, `set${s}`, e.target.value)}
                          placeholder="—"
                          style={{
                            width: 56, padding: '5px 4px', textAlign: 'center',
                            background: 'var(--input-bg)', border: '1px solid var(--glass-border)',
                            borderRadius: 6, color: 'var(--text)', fontSize: 13,
                            fontFamily: "'Space Mono', monospace",
                          }}
                        />
                        <span style={{ fontSize: 8, color: 'var(--muted2)' }}>kg</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add exercise row */}
        {showAdd ? (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12,
            padding: 10, background: 'var(--surface)', borderRadius: 10,
            border: '1px solid var(--glass-border)',
          }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>Exercise Name</label>
              <input type="text" value={newRow.name} onChange={e => setNewRow({ ...newRow, name: e.target.value })}
                placeholder="e.g. Bench Press" style={{ width: '100%', padding: '7px 10px' }}
                onKeyDown={e => e.key === 'Enter' && addExercise()} />
            </div>
            <div style={{ width: 64 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>Sets</label>
              <input type="number" value={newRow.sets} onChange={e => setNewRow({ ...newRow, sets: parseInt(e.target.value) || 3 })}
                min={1} max={20} style={{ width: '100%', padding: '7px 4px', textAlign: 'center' }} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={addExercise}>Add</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ marginBottom: 12 }} onClick={() => setShowAdd(true)}>
            + Add Exercise
          </button>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Weights'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Users Page ──────────────────────────────────────────── */
export default function Users() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | {mode: 'add'|'edit', user: {...}}
  const [programs, setPrograms] = useState([])
  const [form, setForm] = useState({})
  const [twUser, setTwUser] = useState(null) // username for target weights modal

  const load = async () => {
    try {
      const [ud, pd] = await Promise.all([API.listUsers(), API.listPrograms()])
      setUsers(ud.users)
      setPrograms(pd.programs.map(p => p.name))
    } catch { toast('Failed to load', 'error') }
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() {
    setForm({ username: '', email: '', password: '', program: '', startDate: '', role: 'athlete' })
    setModal({ mode: 'add' })
  }

  function openEdit(u) {
    setForm({ ...u, password: '' })
    setModal({ mode: 'edit', user: u })
  }

  async function save() {
    try {
      if (modal.mode === 'add') {
        if (!form.username || !form.email || !form.password) { toast('Fill required fields', 'error'); return }
        await API.createUser(form)
        toast('User created')
      } else {
        const body = { email: form.email, program: form.program, startDate: form.startDate, role: form.role }
        if (form.password) body.password = form.password
        await API.updateUser(modal.user.username, body)
        toast('User updated')
      }
      setModal(null)
      load()
    } catch { toast('Save failed', 'error') }
  }

  async function remove(username) {
    if (!confirm(`Delete "${username}"? This cannot be undone.`)) return
    try { await API.deleteUser(username); toast('Deleted'); load() }
    catch { toast('Delete failed', 'error') }
  }

  return (
    <div>
      <div className="page-title"><Icon name="users" size={22} style={{ color: 'var(--accent2)' }} /> Users <HelpTip text="Manage athletes and coaches. Assign programs, set start dates, and configure target weights for athletes." /></div>
      <div className="toolbar">
        <input type="search" className="search-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Program <HelpTip text="Assigned training program. Athletes without a program won't see any workouts." /></th><th>Start Date</th><th>Role <HelpTip text="Coaches can access this admin dashboard. Athletes can only use the workout app." /></th><th>Verified</th><th></th></tr></thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.username}>
              <td><strong>{u.username}</strong></td>
              <td style={{ color: 'var(--text-dim)' }}>{u.email}</td>
              <td>{u.program || '—'}</td>
              <td style={{ color: 'var(--text-dim)' }}>{u.startDate || '—'}</td>
              <td><span className={`badge ${u.role === 'coach' ? 'badge-coach' : 'badge-athlete'}`}>{u.role}</span></td>
              <td>{u.email_verified ? '✓' : '—'}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {u.role === 'athlete' && (
                  <button className="btn-icon" title="Target weights" onClick={() => setTwUser(u.username)}
                    style={{ fontSize: 14 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.5 6.5h11M6.5 17.5h11M2 10v4M22 10v4M4 8v8M20 8v8"/></svg></button>
                )}
                <button className="btn-icon" onClick={() => openEdit(u)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button className="btn-icon" onClick={() => remove(u.username)}><Icon name="delete" size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add User' : 'Edit User'}
          onClose={() => setModal(null)}
          actions={[
            { label: 'Cancel', cls: 'btn-secondary', onClick: () => setModal(null) },
            { label: modal.mode === 'add' ? 'Create' : 'Save', cls: 'btn-primary', onClick: save },
          ]}
        >
          <div className="form-group">
            <label>Username</label>
            <input type="text" value={form.username || ''} disabled={modal.mode === 'edit'} onChange={e => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>{modal.mode === 'edit' ? 'New Password (leave blank to keep)' : 'Password'}</label>
            <input type="password" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Program</label>
            <select value={form.program || ''} onChange={e => setForm({ ...form, program: e.target.value })}>
              <option value="">None</option>
              {programs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Role</label>
            <select value={form.role || 'athlete'} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="athlete">Athlete</option>
              <option value="coach">Coach</option>
            </select>
          </div>
        </Modal>
      )}

      {twUser && <TargetWeightsModal username={twUser} onClose={() => setTwUser(null)} />}
    </div>
  )
}
