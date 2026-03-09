import React, { useState, useEffect } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import { Icon } from '../components/Icons'

export default function Users() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | {mode: 'add'|'edit', user: {...}}
  const [programs, setPrograms] = useState([])
  const [form, setForm] = useState({})

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
      <div className="page-title"><Icon name="users" size={22} style={{ color: 'var(--accent2)' }} /> Users</div>
      <div className="toolbar">
        <input type="search" className="search-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Program</th><th>Start Date</th><th>Role</th><th>Verified</th><th></th></tr></thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.username}>
              <td><strong>{u.username}</strong></td>
              <td style={{ color: 'var(--text-dim)' }}>{u.email}</td>
              <td>{u.program || '—'}</td>
              <td style={{ color: 'var(--text-dim)' }}>{u.startDate || '—'}</td>
              <td><span className={`badge ${u.role === 'coach' ? 'badge-coach' : 'badge-athlete'}`}>{u.role}</span></td>
              <td>{u.email_verified ? '✓' : '—'}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="btn-icon" onClick={() => openEdit(u)}>✏️</button>
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
    </div>
  )
}
