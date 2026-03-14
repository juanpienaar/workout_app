import React, { useState, useEffect } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import { Icon } from '../components/Icons'
import Modal from '../components/Modal'
import HelpTip from '../components/HelpTip'

export default function Messages() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [workoutDays, setWorkoutDays] = useState([])
  const [loading, setLoading] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [form, setForm] = useState({ message: '', day_key: '', source: 'coach', send_whatsapp: false })
  const [sending, setSending] = useState(false)

  useEffect(() => {
    API.listUsers().then(u => {
      const athletes = (u.users || []).filter(v => v.role !== 'coach').map(v => ({ name: v.username, ...v }))
      setUsers(athletes)
    }).catch(() => toast('Failed to load users', 'error'))
  }, [])

  async function selectUser(name) {
    setSelectedUser(name)
    setLoading(true)
    try {
      const [msgs, userData] = await Promise.all([
        API.getMessages(name),
        API.getUserData(name),
      ])
      setMessages(msgs || [])
      // Extract workout day keys for linking
      const logs = userData?.workout_logs || {}
      const days = Object.entries(logs).map(([key, val]) => ({
        key,
        label: val.meta?.label || key.replace('_', ' '),
        date: val.meta?.date || '',
        week: val.meta?.week || 0,
        day: val.meta?.day || 0,
      })).sort((a, b) => {
        if (a.week !== b.week) return b.week - a.week
        return b.day - a.day
      })
      setWorkoutDays(days)
    } catch { toast('Failed to load messages', 'error') }
    setLoading(false)
  }

  async function sendMessage() {
    if (!form.message.trim()) { toast('Enter a message', 'error'); return }
    setSending(true)
    try {
      const r = await API.sendMessage(selectedUser, form)
      if (r.ok) {
        toast(r.whatsapp_sent ? 'Sent (+ WhatsApp)' : 'Message sent')
        setMessages(prev => [...prev, r.message])
        setForm({ message: '', day_key: '', source: 'coach', send_whatsapp: false })
        setComposeOpen(false)
      } else {
        toast('Send failed', 'error')
      }
    } catch { toast('Send failed', 'error') }
    setSending(false)
  }

  async function deleteMsg(msgId) {
    if (!confirm('Delete this message?')) return
    try {
      await API.deleteMessage(selectedUser, msgId)
      setMessages(prev => prev.filter(m => m.id !== msgId))
      toast('Deleted')
    } catch { toast('Delete failed', 'error') }
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div>
      <div className="page-title"><Icon name="messages" size={22} style={{ color: 'var(--accent2)' }} /> Messages <HelpTip text="Send workout comments and coaching notes to athletes. Messages appear as popups in their app. Optionally send via WhatsApp too." /></div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, minHeight: 400 }}>
        {/* User list */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)', fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Athletes</div>
          {users.map(u => (
            <div key={u.name} onClick={() => selectUser(u.name)}
              style={{
                padding: '10px 16px', cursor: 'pointer', fontSize: 14,
                background: selectedUser === u.name ? 'rgba(124,110,240,0.1)' : 'transparent',
                borderLeft: selectedUser === u.name ? '3px solid var(--accent)' : '3px solid transparent',
                color: selectedUser === u.name ? 'var(--accent2)' : 'var(--text)',
              }}>
              {u.name}
            </div>
          ))}
          {users.length === 0 && <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>No athletes found</div>}
        </div>

        {/* Message area */}
        <div className="card">
          {!selectedUser && <p style={{ color: 'var(--text-dim)' }}>Select an athlete to view and send messages.</p>}
          {selectedUser && (
            <>
              <div className="card-header">
                <h3>{selectedUser}</h3>
                <button className="btn btn-primary btn-sm" onClick={() => { setForm({ message: '', day_key: '', source: 'coach', send_whatsapp: false }); setComposeOpen(true) }}>+ New Message</button>
              </div>

              {loading ? <p style={{ color: 'var(--text-dim)' }}>Loading...</p> : (
                <>
                  {messages.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No messages yet.</p>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
                    {[...messages].reverse().map(msg => (
                      <div key={msg.id} style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: 'var(--input-bg)',
                        borderLeft: `3px solid ${msg.source === 'agent' ? 'var(--accent)' : 'var(--green)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                            <span style={{
                              display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, marginRight: 6,
                              background: msg.source === 'agent' ? 'rgba(124,110,240,0.15)' : 'rgba(52,211,153,0.15)',
                              color: msg.source === 'agent' ? 'var(--accent2)' : 'var(--green)',
                            }}>{msg.source === 'agent' ? 'AGENT' : 'COACH'}</span>
                            {formatDate(msg.sent_at)}
                            {msg.day_key && <span style={{ marginLeft: 8, color: 'var(--accent2)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{display:'inline',verticalAlign:'middle',marginRight:'4px'}}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>{msg.day_key.replace('_', ' ')}</span>}
                            {!msg.read && <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 600 }}>● Unread</span>}
                          </div>
                          <button className="btn-icon" onClick={() => deleteMsg(msg.id)} style={{ fontSize: 12 }}><Icon name="delete" size={12} /></button>
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <Modal title={`Message ${selectedUser}`} onClose={() => setComposeOpen(false)} actions={[
          { label: 'Cancel', cls: 'btn-secondary', onClick: () => setComposeOpen(false) },
          { label: sending ? 'Sending...' : 'Send', cls: 'btn-primary', onClick: sendMessage },
        ]}>
          <div className="form-group">
            <label>Link to Workout (optional)</label>
            <select value={form.day_key} onChange={e => setForm({ ...form, day_key: e.target.value })}>
              <option value="">— General message —</option>
              {workoutDays.map(d => (
                <option key={d.key} value={d.key}>Week {d.week} Day {d.day}{d.date ? ` (${d.date})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Source</label>
            <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
              <option value="coach">Coach</option>
              <option value="agent">Agent / AI</option>
            </select>
          </div>
          <div className="form-group">
            <label>Message</label>
            <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
              rows={5} placeholder="Great session today! Watch your tempo on the bench press — try to slow down the eccentric phase."
              style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input type="checkbox" id="sendWA" checked={form.send_whatsapp} onChange={e => setForm({ ...form, send_whatsapp: e.target.checked })} />
            <label htmlFor="sendWA" style={{ fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>Also send via WhatsApp <HelpTip text="Requires Twilio WhatsApp configuration and the athlete's phone number in their profile." /></label>
          </div>
        </Modal>
      )}
    </div>
  )
}
