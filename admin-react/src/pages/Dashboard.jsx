import React, { useState, useEffect, useMemo } from 'react'
// recharts removed — tonnage chart replaced by calendar view
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

/* ─── Calendar Overview Component ───────────────────── */

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function fmtShort(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function CalendarOverview({ athletes, userData, setUserData, loading, toast }) {
  const [calAthlete, setCalAthlete] = useState('')
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week, -1 = last week, etc
  const [editingEx, setEditingEx] = useState(null) // {weekIdx, dayIdx, groupIdx, exIdx, field}
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedDay, setExpandedDay] = useState(null) // dayIdx to expand on mobile
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Auto-select first athlete
  useEffect(() => {
    if (!calAthlete && athletes.length > 0) setCalAthlete(athletes[0].username)
  }, [athletes])

  const athleteData = userData[calAthlete]
  const program = athleteData?.assigned_program
  const startDateStr = athleteData?.assigned_program_date || ''
  const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null

  // Calculate the Monday of the displayed week
  const currentMonday = getMonday(new Date())
  const displayMonday = addDays(currentMonday, weekOffset * 7)

  // Map calendar dates to program days
  const calendarDays = useMemo(() => {
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(displayMonday, i)
      const dateStr = date.toISOString().slice(0, 10)
      let programDay = null
      let weekIdx = -1
      let dayIdx = -1

      if (program && startDate) {
        const daysSinceStart = Math.floor((date - startDate) / (1000 * 60 * 60 * 24))
        if (daysSinceStart >= 0) {
          const allDays = []
          for (const [wi, week] of (program.weeks || []).entries()) {
            for (const [di, day] of (week.days || []).entries()) {
              allDays.push({ weekIdx: wi, dayIdx: di, day, weekNum: week.week || wi + 1 })
            }
          }
          if (daysSinceStart < allDays.length) {
            const match = allDays[daysSinceStart]
            programDay = match.day
            weekIdx = match.weekIdx
            dayIdx = match.dayIdx
          }
        }
      }

      // Also get logged data for this date
      const logs = athleteData?.workout_logs || {}
      const logEntry = Object.values(logs).find(l => l.meta?.date === dateStr)

      days.push({ date, dateStr, programDay, weekIdx, dayIdx, logEntry })
    }
    return days
  }, [program, startDate, displayMonday, athleteData])

  // Week label
  const weekLabel = (() => {
    if (weekOffset === 0) return 'This Week'
    if (weekOffset === 1) return 'Next Week'
    if (weekOffset === -1) return 'Last Week'
    const from = fmtShort(displayMonday)
    const to = fmtShort(addDays(displayMonday, 6))
    return `${from} – ${to}`
  })()

  // Program week number for display
  const programWeekNum = (() => {
    if (!startDate || !program) return null
    const daysSinceStart = Math.floor((displayMonday - startDate) / (1000 * 60 * 60 * 24))
    if (daysSinceStart < 0) return null
    const weekNum = Math.floor(daysSinceStart / 7) + 1
    const totalWeeks = (program.weeks || []).length
    return weekNum <= totalWeeks ? weekNum : null
  })()

  // Exercise editing
  function startEdit(weekIdx, dayIdx, groupIdx, exIdx, field, value) {
    setEditingEx({ weekIdx, dayIdx, groupIdx, exIdx, field })
    setEditVal(value || '')
  }

  async function commitEdit() {
    if (!editingEx || !program) return
    const { weekIdx, dayIdx, groupIdx, exIdx, field } = editingEx
    const updated = JSON.parse(JSON.stringify(program))
    updated.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx].exercises[exIdx][field] = editVal
    setEditingEx(null)
    await saveProgram(updated)
  }

  function moveExercise(weekIdx, dayIdx, groupIdx, exIdx, direction) {
    if (!program) return
    const updated = JSON.parse(JSON.stringify(program))
    const day = updated.weeks[weekIdx].days[dayIdx]
    // Flatten all exercises
    const flat = []
    for (const g of (day.exerciseGroups || [])) {
      for (const ex of (g.exercises || [])) flat.push(ex)
    }
    let flatIdx = 0
    for (let g = 0; g < (day.exerciseGroups || []).length; g++) {
      for (let e = 0; e < (day.exerciseGroups[g].exercises || []).length; e++) {
        if (g === groupIdx && e === exIdx) { flatIdx = flat.indexOf(day.exerciseGroups[g].exercises[e]); break }
      }
    }
    // Recalculate flat index properly
    flatIdx = 0
    outer: for (let g = 0; g < (day.exerciseGroups || []).length; g++) {
      for (let e = 0; e < (day.exerciseGroups[g].exercises || []).length; e++) {
        if (g === groupIdx && e === exIdx) break outer
        flatIdx++
      }
    }
    const newIdx = flatIdx + direction
    if (newIdx < 0 || newIdx >= flat.length) return
    ;[flat[flatIdx], flat[newIdx]] = [flat[newIdx], flat[flatIdx]]
    // Rebuild as single groups
    day.exerciseGroups = flat.map((ex, i) => ({ type: 'single', exercises: [{ ...ex, order: String(i + 1) }] }))
    saveProgram(updated)
  }

  function removeExercise(weekIdx, dayIdx, groupIdx, exIdx) {
    if (!program) return
    const updated = JSON.parse(JSON.stringify(program))
    const g = updated.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx]
    g.exercises.splice(exIdx, 1)
    if (g.exercises.length === 0) updated.weeks[weekIdx].days[dayIdx].exerciseGroups.splice(groupIdx, 1)
    let order = 1
    for (const grp of updated.weeks[weekIdx].days[dayIdx].exerciseGroups) {
      for (const ex of grp.exercises) ex.order = String(order++)
    }
    saveProgram(updated)
  }

  async function saveProgram(updated) {
    setSaving(true)
    try {
      await API.updateAthleteProgram(calAthlete, updated)
      // Update local state
      setUserData(prev => ({
        ...prev,
        [calAthlete]: { ...prev[calAthlete], assigned_program: updated }
      }))
      toast('Program updated')
    } catch { toast('Save failed', 'error') }
    setSaving(false)
  }

  const isToday = (date) => {
    const today = new Date()
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
  }

  const isPast = (date) => {
    const today = new Date()
    today.setHours(0,0,0,0)
    return date < today
  }

  return (
    <div>
      {loading && <p style={{ color: 'var(--text-dim)' }}>Loading athletes...</p>}

      {!loading && (
        <>
          {/* Athlete selector + week nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select value={calAthlete} onChange={e => { setCalAthlete(e.target.value); setWeekOffset(0) }}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
                {athletes.map(a => (
                  <option key={a.username} value={a.username}>{a.username}</option>
                ))}
              </select>
              {program && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{program.name || 'Program'}</span>}
              {programWeekNum && <span style={{ fontSize: 11, color: 'var(--accent2)', fontWeight: 600 }}>Week {programWeekNum}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setWeekOffset(w => w - 1)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', padding: '4px 10px', fontSize: 13 }}>◀</button>
              <button onClick={() => setWeekOffset(0)}
                style={{ background: weekOffset === 0 ? 'var(--accent2)' : 'none', border: '1px solid var(--border)', borderRadius: 6, color: weekOffset === 0 ? '#fff' : 'var(--text)', cursor: 'pointer', padding: '4px 12px', fontSize: 12, fontWeight: 600, minWidth: 100, textAlign: 'center' }}>
                {weekLabel}
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', padding: '4px 10px', fontSize: 13 }}>▶</button>
            </div>
          </div>

          {saving && <div style={{ fontSize: 11, color: 'var(--accent2)', marginBottom: 8 }}>Saving...</div>}

          {!program ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--text-dim)' }}>No program assigned to {calAthlete}.</p>
              <p style={{ fontSize: 12, color: 'var(--muted2)' }}>Assign a program in the Athletes tab first.</p>
            </div>
          ) : (
            /* Calendar grid */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, width: '100%' }}>
              {/* Day headers */}
              {DAY_LABELS.map((d, i) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {d}
                </div>
              ))}

              {/* Day cells */}
              {calendarDays.map((cd, i) => {
                const today = isToday(cd.date)
                const past = isPast(cd.date)
                const hasLog = !!cd.logEntry
                const day = cd.programDay
                const isRest = day?.isRest
                const exercises = []
                if (day && !isRest) {
                  for (const [gi, group] of (day.exerciseGroups || []).entries()) {
                    for (const [ei, ex] of (group.exercises || []).entries()) {
                      exercises.push({ ...ex, _gi: gi, _ei: ei })
                    }
                  }
                }
                const completion = hasLog ? getCompletionPct(cd.logEntry.data || {}) : null

                return (
                  <div key={cd.dateStr} style={{
                    background: today ? 'rgba(124,110,240,0.08)' : 'var(--surface)',
                    border: today ? '2px solid var(--accent2)' : '1px solid var(--border)',
                    borderRadius: 10, padding: 8, minHeight: 120,
                    opacity: !day && past ? 0.4 : 1,
                    display: 'flex', flexDirection: 'column',
                  }}>
                    {/* Date header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: today ? 700 : 500, color: today ? 'var(--accent2)' : 'var(--text)' }}>
                        {cd.date.getDate()}
                      </span>
                      {completion !== null && (
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                          background: completion === 100 ? 'rgba(45,212,191,0.15)' : completion >= 50 ? 'rgba(255,193,7,0.15)' : 'rgba(124,110,240,0.1)',
                          color: completion === 100 ? 'var(--teal)' : completion >= 50 ? '#ffc107' : 'var(--accent2)',
                        }}>
                          {completion}%
                        </span>
                      )}
                    </div>

                    {/* Rest day */}
                    {isRest && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>Rest Day</span>
                      </div>
                    )}

                    {/* No program day */}
                    {!day && (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--muted2)' }}>—</span>
                      </div>
                    )}

                    {/* Exercises */}
                    {exercises.length > 0 && (
                      <div style={{ flex: 1, overflow: 'auto', fontSize: 10 }}>
                        {exercises.map((ex, fi) => {
                          const isEditingName = editingEx?.weekIdx === cd.weekIdx && editingEx?.dayIdx === cd.dayIdx && editingEx?.groupIdx === ex._gi && editingEx?.exIdx === ex._ei && editingEx?.field === 'name'
                          return (
                            <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 0', borderBottom: fi < exercises.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                              <span style={{ color: 'var(--accent2)', fontSize: 9, width: 12, flexShrink: 0 }}>{ex.order}</span>
                              {isEditingName ? (
                                <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                  onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingEx(null) }}
                                  autoFocus style={{ flex: 1, fontSize: 10, padding: '1px 3px', background: 'var(--input-bg)', border: '1px solid var(--accent2)', borderRadius: 3, color: 'var(--text)', minWidth: 0 }} />
                              ) : (
                                <span style={{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}
                                  onClick={() => startEdit(cd.weekIdx, cd.dayIdx, ex._gi, ex._ei, 'name', ex.name)}
                                  title={`${ex.name} · ${ex.sets}×${ex.reps} · Click to edit`}>
                                  {ex.name}
                                </span>
                              )}
                              <span style={{ color: 'var(--text-dim)', fontSize: 9, flexShrink: 0 }}>{ex.sets}×{ex.reps}</span>
                              <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
                                <button onClick={() => moveExercise(cd.weekIdx, cd.dayIdx, ex._gi, ex._ei, -1)}
                                  disabled={fi === 0} title="Move up"
                                  style={{ background: 'none', border: 'none', cursor: fi === 0 ? 'default' : 'pointer', color: fi === 0 ? 'var(--border)' : 'var(--accent2)', fontSize: 8, padding: '0 1px', lineHeight: 1 }}>▲</button>
                                <button onClick={() => moveExercise(cd.weekIdx, cd.dayIdx, ex._gi, ex._ei, 1)}
                                  disabled={fi === exercises.length - 1} title="Move down"
                                  style={{ background: 'none', border: 'none', cursor: fi === exercises.length - 1 ? 'default' : 'pointer', color: fi === exercises.length - 1 ? 'var(--border)' : 'var(--accent2)', fontSize: 8, padding: '0 1px', lineHeight: 1 }}>▼</button>
                                <button onClick={() => removeExercise(cd.weekIdx, cd.dayIdx, ex._gi, ex._ei)} title="Remove"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 9, padding: '0 1px', lineHeight: 1 }}>×</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Second week row */}
          {program && (() => {
            const nextMonday = addDays(displayMonday, 7)
            const nextDays = []
            for (let i = 0; i < 7; i++) {
              const date = addDays(nextMonday, i)
              const dateStr = date.toISOString().slice(0, 10)
              let programDay = null, weekIdx = -1, dayIdx = -1
              if (program && startDate) {
                const daysSinceStart = Math.floor((date - startDate) / (1000 * 60 * 60 * 24))
                if (daysSinceStart >= 0) {
                  const allDays = []
                  for (const [wi, week] of (program.weeks || []).entries()) {
                    for (const [di, day] of (week.days || []).entries()) {
                      allDays.push({ weekIdx: wi, dayIdx: di, day, weekNum: week.week || wi + 1 })
                    }
                  }
                  if (daysSinceStart < allDays.length) {
                    const match = allDays[daysSinceStart]
                    programDay = match.day; weekIdx = match.weekIdx; dayIdx = match.dayIdx
                  }
                }
              }
              const logs = athleteData?.workout_logs || {}
              const logEntry = Object.values(logs).find(l => l.meta?.date === dateStr)
              nextDays.push({ date, dateStr, programDay, weekIdx, dayIdx, logEntry })
            }

            const nextWeekNum = (() => {
              if (!startDate) return null
              const daysSinceStart = Math.floor((nextMonday - startDate) / (1000 * 60 * 60 * 24))
              if (daysSinceStart < 0) return null
              const wn = Math.floor(daysSinceStart / 7) + 1
              const totalWeeks = (program.weeks || []).length
              return wn <= totalWeeks ? wn : null
            })()

            return (
              <>
                <div style={{ margin: '12px 0 6px', fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
                  Following Week {nextWeekNum ? <span style={{ color: 'var(--accent2)' }}>(Week {nextWeekNum})</span> : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, width: '100%' }}>
                  {nextDays.map((cd) => {
                    const day = cd.programDay
                    const isRest = day?.isRest
                    const exercises = []
                    if (day && !isRest) {
                      for (const [gi, group] of (day.exerciseGroups || []).entries()) {
                        for (const [ei, ex] of (group.exercises || []).entries()) {
                          exercises.push({ ...ex, _gi: gi, _ei: ei })
                        }
                      }
                    }
                    return (
                      <div key={cd.dateStr} style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 10, padding: 8, minHeight: 100, opacity: 0.85,
                        display: 'flex', flexDirection: 'column',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 4 }}>
                          {cd.date.getDate()} {cd.date.toLocaleDateString('en-GB', { month: 'short' })}
                        </div>
                        {isRest && <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Rest</div>}
                        {!day && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 10, color: 'var(--muted2)' }}>—</span></div>}
                        {exercises.length > 0 && (
                          <div style={{ fontSize: 10, overflow: 'auto' }}>
                            {exercises.map((ex, fi) => (
                              <div key={fi} style={{ display: 'flex', gap: 4, padding: '1px 0', alignItems: 'center' }}>
                                <span style={{ color: 'var(--accent2)', fontSize: 9, width: 12 }}>{ex.order}</span>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{ex.name}</span>
                                <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{ex.sets}×{ex.reps}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </>
      )}
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
    setForm({ username: '', email: '', password: '', program: '', startDate: '', role: 'athlete', athlete_prompt: '' })
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
        const body = { email: form.email, program: form.program, startDate: form.startDate, role: form.role, coaches: form.coaches || [], athlete_prompt: form.athlete_prompt || '' }
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

      {/* ─── OVERVIEW TAB — Calendar View ─── */}
      {activeTab === 'overview' && (
        <CalendarOverview athletes={athletes} userData={userData} setUserData={setUserData} loading={loading} toast={toast} />
      )}

      {/* ─── ATHLETES TAB ─── */}
      {activeTab === 'athletes' && (
        <div>
          <div className="toolbar">
            <input type="search" className="search-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
          </div>

          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Program</th><th>Coaches</th><th>Start Date</th><th>Role</th><th>Verified</th><th></th></tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.username}>
                  <td><strong>{u.username}</strong></td>
                  <td style={{ color: 'var(--text-dim)' }}>{u.email}</td>
                  <td>{u.program || '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{(u.coaches || []).length > 0 ? u.coaches.join(', ') : '—'}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{u.startDate || '—'}</td>
                  <td><span className={`badge ${u.role === 'coach' ? 'badge-coach' : 'badge-athlete'}`}>{u.role}</span></td>
                  <td>{u.email_verified ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {u.role === 'athlete' && (
                      <button className="btn-icon" title="Target weights" onClick={() => setTwUser(u.username)}
                        style={{ fontSize: 14 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.5 6.5h11M6.5 17.5h11M2 10v4M22 10v4M4 8v8M20 8v8"/></svg></button>
                    )}
                    <button className="btn-icon" onClick={() => openEdit(u)}><Icon name="edit" size={14} /></button>
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
              {form.role === 'athlete' && (
                <>
                  <div className="form-group">
                    <label>Coaches <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(comma-separated usernames)</span></label>
                    <input type="text" value={(form.coaches || []).join(', ')}
                      onChange={e => setForm({ ...form, coaches: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      placeholder="e.g. coach1, coach2" />
                  </div>
                  <div className="form-group">
                    <label>AI Builder Prompt <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(context for AI program generation)</span></label>
                    <textarea rows="4" value={form.athlete_prompt || ''} onChange={e => setForm({ ...form, athlete_prompt: e.target.value })}
                      placeholder="e.g. Goals: Build strength and muscle. Injuries: Previous shoulder issues. Preferences: Enjoy heavy barbell work, dislikes machines. Available equipment: Full gym access." />
                  </div>
                </>
              )}
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
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)', fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Users</div>
              {users.map(u => (
                <div key={u.username} onClick={() => selectUserMessages(u.username)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer', fontSize: 14,
                    background: selectedUser === u.username ? 'rgba(124,110,240,0.1)' : 'transparent',
                    borderLeft: selectedUser === u.username ? '3px solid var(--accent)' : '3px solid transparent',
                    color: selectedUser === u.username ? 'var(--accent2)' : 'var(--text)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                  <span>{u.username}</span>
                  {u.role === 'coach' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(52,211,153,0.15)', color: 'var(--teal)' }}>COACH</span>}
                </div>
              ))}
              {users.length === 0 && <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>No users found</div>}
            </div>

            {/* Message area */}
            <div className="card">
              {!selectedUser && <p style={{ color: 'var(--text-dim)' }}>Select a user to view and send messages.</p>}
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
                                  {msg.day_key && <span style={{ marginLeft: 8, color: isAthlete ? '#3b82f6' : 'var(--accent2)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{display:'inline',verticalAlign:'middle',marginRight:4}}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>{msg.day_key.replace('_', ' ')}</span>}
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
