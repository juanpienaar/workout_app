import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { API } from '../api'
import { authFetch } from '../api'
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

/* ─── main component ─────────────────────────────── */

export default function Dashboard() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [userData, setUserData] = useState({})
  const [selected, setSelected] = useState(null)
  const [expandedDay, setExpandedDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [debugInfo, setDebugInfo] = useState(null)

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
        console.log('[Dashboard] User data loaded:', Object.fromEntries(
          Object.entries(dataMap).map(([k, v]) => [k, Object.keys(v?.workout_logs || {}).length + ' logs'])
        ))
        setUserData(dataMap)
      } catch { toast('Failed to load users', 'error') }
      setLoading(false)
    }
    init()
  }, [])

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

  // Group by week
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

  return (
    <div>
      <div className="page-title">
        <Icon name="dashboard" size={22} style={{ color: 'var(--accent2)' }} /> Coach Dashboard
        {!selected && (
          <button onClick={fetchDebugInfo} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer' }}>
            Debug
          </button>
        )}
      </div>

      {loading && <p style={{ color: 'var(--text-dim)' }}>Loading athletes...</p>}

      {/* Debug panel */}
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

      {/* ─── Athlete cards grid ─── */}
      {!loading && !selected && (
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
                    <div className="athlete-stat-lbl">Tonnage</div>
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

          {/* Stats */}
          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{totalSessions}</div><div className="stat-label">Sessions</div></div>
            <div className="stat-card"><div className="stat-value">{fmtTonnage(totalTonnage)}</div><div className="stat-label">Total Tonnage</div></div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: avgCompletion >= 80 ? 'var(--teal)' : avgCompletion >= 50 ? 'var(--nn-gold)' : 'var(--accent)' }}>
                {avgCompletion}%
              </div>
              <div className="stat-label">Avg Completion</div>
            </div>
            <div className="stat-card"><div className="stat-value">{latestWhoop ? Math.round(latestWhoop.recovery_score || 0) + '%' : '—'}</div><div className="stat-label">Recovery</div></div>
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
  )
}
