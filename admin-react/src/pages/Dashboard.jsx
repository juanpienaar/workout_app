import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { API } from '../api'
import { useToast } from '../components/Toast'

function getWeekRange() {
  const now = new Date()
  const day = now.getDay() // 0=Sun
  const mon = new Date(now)
  mon.setDate(now.getDate() - ((day + 6) % 7))
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { start: mon, end: sun }
}

function computeWeekSummary(data) {
  if (!data?.workout_logs) return { sessions: 0, tonnage: 0, exercises: 0 }
  const { start, end } = getWeekRange()
  let sessions = 0, tonnage = 0, exercises = 0
  for (const [, dayData] of Object.entries(data.workout_logs)) {
    const dateStr = dayData.meta?.date || ''
    if (!dateStr) continue
    const d = new Date(dateStr)
    if (d >= start && d <= end) {
      sessions++
      const exData = dayData.data || {}
      exercises += Object.keys(exData).length
      for (const sets of Object.values(exData)) {
        if (Array.isArray(sets)) sets.forEach(s => { tonnage += (parseFloat(s.weight) || 0) * (parseInt(s.actualReps) || 0) })
      }
    }
  }
  return { sessions, tonnage: Math.round(tonnage), exercises }
}

export default function Dashboard() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [userData, setUserData] = useState({}) // { username: data }
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const d = await API.listUsers()
        setUsers(d.users || [])
        // Load data for all athletes
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

  // Show all users — coaches with programs should appear too
  const athletes = users

  // Summaries for each athlete
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
    return Object.entries(data.workout_logs).map(([dayKey, dayData]) => {
      const meta = dayData.meta || {}
      const exData = dayData.data || {}
      let tonnage = 0
      for (const sets of Object.values(exData)) {
        if (Array.isArray(sets)) sets.forEach(s => { tonnage += (parseFloat(s.weight) || 0) * (parseInt(s.actualReps) || 0) })
      }
      return { dayKey, date: meta.date || '', week: meta.weekNum || '', day: meta.dayNum || '', tonnage: Math.round(tonnage), exercises: Object.keys(exData).length }
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }, [data])

  const totalTonnage = logEntries.reduce((s, e) => s + e.tonnage, 0)
  const whoop = data?.whoop_snapshots || []
  const latestWhoop = whoop.length > 0 ? whoop[whoop.length - 1] : null

  return (
    <div>
      <div className="page-title"><span className="icon">📊</span> Coach Dashboard</div>

      {loading && <p style={{ color: 'var(--text-dim)' }}>Loading athletes...</p>}

      {/* Athlete cards list */}
      {!loading && !selected && (
        <div className="athlete-grid">
          {athletes.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No athletes found.</p>}
          {athletes.map(u => {
            const s = summaries[u.username] || {}
            return (
              <div key={u.username} className="athlete-card" onClick={() => setSelected(u.username)}>
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
              </div>
            )
          })}
        </div>
      )}

      {/* Selected athlete detail */}
      {selected && (
        <>
          <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← All Athletes</button>

          <div className="stats-row">
            <div className="stat-card"><div className="stat-value">{logEntries.length}</div><div className="stat-label">Total Sessions</div></div>
            <div className="stat-card"><div className="stat-value">{(totalTonnage / 1000).toFixed(1)}t</div><div className="stat-label">Total Tonnage</div></div>
            <div className="stat-card"><div className="stat-value">{latestWhoop ? Math.round(latestWhoop.recovery_score || 0) + '%' : '—'}</div><div className="stat-label">Recovery</div></div>
            <div className="stat-card"><div className="stat-value">{userInfo?.program || '—'}</div><div className="stat-label">Program</div></div>
          </div>

          {logEntries.length > 0 && (
            <div className="chart-container">
              <h4>Tonnage Over Time</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={logEntries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,74,0.3)" />
                  <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#888' }} />
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 8 }} />
                  <Bar dataKey="tonnage" fill="rgba(232,71,95,0.6)" stroke="#E8475F" strokeWidth={1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <div className="card-header"><h3>Workout Logs</h3></div>
            {logEntries.length === 0
              ? <p style={{ color: 'var(--text-dim)' }}>No workouts recorded yet.</p>
              : logEntries.map(e => (
                <div key={e.dayKey} className="log-row">
                  <span className="date">{e.date || e.dayKey}</span>
                  <span>W{e.week} D{e.day} · {e.exercises} exercises</span>
                  <span className="tonnage">{e.tonnage > 0 ? e.tonnage + ' kg' : '—'}</span>
                </div>
              ))}
          </div>

          {whoop.length > 0 && (
            <div className="card">
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
