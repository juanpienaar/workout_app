import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { API } from '../api'
import { useToast } from '../components/Toast'
import { Icon } from '../components/Icons'

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
  const sets = []
  for (const [k, v] of Object.entries(exData)) {
    if (k === 'notes') continue
    if (k.startsWith('set') && typeof v === 'object') {
      sets.push({ num: parseInt(k.replace('set', '')) || 0, ...v })
    }
  }
  // Also handle array format just in case
  if (Array.isArray(exData)) {
    return exData.map((s, i) => ({ num: i + 1, ...s }))
  }
  return sets.sort((a, b) => a.num - b.num)
}

function computeTonnage(exDataMap) {
  let tonnage = 0
  for (const [exName, exData] of Object.entries(exDataMap)) {
    // Skip cardio exercises
    const lower = exName.toLowerCase()
    if (/\b(run|running|jog|jogging|sprint|5k|10k|marathon)\b/.test(lower)) continue
    if (/\b(cycling|cycle|bike|biking|spin)\b/.test(lower)) continue
    if (/\b(swim|swimming|laps|freestyle|backstroke|breaststroke)\b/.test(lower)) continue
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
  for (const [, dayData] of Object.entries(data.workout_logs)) {
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

/* ─── main component ─────────────────────────────── */

export default function Dashboard() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [userData, setUserData] = useState({})
  const [selected, setSelected] = useState(null)
  const [expandedDay, setExpandedDay] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const d = await API.listUsers()
        setUsers(d.users || [])
        const dataMap = {}
        await Promise.all(
          (d.users || []).map(async u => {
            try { dataMap[u.username] = await API.getUserData(u.username) } catch {}
          })
        )
        setUserData(dataMap)
      } catch { toast('Failed to load users', 'error') }
      setLoading(false)
    }
    init()
  }, [])

  const athletes = users

  const summaries = useMemo(() => {
    const m = {}
    for (const u of athletes) {
      m[u.username] = computeWeekSummary(userData[u.username])
    }
    return m
  }, [athletes, userData])

  // Selected athlete detail
  const data = selected ? userData[selected] : null
  const userInfo = selected ? users.find(u => u.username === selected) : null

  const logEntries = useMemo(() => {
    if (!data?.workout_logs) return []
    return Object.entries(data.workout_logs)
      .filter(([k]) => !k.startsWith('cardio_')) // filter out standalone cardio entries
      .map(([dayKey, dayData]) => {
        const meta = dayData.meta || {}
        const exData = dayData.data || {}
        const tonnage = computeTonnage(exData)
        const completion = getCompletionPct(exData)
        const exerciseCount = Object.keys(exData).length
        return {
          dayKey,
          date: meta.date || '',
          week: meta.week || meta.weekNum || '',
          day: meta.day || meta.dayNum || '',
          label: meta.label || '',
          tonnage,
          exercises: exerciseCount,
          completion,
          exData,
          savedAt: dayData.saved_at || '',
        }
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')) // newest first
  }, [data])

  const totalTonnage = logEntries.reduce((s, e) => s + e.tonnage, 0)
  const totalSessions = logEntries.length
  const avgCompletion = totalSessions > 0 ? Math.round(logEntries.reduce((s, e) => s + e.completion, 0) / totalSessions) : 0
  const whoop = data?.whoop_snapshots || []
  const latestWhoop = whoop.length > 0 ? whoop[whoop.length - 1] : null

  // Chart data (last 14 sessions)
  const chartData = useMemo(() => {
    return [...logEntries].reverse().slice(-14).map(e => ({
      date: e.date ? e.date.slice(5) : e.dayKey,
      tonnage: e.tonnage,
      completion: e.completion,
    }))
  }, [logEntries])

  return (
    <div>
      <div className="page-title"><Icon name="dashboard" size={22} style={{ color: 'var(--accent2)' }} /> Coach Dashboard</div>

      {loading && <p style={{ color: 'var(--text-dim)' }}>Loading athletes...</p>}

      {/* ─── Athlete cards grid ─── */}
      {!loading && !selected && (
        <div className="athlete-grid">
          {athletes.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No athletes found.</p>}
          {athletes.map(u => {
            const s = summaries[u.username] || {}
            const logs = userData[u.username]?.workout_logs || {}
            const lastLog = Object.values(logs).sort((a, b) => (b.saved_at || '').localeCompare(a.saved_at || ''))[0]
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
                    <div className="athlete-stat-val">{s.tonnage > 1000 ? (s.tonnage / 1000).toFixed(1) + 't' : (s.tonnage || 0) + 'kg'}</div>
                    <div className="athlete-stat-lbl">Tonnage</div>
                  </div>
                </div>
                {lastDate && (
                  <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 8, fontFamily: "'Space Mono', monospace" }}>
                    Last session: {formatDate(lastDate)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Selected athlete detail ─── */}
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

          {/* ─── Stats row ─── */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-value">{totalSessions}</div>
              <div className="stat-label">Total Sessions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalTonnage > 1000 ? (totalTonnage / 1000).toFixed(1) + 't' : totalTonnage + 'kg'}</div>
              <div className="stat-label">Total Tonnage</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: avgCompletion >= 80 ? 'var(--teal)' : avgCompletion >= 50 ? 'var(--nn-gold)' : 'var(--accent)' }}>
                {avgCompletion}%
              </div>
              <div className="stat-label">Avg Completion</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{latestWhoop ? Math.round(latestWhoop.recovery_score || 0) + '%' : '—'}</div>
              <div className="stat-label">Recovery</div>
            </div>
          </div>

          {/* ─── Tonnage chart ─── */}
          {chartData.length > 0 && (
            <div className="chart-container">
              <h4>Tonnage Over Time</h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,74,0.3)" />
                  <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#888' }} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [name === 'tonnage' ? v + ' kg' : v + '%', name === 'tonnage' ? 'Tonnage' : 'Completion']}
                  />
                  <Bar dataKey="tonnage" fill="rgba(124,110,240,0.6)" stroke="#7c6ef0" strokeWidth={1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ─── Workout sessions list ─── */}
          <div className="card">
            <div className="card-header">
              <h3>Activity Log</h3>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{totalSessions} sessions</span>
            </div>

            {logEntries.length === 0
              ? <p style={{ color: 'var(--text-dim)', padding: '12px 0' }}>No workouts recorded yet.</p>
              : logEntries.map(e => {
                  const isExpanded = expandedDay === e.dayKey
                  return (
                    <div key={e.dayKey}>
                      {/* Session row — clickable to expand */}
                      <div
                        className="session-row"
                        onClick={() => setExpandedDay(isExpanded ? null : e.dayKey)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto auto auto',
                          gap: 12,
                          alignItems: 'center',
                          padding: '10px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {formatDate(e.date)}
                            {e.week && <span style={{ color: 'var(--text-dim)', marginLeft: 8, fontSize: 11 }}>W{e.week} D{e.day}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted2)' }}>
                            {e.exercises} exercise{e.exercises !== 1 ? 's' : ''}{e.label ? ` · ${e.label}` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: e.completion === 100 ? 'var(--teal)' : e.completion >= 50 ? 'var(--nn-gold)' : 'var(--text-dim)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
                          {e.completion}%
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--accent2)', fontWeight: 600, fontFamily: "'Space Mono', monospace", minWidth: 70, textAlign: 'right' }}>
                          {e.tonnage > 0 ? (e.tonnage > 1000 ? (e.tonnage / 1000).toFixed(1) + 't' : e.tonnage + 'kg') : '—'}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-dim)', width: 20, textAlign: 'center' }}>
                          {isExpanded ? '▾' : '▸'}
                        </div>
                      </div>

                      {/* Expanded exercise detail */}
                      {isExpanded && (
                        <div style={{ padding: '8px 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {Object.entries(e.exData).map(([exName, exDetail]) => {
                            const sets = parseSets(exDetail)
                            const notes = typeof exDetail === 'object' && !Array.isArray(exDetail) ? exDetail.notes : null
                            return (
                              <div key={exName} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                                  {exName}
                                </div>
                                {sets.length > 0 && (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '2px 12px', fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
                                    <div style={{ color: 'var(--muted2)', fontSize: 10 }}>SET</div>
                                    <div style={{ color: 'var(--muted2)', fontSize: 10 }}>WEIGHT</div>
                                    <div style={{ color: 'var(--muted2)', fontSize: 10 }}>REPS</div>
                                    <div style={{ color: 'var(--muted2)', fontSize: 10 }}>✓</div>
                                    {sets.map(s => (
                                      <React.Fragment key={s.num}>
                                        <div style={{ color: 'var(--text-dim)' }}>{s.num}</div>
                                        <div>{s.weight || '—'}{s.weight ? ' kg' : ''}</div>
                                        <div>{s.reps || s.actualReps || '—'}</div>
                                        <div style={{ color: s.done ? 'var(--teal)' : 'var(--text-dim)' }}>
                                          {s.done ? '✓' : '–'}
                                        </div>
                                      </React.Fragment>
                                    ))}
                                  </div>
                                )}
                                {notes && (
                                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 4 }}>
                                    "{notes}"
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
            }
          </div>

          {/* ─── Whoop snapshots ─── */}
          {whoop.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header"><h3>Whoop Snapshots (Last {Math.min(whoop.length, 7)})</h3></div>
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
  )
}
