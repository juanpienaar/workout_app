import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { API } from '../api'
import { authFetch } from '../api'
import { useToast } from '../components/Toast'
import { Icon } from '../components/Icons'
import HelpTip from '../components/HelpTip'
import Modal from '../components/Modal'

/* ─── helpers ─────────────────────────────────────── */

function getWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - ((day + 6) % 7))
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { start: mon, end: sun }
}

/** Parse sets from the athlete app format: { set1: {weight, reps, done}, set2: ... } */
function parseSets(exData) {
  if (!exData || typeof exData !== 'object') return []
  // Handle array format
  if (Array.isArray(exData)) {
    return exData.map((s, i) => ({ num: i + 1, ...s }))
  }
  const sets = []
  for (const [k, v] of Object.entries(exData)) {
    if (k === 'notes') continue
    if (k.startsWith('set') && typeof v === 'object') {
      sets.push({ num: parseInt(k.replace('set', '')) || 0, ...v })
    }
  }
  return sets.sort((a, b) => a.num - b.num)
}

function isCardioExercise(name) {
  const lower = (name || '').toLowerCase()
  return /\b(run|running|jog|jogging|sprint|5k|10k|marathon|cycling|cycle|bike|biking|spin|swim|swimming|laps|freestyle|backstroke|breaststroke)\b/.test(lower)
}

function computeTonnage(exDataMap) {
  let tonnage = 0
  for (const [exName, exData] of Object.entries(exDataMap)) {
    if (isCardioExercise(exName)) continue
    const sets = parseSets(exData)
    for (const s of sets) {
      const w = parseFloat(s.weight) || 0
      const r = parseInt(s.reps) || parseInt(s.actualReps) || 0
      tonnage += w * r
    }
  }
  return Math.round(tonnage)
}

function computeWeekSummary(data) {
  if (!data?.workout_logs) return { sessions: 0, tonnage: 0, exercises: 0 }
  const { start, end } = getWeekRange()
  let sessions = 0, tonnage = 0, exercises = 0
  for (const [k, dayData] of Object.entries(data.workout_logs)) {
    if (k.startsWith('cardio_') || k.startsWith('skips_')) continue
    const dateStr = dayData.meta?.date || ''
    if (!dateStr) continue
    const d = new Date(dateStr + 'T00:00:00')
    if (d >= start && d <= end) {
      sessions++
      const exData = dayData.data || {}
      exercises += Object.keys(exData).length
      tonnage += computeTonnage(exData)
    }
  }
  return { sessions, tonnage, exercises }
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

function getCompletionPct(exDataMap) {
  let total = 0, done = 0
  for (const [, exData] of Object.entries(exDataMap)) {
    const sets = parseSets(exData)
    total += sets.length
    done += sets.filter(s => s.done).length
  }
  return total > 0 ? Math.round((done / total) * 100) : 0
}

function fmtTonnage(t) {
  return t > 1000 ? (t / 1000).toFixed(1) + 't' : t + 'kg'
}

/* ─── Target Weights Modal ────────────────────────────────── */
function TargetWeightsModal({ username, onClose }) {
  const toast = useToast()
  const [weights, setWeights] = useState({})
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newRow, setNewRow] = useState({ name: '', sets: 3 })
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [tw, userData] = await Promise.all([
          API.getTargetWeights(username),
          API.getUserData(username),
        ])
        setWeights(tw.target_weights || {})

        const exerciseNames = new Set()
        const exerciseSets = {}

        const logs = userData.workout_logs || {}
        for (const dayData of Object.values(logs)) {
          for (const [key, val] of Object.entries(dayData)) {
            if (key.startsWith('_') || key === 'date') continue
            const name = key.includes('_') ? key.split('_').slice(1).join('_') : key
            if (!name) continue
            exerciseNames.add(name)
            const setCount = Object.keys(val).filter(k => k.startsWith('set')).length
            if (!exerciseSets[name] || setCount > exerciseSets[name]) {
              exerciseSets[name] = setCount
            }
          }
        }

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

  const withWeights = exercises.filter(e => weights[e.name] && Object.keys(weights[e.name]).length > 0)
  const withoutWeights = exercises.filter(e => !weights[e.name] || Object.keys(weights[e.name]).length === 0)

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 600, maxWidth: '95vw' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🏋️</span> Target Weights — {username}
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

/* ─── Tab Component ─────────────────────────────────────── */
function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--glass-border)', marginBottom: 24 }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            color: activeTab === tab.id ? 'var(--accent2)' : 'var(--text-dim)',
            borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: activeTab === tab.id ? 600 : 400,
            transition: 'all 0.2s ease',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/* ─── main component ─────────────────────────────── */

export default function Dashboard() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('overview')
  const [users, setUsers] = useState([])
  const [userData, setUserData] = useState({})
  const [selected, setSelected] = useState(null)
  const [expandedDay, setExpandedDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [debugInfo, setDebugInfo] = useState(null)

  // Users tab state
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [programs, setPrograms] = useState([])
  const [form, setForm] = useState({})
  const [twUser, setTwUser] = useState(null)

  // Messages tab state
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [workoutDays, setWorkoutDays] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [msgForm, setMsgForm] = useState({ message: '', day_key: '', source: 'coach', send_whatsapp: false })
  const [sending, setSending] = useState(false)

  // Initial load for both Overview and Athletes tabs
  useEffect(() => {
    async function init() {
      try {
        const d = await API.listUsers()
        setUsers(d.users || [])
        const dataMap = {}
        await Promise.all(
          (d.users || []).map(async u => {
            try {
              const ud = await API.getUserData(u.username)
              dataMap[u.username] = ud
              const logCount = Object.keys(ud?.workout_logs || {}).length
              if (logCount > 0) console.log(`[Dashboard] ${u.username}: ${logCount} workout logs`)
            } catch (e) {
              console.warn(`[Dashboard] Failed to load ${u.username}:`, e)
            }
          })
        )
        setUserData(dataMap)
      } catch { toast('Failed to load users', 'error') }
      setLoading(false)
    }
    init()
  }, [])

  // Load programs for Athletes tab
  useEffect(() => {
    async function loadPrograms() {
      try {
        const pd = await API.listPrograms()
        setPrograms(pd.programs.map(p => p.name))
      } catch { }
    }
    loadPrograms()
  }, [])

  // Load messages for selected user
  useEffect(() => {
    if (activeTab === 'messages' && selectedUser) {
      selectUserMessages(selectedUser)
    }
  }, [activeTab, selectedUser])

  async function fetchDebugInfo() {
    try {
      const r = await authFetch('/api/admin/debug/data-status')
      const d = await r.json()
      setDebugInfo(d)
    } catch (e) {
      setDebugInfo({ error: e.message })
    }
  }

  const athletes = users

  const summaries = useMemo(() => {
    const m = {}
    for (const u of athletes) m[u.username] = computeWeekSummary(userData[u.username])
    return m
  }, [athletes, userData])

  const data = selected ? userData[selected] : null
  const userInfo = selected ? users.find(u => u.username === selected) : null

  const logEntries = useMemo(() => {
    if (!data?.workout_logs) return []
    return Object.entries(data.workout_logs)
      .filter(([k]) => !k.startsWith('cardio_') && !k.startsWith('skips_'))
      .map(([dayKey, dayData]) => {
        const meta = dayData.meta || {}
        const exData = dayData.data || {}
        return {
          dayKey,
          date: meta.date || '',
          week: meta.week || meta.weekNum || '',
          day: meta.day || meta.dayNum || '',
          label: meta.label || '',
          tonnage: computeTonnage(exData),
          exercises: Object.keys(exData).length,
          completion: getCompletionPct(exData),
          exData,
          savedAt: dayData.saved_at || '',
        }
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [data])

  const weekGroups = useMemo(() => {
    const groups = {}
    for (const e of logEntries) {
      const wk = e.week || '?'
      if (!groups[wk]) groups[wk] = []
      groups[wk].push(e)
    }
    return Object.entries(groups).sort(([a], [b]) => parseInt(b) - parseInt(a))
  }, [logEntries])

  const totalTonnage = logEntries.reduce((s, e) => s + e.tonnage, 0)
  const totalSessions = logEntries.length
  const avgCompletion = totalSessions > 0 ? Math.round(logEntries.reduce((s, e) => s + e.completion, 0) / totalSessions) : 0
  const whoop = data?.whoop_snapshots || []
  const latestWhoop = whoop.length > 0 ? whoop[whoop.length - 1] : null

  const chartData = useMemo(() => {
    return [...logEntries].reverse().slice(-14).map(e => ({
      date: e.date ? e.date.slice(5) : e.dayKey,
      tonnage: e.tonnage,
    }))
  }, [logEntries])

  // Athletes tab functions
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
      const d = await API.listUsers()
      setUsers(d.users)
    } catch { toast('Save failed', 'error') }
  }

  async function remove(username) {
    if (!confirm(`Delete "${username}"? This cannot be undone.`)) return
    try {
      await API.deleteUser(username)
      toast('Deleted')
      const d = await API.listUsers()
      setUsers(d.users)
    }
    catch { toast('Delete failed', 'error') }
  }

  // Messages tab functions
  async function selectUserMessages(name) {
    setSelectedUser(name)
    setMessagesLoading(true)
    try {
      const [msgs, userData] = await Promise.all([
        API.getMessages(name),
        API.getUserData(name),
      ])
      setMessages(msgs || [])
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
    setMessagesLoading(false)
  }

  async function sendMessage() {
    if (!msgForm.message.trim()) { toast('Enter a message', 'error'); return }
    setSending(true)
    try {
      const r = await API.sendMessage(selectedUser, msgForm)
      if (r.ok) {
        toast(r.whatsapp_sent ? 'Sent (+ WhatsApp)' : 'Message sent')
        setMessages(prev => [...prev, r.message])
        setMsgForm({ message: '', day_key: '', source: 'coach', send_whatsapp: false })
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

  function formatMessageDate(iso) {
    try {
      if (!iso) return ''
      const fixed = iso.replace(/\+00:00Z$/, 'Z')
      const d = new Date(fixed)
      if (isNaN(d.getTime())) return iso
      return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'athletes', label: 'Athletes' },
    { id: 'messages', label: 'Messages' },
  ]

  return (
    <div>
      <div className="page-title">
        <Icon name="dashboard" size={22} style={{ color: 'var(--accent2)' }} /> Dashboard
      </div>

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ─── OVERVIEW TAB ─── */}
      {activeTab === 'overview' && (
        <div>
          {loading && <p style={{ color: 'var(--text-dim)' }}>Loading athletes...</p>}

          {debugInfo && !selected && (
            <div className="card" style={{ marginBottom: 16, fontSize: 12 }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h3>Data Status</h3>
                <button onClick={() => setDebugInfo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-dim)', fontFamily: "'Space Mono', monospace", fontSize: 11, padding: '8px 0' }}>
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}

          {/* Athlete cards grid */}
          {!loading && !selected && (
            <div>
              <button onClick={fetchDebugInfo} style={{ marginBottom: 16, fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer' }}>
                Debug
              </button>
              <div className="athlete-grid">
                {athletes.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No athletes found.</p>}
                {athletes.map(u => {
                  const s = summaries[u.username] || {}
                  const logs = userData[u.username]?.workout_logs || {}
                  const validLogs = Object.entries(logs).filter(([k]) => !k.startsWith('cardio_') && !k.startsWith('skips_'))
                  const lastLog = validLogs.sort(([,a], [,b]) => (b.saved_at || '').localeCompare(a.saved_at || ''))[0]?.[1]
                  const lastDate = lastLog?.meta?.date
                  return (
                    <div key={u.username} className="athlete-card" onClick={() => { setSelected(u.username); setExpandedDay(null) }}>
                      <div className="athlete-card-header">
                        <div className="athlete-avatar">{u.username.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="athlete-name">{u.username}</div>
                          <div className="athlete-program">{u.program || 'No program'}</div>
                        </div>
                      </div>
                      <div className="athlete-card-label">This week</div>
                      <div className="athlete-week-stats">
                        <div className="athlete-stat">
                          <div className="athlete-stat-val">{s.sessions || 0}</div>
                          <div className="athlete-stat-lbl">Sessions</div>
                        </div>
                        <div className="athlete-stat">
                          <div className="athlete-stat-val">{s.exercises || 0}</div>
                          <div className="athlete-stat-lbl">Exercises</div>
                        </div>
                        <div className="athlete-stat">
                          <div className="athlete-stat-val">{fmtTonnage(s.tonnage || 0)}</div>
                          <div className="athlete-stat-lbl">Tonnage <HelpTip text="Total weight × reps across all sets this week. Cardio exercises are excluded." /></div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: "'Space Mono', monospace" }}>
                          {lastDate ? `Last: ${formatDate(lastDate)}` : 'No sessions yet'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: "'Space Mono', monospace" }}>
                          {validLogs.length} total
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selected athlete detail */}
          {selected && (
            <>
              <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← All Athletes</button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div className="athlete-avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
                  {selected.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{selected}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: "'Space Mono', monospace" }}>
                    {userInfo?.program || 'No program'} · {userInfo?.email || ''}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="stats-row">
                <div className="stat-card"><div className="stat-value">{totalSessions}</div><div className="stat-label">Sessions</div></div>
                <div className="stat-card"><div className="stat-value">{fmtTonnage(totalTonnage)}</div><div className="stat-label">Total Tonnage <HelpTip text="Total weight × reps across all logged sessions. Higher = more training volume." /></div></div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: avgCompletion >= 80 ? 'var(--teal)' : avgCompletion >= 50 ? 'var(--nn-gold)' : 'var(--accent)' }}>
                    {avgCompletion}%
                  </div>
                  <div className="stat-label">Avg Completion <HelpTip text="Green (80%+) = on track. Gold (50-79%) = needs attention. Purple (<50%) = falling behind." /></div>
                </div>
                <div className="stat-card"><div className="stat-value">{latestWhoop ? Math.round(latestWhoop.recovery_score || 0) + '%' : '—'}</div><div className="stat-label">Recovery <HelpTip text="From Whoop integration. Shows the athlete's latest recovery score. '—' means Whoop is not connected." /></div></div>
              </div>

              {/* Chart */}
              {chartData.length > 0 && (
                <div className="chart-container">
                  <h4>Tonnage Over Time</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,74,0.3)" />
                      <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#888' }} />
                      <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8, fontSize: 12 }} formatter={v => [v + ' kg', 'Tonnage']} />
                      <Bar dataKey="tonnage" fill="rgba(124,110,240,0.6)" stroke="#7c6ef0" strokeWidth={1} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Activity grouped by week */}
              {logEntries.length === 0 ? (
                <div className="card">
                  <div className="card-header"><h3>Activity Log</h3></div>
                  <p style={{ color: 'var(--text-dim)', padding: '12px 0' }}>No workouts recorded yet.</p>
                  <p style={{ color: 'var(--muted2)', fontSize: 11 }}>
                    Workouts sync when the athlete logs sets in the app. Check the Debug panel to verify data files exist on the server.
                  </p>
                </div>
              ) : (
                weekGroups.map(([weekNum, entries]) => {
                  const weekTonnage = entries.reduce((s, e) => s + e.tonnage, 0)
                  const weekCompletion = Math.round(entries.reduce((s, e) => s + e.completion, 0) / entries.length)
                  return (
                    <div key={weekNum} className="card" style={{ marginBottom: 12 }}>
                      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Week {weekNum}</h3>
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                          <span style={{ color: 'var(--accent2)' }}>{entries.length} session{entries.length !== 1 ? 's' : ''}</span>
                          <span style={{ color: 'var(--teal)' }}>{fmtTonnage(weekTonnage)}</span>
                          <span style={{ color: weekCompletion >= 80 ? 'var(--teal)' : 'var(--nn-gold)' }}>{weekCompletion}%</span>
                        </div>
                      </div>

                      {entries.map(e => {
                        const isExpanded = expandedDay === e.dayKey
                        return (
                          <div key={e.dayKey}>
                            <div
                              onClick={() => setExpandedDay(isExpanded ? null : e.dayKey)}
                              style={{
                                display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                                gap: 12, alignItems: 'center', padding: '10px 0',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                cursor: 'pointer',
                              }}
                            >
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>
                                  {formatDate(e.date)}
                                  <span style={{ color: 'var(--text-dim)', marginLeft: 8, fontSize: 11 }}>D{e.day}</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted2)' }}>
                                  {e.exercises} exercise{e.exercises !== 1 ? 's' : ''}{e.label ? ` · ${e.label}` : ''}
                                </div>
                              </div>
                              <div style={{ fontSize: 12, color: e.completion === 100 ? 'var(--teal)' : e.completion >= 50 ? 'var(--nn-gold)' : 'var(--text-dim)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
                                {e.completion}%
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600, fontFamily: "'Space Mono', monospace", minWidth: 70, textAlign: 'right' }}>
                                {e.tonnage > 0 ? fmtTonnage(e.tonnage) : '—'}
                              </div>
                              <div style={{ fontSize: 14, color: 'var(--text-dim)', width: 20, textAlign: 'center' }}>
                                {isExpanded ? '▾' : '▸'}
                              </div>
                            </div>

                            {isExpanded && (
                              <div style={{ padding: '8px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {Object.entries(e.exData).map(([exName, exDetail]) => {
                                  const sets = parseSets(exDetail)
                                  const notes = typeof exDetail === 'object' && !Array.isArray(exDetail) ? exDetail.notes : null
                                  const cardio = isCardioExercise(exName)
                                  return (
                                    <div key={exName} style={{ marginBottom: 12 }}>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {exName}
                                        {cardio && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(45,212,191,0.15)', color: 'var(--teal)' }}>CARDIO</span>}
                                      </div>
                                      {sets.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '2px 12px', fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                                          <div style={{ color: 'var(--muted2)', fontSize: 10 }}>SET</div>
                                          <div style={{ color: 'var(--muted2)', fontSize: 10 }}>{cardio ? 'DIST/LAPS' : 'WEIGHT'}</div>
                                          <div style={{ color: 'var(--muted2)', fontSize: 10 }}>{cardio ? 'TIME' : 'REPS'}</div>
                                          <div style={{ color: 'var(--muted2)', fontSize: 10 }}>✓</div>
                                          {sets.map(s => (
                                            <React.Fragment key={s.num}>
                                              <div style={{ color: 'var(--text-dim)' }}>{s.num}</div>
                                              <div>{s.weight || '—'}{s.weight && !cardio ? ' kg' : ''}</div>
                                              <div>{s.reps || s.actualReps || '—'}</div>
                                              <div style={{ color: s.done ? 'var(--teal)' : 'var(--text-dim)' }}>{s.done ? '✓' : '–'}</div>
                                            </React.Fragment>
                                          ))}
                                        </div>
                                      )}
                                      {notes && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 4 }}>"{notes}"</div>}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}

              {/* Whoop */}
              {whoop.length > 0 && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card-header"><h3>Whoop (Last {Math.min(whoop.length, 7)})</h3></div>
                  {whoop.slice(-7).reverse().map((s, i) => (
                    <div key={i} className="log-row">
                      <span className="date">{(s.date || '').slice(0, 10)}</span>
                      <span>Recovery: {s.recovery_score || '—'}% · Sleep: {s.sleep_score || '—'}</span>
                      <span className="tonnage">{s.strain_score ? s.strain_score.toFixed(1) : '—'} strain</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── ATHLETES TAB ─── */}
      {activeTab === 'athletes' && (
        <div>
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
                        style={{ fontSize: 14 }}>🏋️</button>
                    )}
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

          {twUser && <TargetWeightsModal username={twUser} onClose={() => setTwUser(null)} />}
        </div>
      )}

      {/* ─── MESSAGES TAB ─── */}
      {activeTab === 'messages' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, minHeight: 400 }}>
            {/* User list */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)', fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Athletes</div>
              {athletes.filter(u => u.role !== 'coach').map(u => (
                <div key={u.username} onClick={() => selectUserMessages(u.username)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer', fontSize: 14,
                    background: selectedUser === u.username ? 'rgba(124,110,240,0.1)' : 'transparent',
                    borderLeft: selectedUser === u.username ? '3px solid var(--accent)' : '3px solid transparent',
                    color: selectedUser === u.username ? 'var(--accent2)' : 'var(--text)',
                  }}>
                  {u.username}
                </div>
              ))}
              {athletes.filter(u => u.role !== 'coach').length === 0 && <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>No athletes found</div>}
            </div>

            {/* Message area */}
            <div className="card">
              {!selectedUser && <p style={{ color: 'var(--text-dim)' }}>Select an athlete to view and send messages.</p>}
              {selectedUser && (
                <>
                  <div className="card-header">
                    <h3>{selectedUser}</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => { setMsgForm({ message: '', day_key: '', source: 'coach', send_whatsapp: false }); setComposeOpen(true) }}>+ New Message</button>
                  </div>

                  {messagesLoading ? <p style={{ color: 'var(--text-dim)' }}>Loading...</p> : (
                    <>
                      {messages.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No messages yet.</p>}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 500, overflowY: 'auto' }}>
                        {[...messages].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at)).map(msg => {
                          const isAthlete = msg.source === 'athlete'
                          return (
                            <div key={msg.id} style={{
                              padding: '12px 14px', borderRadius: 8,
                              background: isAthlete ? 'rgba(59, 130, 246, 0.08)' : 'var(--input-bg)',
                              borderLeft: `3px solid ${isAthlete ? '#3b82f6' : 'var(--accent)'}`,
                              marginLeft: isAthlete ? 'auto' : '0',
                              marginRight: isAthlete ? '0' : 'auto',
                              maxWidth: '85%',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                  <span style={{
                                    display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, marginRight: 6,
                                    background: isAthlete ? 'rgba(59, 130, 246, 0.15)' : 'rgba(124,110,240,0.15)',
                                    color: isAthlete ? '#3b82f6' : 'var(--accent2)',
                                  }}>{isAthlete ? 'ATHLETE' : 'COACH'}</span>
                                  {formatMessageDate(msg.sent_at)}
                                  {msg.day_key && <span style={{ marginLeft: 8, color: isAthlete ? '#3b82f6' : 'var(--accent2)' }}>📋 {msg.day_key.replace('_', ' ')}</span>}
                                  {!msg.read && <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 600 }}>● Unread</span>}
                                </div>
                                <button className="btn-icon" onClick={() => deleteMsg(msg.id)} style={{ fontSize: 12 }}><Icon name="delete" size={12} /></button>
                              </div>
                              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                            </div>
                          )
                        })}
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
                <select value={msgForm.day_key} onChange={e => setMsgForm({ ...msgForm, day_key: e.target.value })}>
                  <option value="">— General message —</option>
                  {workoutDays.map(d => (
                    <option key={d.key} value={d.key}>Week {d.week} Day {d.day}{d.date ? ` (${d.date})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Source</label>
                <select value={msgForm.source} onChange={e => setMsgForm({ ...msgForm, source: e.target.value })}>
                  <option value="coach">Coach</option>
                  <option value="agent">Agent / AI</option>
                </select>
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea value={msgForm.message} onChange={e => setMsgForm({ ...msgForm, message: e.target.value })}
                  rows={5} placeholder="Great session today! Watch your tempo on the bench press — try to slow down the eccentric phase."
                  style={{ width: '100%', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input type="checkbox" id="sendWA" checked={msgForm.send_whatsapp} onChange={e => setMsgForm({ ...msgForm, send_whatsapp: e.target.checked })} />
                <label htmlFor="sendWA" style={{ fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>Also send via WhatsApp <HelpTip text="Requires Twilio WhatsApp configuration and the athlete's phone number in their profile." /></label>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  )
}
