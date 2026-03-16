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

function localDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function ExerciseAutocomplete({ value, onChange, placeholder, suggestions }) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const ref = React.useRef(null)

  const filtered = value.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && highlighted >= 0 && filtered[highlighted]) { onChange(filtered[highlighted]); setOpen(false); setHighlighted(-1) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); setHighlighted(-1) }}
        onFocus={() => { if (filtered.length > 0) setOpen(true) }}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%', fontSize: 13, padding: '6px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 2,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {filtered.map((name, i) => (
            <div key={name}
              onMouseDown={() => { onChange(name); setOpen(false) }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text)',
                background: i === highlighted ? 'rgba(124,110,240,0.12)' : 'transparent',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CalendarOverview({ athletes, userData, setUserData, loading, toast, onRefresh }) {
  const [calAthlete, setCalAthlete] = useState('')
  const [expandedDayKey, setExpandedDayKey] = useState(null) // dateStr of expanded day
  const [editingEx, setEditingEx] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [newExName, setNewExName] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [replaceFrom, setReplaceFrom] = useState('')
  const [replaceTo, setReplaceTo] = useState('')
  const [replaceFromDate, setReplaceFromDate] = useState('')
  const [movingEx, setMovingEx] = useState(null) // { weekIdx, dayIdx, groupIdx, exIdx, exercise }
  const [expandedExKey, setExpandedExKey] = useState(null) // exKey of expanded exercise in modal
  const scrollRef = React.useRef(null)
  const currentWeekRef = React.useRef(null)
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Helper: apply exercise_order from meta to sort exercises like the app does
  function applyExerciseOrder(exercises, orderArr) {
    if (!orderArr || orderArr.length === 0) return exercises
    const keyToEx = {}
    exercises.forEach(ex => {
      const key = ex.order + '_' + ex.name.replace(/\s+/g, '_')
      keyToEx[key] = ex
    })
    const ordered = []
    for (const key of orderArr) {
      if (keyToEx[key]) { ordered.push(keyToEx[key]); delete keyToEx[key] }
    }
    // Append any exercises not in the order array
    Object.values(keyToEx).forEach(ex => ordered.push(ex))
    return ordered
  }

  // Auto-select first athlete
  useEffect(() => {
    if (!calAthlete && athletes.length > 0) setCalAthlete(athletes[0].username)
  }, [athletes])

  // Get startDate from the athletes/users list (same source the app uses)
  const athleteInfo = athletes.find(a => a.username === calAthlete)
  const athleteData = userData[calAthlete]
  const program = athleteData?.assigned_program
  // Prefer startDate from users list (what the app uses), fallback to assigned_program_date in user_data
  const startDateStr = athleteInfo?.startDate || athleteData?.assigned_program_date || ''
  const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null

  // Debug: log calendar state for selected athlete
  useEffect(() => {
    if (calAthlete) {
      console.log(`[Calendar] athlete=${calAthlete}, hasInfo=${!!athleteInfo}, hasData=${!!athleteData}, hasProgram=${!!program}, startDate=${startDateStr}`)
      if (athleteData) {
        console.log(`[Calendar]   userData keys:`, Object.keys(athleteData))
      }
    }
  }, [calAthlete, athleteData, program])

  // Build flat list of all program days
  const allProgramDays = useMemo(() => {
    if (!program) return []
    const days = []
    for (const [wi, week] of (program.weeks || []).entries()) {
      for (const [di, day] of (week.days || []).entries()) {
        days.push({ weekIdx: wi, dayIdx: di, day, weekNum: week.week || wi + 1 })
      }
    }
    return days
  }, [program])

  // Calculate the range of weeks to display
  const { weeks, currentWeekIndex } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMonday = getMonday(today)

    if (!program || !startDate || allProgramDays.length === 0) {
      // No program — show 4 weeks centered on current week
      const result = []
      for (let w = -1; w <= 2; w++) {
        const monday = addDays(todayMonday, w * 7)
        const days = []
        for (let d = 0; d < 7; d++) {
          const date = addDays(monday, d)
          days.push({ date, dateStr: localDateStr(date), programDay: null, weekIdx: -1, dayIdx: -1, logEntry: null })
        }
        result.push({ monday, days, programWeekNum: null })
      }
      return { weeks: result, currentWeekIndex: 1 }
    }

    // Program exists — calculate week range from program start to program end
    const programEndDate = addDays(startDate, allProgramDays.length - 1)
    const firstMonday = getMonday(startDate)
    const lastMonday = getMonday(programEndDate)

    // Also include current week if it's outside program range
    const earliest = firstMonday <= todayMonday ? firstMonday : todayMonday
    const latest = lastMonday >= todayMonday ? lastMonday : todayMonday

    // Add 1 week buffer on each end
    const rangeStart = addDays(earliest, -7)
    const rangeEnd = addDays(latest, 7)

    const result = []
    let cwIdx = 0
    let monday = new Date(rangeStart)
    let weekCounter = 0
    while (monday <= rangeEnd) {
      const days = []
      for (let d = 0; d < 7; d++) {
        const date = addDays(monday, d)
        const ds = localDateStr(date)
        let programDay = null, weekIdx = -1, dayIdx = -1

        const daysSinceStart = Math.round((date - startDate) / (1000 * 60 * 60 * 24))
        if (daysSinceStart >= 0 && daysSinceStart < allProgramDays.length) {
          const match = allProgramDays[daysSinceStart]
          programDay = match.day
          weekIdx = match.weekIdx
          dayIdx = match.dayIdx
        }

        const logs = athleteData?.workout_logs || {}
        const logEntry = Object.values(logs).find(l => l.meta?.date === ds)
        days.push({ date, dateStr: ds, programDay, weekIdx, dayIdx, logEntry })
      }

      // Program week number
      const daysSinceStartMon = Math.round((monday - startDate) / (1000 * 60 * 60 * 24))
      let programWeekNum = null
      if (daysSinceStartMon >= 0) {
        const wn = Math.floor(daysSinceStartMon / 7) + 1
        const totalWeeks = (program.weeks || []).length
        if (wn <= totalWeeks) programWeekNum = wn
      }

      if (monday.getTime() === todayMonday.getTime()) cwIdx = weekCounter

      result.push({ monday, days, programWeekNum })
      monday = addDays(monday, 7)
      weekCounter++
    }

    return { weeks: result, currentWeekIndex: cwIdx }
  }, [program, startDate, allProgramDays, athleteData, calAthlete])

  // Scroll to current week on load / athlete change
  useEffect(() => {
    if (currentWeekRef.current) {
      currentWeekRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [calAthlete, program])

  const isToday = (date) => {
    const today = new Date()
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
  }

  const isPast = (date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

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
    const flat = []
    for (const g of (day.exerciseGroups || [])) {
      for (const ex of (g.exercises || [])) flat.push(ex)
    }
    let flatIdx = 0
    outer: for (let g = 0; g < (day.exerciseGroups || []).length; g++) {
      for (let e = 0; e < (day.exerciseGroups[g].exercises || []).length; e++) {
        if (g === groupIdx && e === exIdx) break outer
        flatIdx++
      }
    }
    const newIdx = flatIdx + direction
    if (newIdx < 0 || newIdx >= flat.length) return
    ;[flat[flatIdx], flat[newIdx]] = [flat[newIdx], flat[flatIdx]]
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

  function addExercise(weekIdx, dayIdx) {
    if (!program || !newExName.trim()) return
    const updated = JSON.parse(JSON.stringify(program))
    const day = updated.weeks[weekIdx].days[dayIdx]
    if (!day.exerciseGroups) day.exerciseGroups = []
    let maxOrder = 0
    for (const g of day.exerciseGroups) {
      for (const ex of (g.exercises || [])) {
        const o = parseInt(ex.order) || 0
        if (o > maxOrder) maxOrder = o
      }
    }
    day.exerciseGroups.push({
      type: 'single',
      exercises: [{ order: String(maxOrder + 1), name: newExName.trim(), sets: '3', reps: '10', tempo: '', rest: '90', rpe: '', instruction: '' }]
    })
    setNewExName('')
    saveProgram(updated)
  }

  // Bulk replace exercise name across program
  async function bulkReplace() {
    if (!program || !replaceFrom.trim() || !replaceTo.trim()) return
    const updated = JSON.parse(JSON.stringify(program))
    const fromLower = replaceFrom.trim().toLowerCase()
    let count = 0

    for (const [wi, week] of (updated.weeks || []).entries()) {
      for (const [di, day] of (week.days || []).entries()) {
        // If replaceFromDate is set, skip days before that date
        if (replaceFromDate && startDate) {
          let flatIdx = 0
          for (let w = 0; w < wi; w++) flatIdx += (updated.weeks[w].days || []).length
          flatIdx += di
          const dayDate = new Date(startDate.getTime() + flatIdx * 86400000)
          const fromDate = new Date(replaceFromDate + 'T00:00:00')
          if (dayDate < fromDate) continue
        }

        for (const group of (day.exerciseGroups || [])) {
          for (const ex of (group.exercises || [])) {
            if (ex.name.toLowerCase() === fromLower) {
              ex.name = replaceTo.trim()
              count++
            }
          }
        }
      }
    }

    if (count === 0) {
      toast(`No exercises found matching "${replaceFrom.trim()}"`, 'error')
      return
    }

    await saveProgram(updated)
    toast(`Replaced ${count} instance${count > 1 ? 's' : ''} of "${replaceFrom.trim()}" → "${replaceTo.trim()}"`)
    setShowReplace(false)
    setReplaceFrom('')
    setReplaceTo('')
    setReplaceFromDate('')
  }

  // Move exercise from one day to another
  function moveExerciseToDay(targetWeekIdx, targetDayIdx) {
    if (!program || !movingEx) return
    const updated = JSON.parse(JSON.stringify(program))
    const { weekIdx: srcWi, dayIdx: srcDi, groupIdx: srcGi, exIdx: srcEi } = movingEx

    // Extract exercise from source
    const srcGroup = updated.weeks[srcWi].days[srcDi].exerciseGroups[srcGi]
    const [exercise] = srcGroup.exercises.splice(srcEi, 1)
    if (srcGroup.exercises.length === 0) {
      updated.weeks[srcWi].days[srcDi].exerciseGroups.splice(srcGi, 1)
    }
    // Reorder source day
    let srcOrder = 1
    for (const g of (updated.weeks[srcWi].days[srcDi].exerciseGroups || [])) {
      for (const ex of g.exercises) ex.order = String(srcOrder++)
    }

    // Add to target day
    const targetDay = updated.weeks[targetWeekIdx].days[targetDayIdx]
    if (targetDay.isRest) targetDay.isRest = false // Convert rest day to workout day
    if (!targetDay.exerciseGroups) targetDay.exerciseGroups = []
    let maxOrder = 0
    for (const g of targetDay.exerciseGroups) {
      for (const ex of (g.exercises || [])) {
        const o = parseInt(ex.order) || 0
        if (o > maxOrder) maxOrder = o
      }
    }
    exercise.order = String(maxOrder + 1)
    targetDay.exerciseGroups.push({ type: 'single', exercises: [exercise] })

    setMovingEx(null)
    saveProgram(updated)
  }

  // Get all unique exercise names in program (for autocomplete/suggestions)
  const allExerciseNames = useMemo(() => {
    if (!program) return []
    const names = new Set()
    for (const week of (program.weeks || [])) {
      for (const day of (week.days || [])) {
        for (const group of (day.exerciseGroups || [])) {
          for (const ex of (group.exercises || [])) {
            names.add(ex.name)
          }
        }
      }
    }
    return [...names].sort()
  }, [program])

  async function saveProgram(updated) {
    setSaving(true)
    try {
      await API.updateAthleteProgram(calAthlete, updated)
      setUserData(prev => ({
        ...prev,
        [calAthlete]: { ...prev[calAthlete], assigned_program: updated }
      }))
      toast('Program updated')
    } catch { toast('Save failed', 'error') }
    setSaving(false)
  }

  // Expanded day data
  const expandedData = useMemo(() => {
    if (!expandedDayKey) return null
    for (const week of weeks) {
      for (const cd of week.days) {
        if (cd.dateStr === expandedDayKey) return cd
      }
    }
    return null
  }, [expandedDayKey, weeks])

  const expandedExercises = useMemo(() => {
    if (!expandedData?.programDay) return []
    const hiddenExercises = expandedData.logEntry?.meta?.hidden_exercises || []
    const customExercises = expandedData.logEntry?.meta?.custom_exercises || []
    const exerciseOrder = expandedData.logEntry?.meta?.exercise_order || []
    let exs = []
    for (const [gi, group] of (expandedData.programDay.exerciseGroups || []).entries()) {
      for (const [ei, ex] of (group.exercises || []).entries()) {
        const exKey = ex.order + '_' + ex.name.replace(/\s+/g, '_')
        const isHidden = hiddenExercises.includes(exKey)
        exs.push({ ...ex, _gi: gi, _ei: ei, _hidden: isHidden })
      }
    }
    // Append custom exercises
    for (const cex of customExercises) {
      exs.push({ ...cex, _isCustom: true, _hidden: false, _gi: -1, _ei: -1 })
    }
    // Apply exercise order
    exs = applyExerciseOrder(exs, exerciseOrder)
    return exs
  }, [expandedData])

  return (
    <div>
      {loading && <p style={{ color: 'var(--text-dim)' }}>Loading athletes...</p>}

      {!loading && (
        <>
          {/* Athlete selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={calAthlete} onChange={e => { setCalAthlete(e.target.value); setExpandedDayKey(null) }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>
              {athletes.map(a => (
                <option key={a.username} value={a.username}>{a.username}</option>
              ))}
            </select>
            {program && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{program.name || 'Program'}</span>}
            {program && (
              <button onClick={() => setShowReplace(!showReplace)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: showReplace ? 'var(--accent2)' : 'none', color: showReplace ? '#fff' : 'var(--text-dim)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                ⇄ Replace
              </button>
            )}
            {startDateStr && <span style={{ fontSize: 11, color: 'var(--muted2)' }}>Start: {fmtShort(new Date(startDateStr + 'T00:00:00'))}</span>}
            {saving && <span style={{ fontSize: 11, color: 'var(--accent2)' }}>Saving...</span>}
            {onRefresh && (
              <button onClick={onRefresh} title="Refresh data"
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-dim)', cursor: 'pointer', padding: '4px 10px', fontSize: 12 }}>
                ↻ Refresh
              </button>
            )}
          </div>

          {/* Bulk replace panel */}
          {showReplace && program && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: 12, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>Find exercise</label>
                <ExerciseAutocomplete value={replaceFrom} onChange={setReplaceFrom} placeholder="Current name..." suggestions={allExerciseNames} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>Replace with</label>
                <ExerciseAutocomplete value={replaceTo} onChange={setReplaceTo} placeholder="New name..." suggestions={allExerciseNames} />
              </div>
              <div style={{ minWidth: 130 }}>
                <label style={{ fontSize: 10, color: 'var(--text-dim)', display: 'block', marginBottom: 2 }}>From date (optional)</label>
                <input type="date" value={replaceFromDate} onChange={e => setReplaceFromDate(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '5px 8px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
              </div>
              <button onClick={bulkReplace} disabled={!replaceFrom.trim() || !replaceTo.trim() || saving}
                style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: (replaceFrom.trim() && replaceTo.trim()) ? 'var(--accent2)' : 'var(--border)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: (replaceFrom.trim() && replaceTo.trim()) ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                Replace All
              </button>
            </div>
          )}

          {/* Moving exercise banner */}
          {movingEx && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 10, background: 'rgba(45,212,191,0.1)', border: '1px solid var(--teal)', borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--teal)', fontWeight: 600 }}>→</span>
              <span style={{ color: 'var(--text)', flex: 1 }}>
                Moving <strong>{movingEx.exercise.name}</strong> — click a day to place it there
              </span>
              <button onClick={() => setMovingEx(null)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}

          {!program ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--text-dim)' }}>No program assigned to {calAthlete}.</p>
              <p style={{ fontSize: 12, color: 'var(--muted2)' }}>Assign a program in the Athletes tab first.</p>
            </div>
          ) : (
            <>
              {/* Sticky day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, width: '100%', position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', paddingBottom: 4 }}>
                {DAY_LABELS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Continuous calendar */}
              <div ref={scrollRef}>
                {weeks.map((week, wi) => {
                  const isCurrent = wi === currentWeekIndex
                  return (
                    <div key={localDateStr(week.monday)} ref={isCurrent ? currentWeekRef : undefined}
                      style={{ marginBottom: 8 }}>
                      {/* Week label */}
                      <div style={{ fontSize: 11, color: isCurrent ? 'var(--accent2)' : 'var(--text-dim)', fontWeight: 600, padding: '6px 0 4px', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span>{fmtShort(week.monday)} – {fmtShort(addDays(week.monday, 6))}</span>
                        {week.programWeekNum && <span style={{ color: 'var(--accent2)', fontSize: 10 }}>Program Week {week.programWeekNum}</span>}
                        {isCurrent && <span style={{ background: 'var(--accent2)', color: '#fff', fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Current</span>}
                      </div>

                      {/* 7-column grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, width: '100%' }}>
                        {week.days.map((cd) => {
                          const today = isToday(cd.date)
                          const past = isPast(cd.date)
                          const day = cd.programDay
                          const isRest = day?.isRest
                          const isExpanded = expandedDayKey === cd.dateStr
                          let exercises = []
                          const hiddenExercises = cd.logEntry?.meta?.hidden_exercises || []
                          const customExercises = cd.logEntry?.meta?.custom_exercises || []
                          const exerciseOrder = cd.logEntry?.meta?.exercise_order || []
                          if (day && !isRest) {
                            for (const [gi, group] of (day.exerciseGroups || []).entries()) {
                              for (const [ei, ex] of (group.exercises || []).entries()) {
                                const exKey = ex.order + '_' + ex.name.replace(/\s+/g, '_')
                                const isHidden = hiddenExercises.includes(exKey)
                                exercises.push({ ...ex, _gi: gi, _ei: ei, _hidden: isHidden })
                              }
                            }
                            // Append custom (added) exercises
                            for (const cex of customExercises) {
                              exercises.push({ ...cex, _isCustom: true, _hidden: false })
                            }
                            // Apply exercise order from app
                            exercises = applyExerciseOrder(exercises, exerciseOrder)
                          }
                          const hasLog = !!cd.logEntry
                          const completion = hasLog ? getCompletionPct(cd.logEntry.data || {}) : null

                          const isMovingSource = movingEx && cd.weekIdx === movingEx.weekIdx && cd.dayIdx === movingEx.dayIdx
                          const isMoveTarget = movingEx && day && !isMovingSource

                          return (
                            <div key={cd.dateStr}
                              onClick={() => {
                                if (movingEx && day) {
                                  if (!isMovingSource) moveExerciseToDay(cd.weekIdx, cd.dayIdx)
                                  else setMovingEx(null)
                                } else if (day && (exercises.length > 0 || !isRest)) {
                                  setExpandedDayKey(isExpanded ? null : cd.dateStr)
                                }
                              }}
                              style={{
                                background: isMovingSource ? 'rgba(220,38,38,0.1)' : isMoveTarget ? 'rgba(45,212,191,0.08)' : today ? 'rgba(124,110,240,0.08)' : isExpanded ? 'rgba(124,110,240,0.04)' : 'var(--surface)',
                                border: isMovingSource ? '2px solid #dc2626' : isMoveTarget ? '2px dashed var(--teal)' : today ? '2px solid var(--accent2)' : isExpanded ? '2px solid rgba(124,110,240,0.4)' : '1px solid var(--border)',
                                borderRadius: 10, padding: 10, minHeight: 150,
                                opacity: !day && past && !movingEx ? 0.35 : 1,
                                display: 'flex', flexDirection: 'column',
                                cursor: (movingEx && day) ? 'pointer' : (day && (exercises.length > 0 || !isRest)) ? 'pointer' : 'default',
                                transition: 'border-color 0.15s',
                              }}>
                              {/* Date header */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: today ? 700 : 500, color: today ? 'var(--accent2)' : 'var(--text)' }}>
                                    {cd.date.getDate()}
                                  </span>
                                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                    {cd.date.toLocaleDateString('en-GB', { month: 'short' })}
                                  </span>
                                </div>
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
                                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>Rest Day</span>
                                </div>
                              )}

                              {/* No program day */}
                              {!day && (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 11, color: 'var(--muted2)' }}>—</span>
                                </div>
                              )}

                              {/* Exercise summary (always visible) */}
                              {exercises.length > 0 && (
                                <div style={{ flex: 1, overflow: 'hidden', fontSize: 11 }}>
                                  {exercises.map((ex, fi) => (
                                    <div key={fi} style={{ display: 'flex', gap: 4, padding: '2px 0', alignItems: 'center', borderBottom: fi < exercises.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', opacity: ex._hidden ? 0.4 : 1 }}>
                                      <span style={{ color: ex._isCustom ? 'var(--teal)' : 'var(--accent2)', fontSize: 10, width: 14, flexShrink: 0 }}>{ex._isCustom ? '+' : ex.order}</span>
                                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: ex._hidden ? 'var(--text-dim)' : 'var(--text)', textDecoration: ex._hidden ? 'line-through' : 'none' }}>{ex.name}</span>
                                      <span style={{ color: 'var(--text-dim)', fontSize: 10, flexShrink: 0 }}>{ex.sets}×{ex.reps}</span>
                                    </div>
                                  ))}
                                  {exercises.length > 0 && (
                                    <div style={{ fontSize: 9, color: 'var(--accent2)', marginTop: 4, textAlign: 'center', opacity: 0.7 }}>
                                      {isExpanded ? '▾ click to close' : '▸ click to edit'}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Expanded day editor (modal overlay) */}
          {expandedDayKey && expandedData && expandedData.programDay && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)', zIndex: 100,
              display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20,
            }} onClick={(e) => { if (e.target === e.currentTarget) setExpandedDayKey(null) }}>
              <div style={{
                background: 'var(--modal-bg, rgba(12,12,20,0.97))', borderRadius: 16, padding: 24,
                width: '100%', maxWidth: 540, maxHeight: '80vh', overflow: 'auto',
                border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(20px)',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>
                      {expandedData.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h3>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      Day {expandedData.dayIdx + 1} · Week {expandedData.weekIdx + 1}
                    </span>
                  </div>
                  <button onClick={() => setExpandedDayKey(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
                </div>

                {/* Expand All / Collapse All */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => setExpandedExKey('__all__')}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--accent2)', cursor: 'pointer' }}>
                    Expand All
                  </button>
                  <button onClick={() => setExpandedExKey(null)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
                    Collapse All
                  </button>
                </div>

                {/* Exercise list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {expandedExercises.map((ex, fi) => {
                    const exKey = ex.order + '_' + ex.name.replace(/\s+/g, '_')
                    const isEd = (field) => editingEx?.weekIdx === expandedData.weekIdx && editingEx?.dayIdx === expandedData.dayIdx && editingEx?.groupIdx === ex._gi && editingEx?.exIdx === ex._ei && editingEx?.field === field
                    const isExExpanded = expandedExKey === '__all__' || expandedExKey === exKey
                    const logData = (expandedData.logEntry?.data || {})[exKey] || {}
                    const numSets = parseInt(ex.sets) || 0
                    return (
                      <div key={fi} style={{ opacity: ex._hidden ? 0.4 : 1 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          background: ex._isCustom ? 'rgba(45,212,191,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: isExExpanded ? '8px 8px 0 0' : 8, border: '1px solid var(--border)',
                          borderBottom: isExExpanded ? '1px dashed var(--border)' : '1px solid var(--border)',
                          cursor: 'pointer',
                        }} onClick={(e) => { if (!editingEx) setExpandedExKey(isExExpanded ? null : exKey) }}>
                          <span style={{ color: ex._isCustom ? 'var(--teal)' : 'var(--accent2)', fontSize: 12, fontWeight: 700, width: 20, textAlign: 'center', flexShrink: 0 }}>
                            {ex._isCustom ? '+' : ex.order}
                          </span>

                          {/* Name */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isEd('name') ? (
                              <input value={editVal} onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingEx(null) }}
                                autoFocus style={{ width: '100%', fontSize: 13, padding: '3px 6px', background: 'var(--input-bg)', border: '1px solid var(--accent2)', borderRadius: 4, color: 'var(--text)' }} />
                            ) : (
                              <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: ex._hidden ? 'line-through' : 'none' }}
                                onClick={(e) => { if (!ex._isCustom && !ex._hidden) { e.stopPropagation(); startEdit(expandedData.weekIdx, expandedData.dayIdx, ex._gi, ex._ei, 'name', ex.name) } }}
                                title={ex._hidden ? 'Deleted by athlete' : ex._isCustom ? 'Custom exercise' : 'Click to edit name'}>
                                {ex.name}
                                {ex._isCustom && <span style={{ fontSize: 9, background: 'var(--teal)', color: '#fff', padding: '1px 5px', borderRadius: 3, marginLeft: 6, fontWeight: 600 }}>CUSTOM</span>}
                                {ex._hidden && <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 6 }}>deleted</span>}
                              </div>
                            )}
                          </div>

                          {/* Sets × Reps */}
                          {isEd('sets') ? (
                            <input value={editVal} onChange={e => setEditVal(e.target.value)}
                              onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingEx(null) }}
                              autoFocus style={{ width: 36, fontSize: 12, padding: '2px 4px', background: 'var(--input-bg)', border: '1px solid var(--accent2)', borderRadius: 4, color: 'var(--text)', textAlign: 'center' }} />
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', cursor: ex._isCustom ? 'default' : 'pointer', minWidth: 20, textAlign: 'center' }}
                              onClick={(e) => { if (!ex._isCustom) { e.stopPropagation(); startEdit(expandedData.weekIdx, expandedData.dayIdx, ex._gi, ex._ei, 'sets', ex.sets) } }}
                              title="Click to edit sets">{ex.sets}</span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--muted2)' }}>×</span>
                          {isEd('reps') ? (
                            <input value={editVal} onChange={e => setEditVal(e.target.value)}
                              onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingEx(null) }}
                              autoFocus style={{ width: 36, fontSize: 12, padding: '2px 4px', background: 'var(--input-bg)', border: '1px solid var(--accent2)', borderRadius: 4, color: 'var(--text)', textAlign: 'center' }} />
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-dim)', cursor: ex._isCustom ? 'default' : 'pointer', minWidth: 20, textAlign: 'center' }}
                              onClick={(e) => { if (!ex._isCustom) { e.stopPropagation(); startEdit(expandedData.weekIdx, expandedData.dayIdx, ex._gi, ex._ei, 'reps', ex.reps) } }}
                              title="Click to edit reps">{ex.reps}</span>
                          )}

                          {/* Expand indicator */}
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{isExExpanded ? '▾' : '▸'}</span>

                          {/* Move / Delete buttons (only for program exercises) */}
                          {!ex._isCustom && !ex._hidden && (
                            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                              <button onClick={(e) => { e.stopPropagation(); moveExercise(expandedData.weekIdx, expandedData.dayIdx, ex._gi, ex._ei, -1) }}
                                disabled={fi === 0} title="Move up"
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: fi === 0 ? 'default' : 'pointer', color: fi === 0 ? 'var(--border)' : 'var(--accent2)', fontSize: 11, padding: '2px 6px', lineHeight: 1 }}>▲</button>
                              <button onClick={(e) => { e.stopPropagation(); moveExercise(expandedData.weekIdx, expandedData.dayIdx, ex._gi, ex._ei, 1) }}
                                disabled={fi === expandedExercises.length - 1} title="Move down"
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: fi === expandedExercises.length - 1 ? 'default' : 'pointer', color: fi === expandedExercises.length - 1 ? 'var(--border)' : 'var(--accent2)', fontSize: 11, padding: '2px 6px', lineHeight: 1 }}>▼</button>
                              <button onClick={(e) => { e.stopPropagation(); setMovingEx({ weekIdx: expandedData.weekIdx, dayIdx: expandedData.dayIdx, groupIdx: ex._gi, exIdx: ex._ei, exercise: ex }); setExpandedDayKey(null) }} title="Move to another day"
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 10, padding: '2px 5px', lineHeight: 1 }}>→</button>
                              <button onClick={(e) => { e.stopPropagation(); removeExercise(expandedData.weekIdx, expandedData.dayIdx, ex._gi, ex._ei) }} title="Remove"
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontSize: 12, padding: '2px 6px', lineHeight: 1 }}>×</button>
                            </div>
                          )}
                        </div>

                        {/* Expanded exercise details: workout log data */}
                        {isExExpanded && (
                          <div style={{
                            background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 8px 8px', border: '1px solid var(--border)', borderTop: 'none',
                            padding: '8px 10px', fontSize: 12,
                          }}>
                            {Object.keys(logData).filter(k => k.startsWith('set')).length > 0 ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'left' }}>
                                    <th style={{ padding: '2px 4px', width: 30 }}>Set</th>
                                    <th style={{ padding: '2px 4px' }}>Weight</th>
                                    <th style={{ padding: '2px 4px' }}>Reps</th>
                                    <th style={{ padding: '2px 4px', width: 30 }}>✓</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Array.from({ length: Math.max(numSets, ...Object.keys(logData).filter(k => k.startsWith('set')).map(k => parseInt(k.replace('set', '')) || 0)) }, (_, i) => {
                                    const setNum = i === 0 ? 0 : i // set0 = warmup, then set1, set2...
                                    const sKey = 'set' + setNum
                                    const sd = logData[sKey]
                                    if (!sd && setNum === 0) return null // skip warmup if no data
                                    if (!sd && setNum > numSets) return null
                                    return (
                                      <tr key={setNum} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ padding: '3px 4px', color: setNum === 0 ? '#f59e0b' : 'var(--text-dim)', fontWeight: setNum === 0 ? 700 : 400 }}>
                                          {setNum === 0 ? 'W' : setNum}
                                        </td>
                                        <td style={{ padding: '3px 4px', color: 'var(--text)' }}>{sd?.weight || '—'}</td>
                                        <td style={{ padding: '3px 4px', color: 'var(--text)' }}>{sd?.reps || '—'}</td>
                                        <td style={{ padding: '3px 4px', color: sd?.done ? '#22c55e' : 'var(--text-dim)' }}>{sd?.done ? '✓' : '—'}</td>
                                      </tr>
                                    )
                                  }).filter(Boolean)}
                                </tbody>
                              </table>
                            ) : (
                              <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 11 }}>No workout data logged yet</div>
                            )}
                            {logData.notes && (
                              <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(124,110,240,0.06)', borderRadius: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                                📝 {logData.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Add exercise */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <input value={newExName} onChange={e => setNewExName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addExercise(expandedData.weekIdx, expandedData.dayIdx) }}
                    placeholder="Add exercise..."
                    style={{ flex: 1, fontSize: 13, padding: '6px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                  <button onClick={() => addExercise(expandedData.weekIdx, expandedData.dayIdx)}
                    disabled={!newExName.trim()}
                    style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: newExName.trim() ? 'var(--accent2)' : 'var(--border)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: newExName.trim() ? 'pointer' : 'default' }}>
                    + Add
                  </button>
                </div>

                {saving && <div style={{ fontSize: 11, color: 'var(--accent2)', marginTop: 8 }}>Saving...</div>}
              </div>
            </div>
          )}
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

  // Data loading function — reusable for initial load and refresh
  async function loadAllData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const d = await API.listUsers()
      setUsers(d.users || [])
      const dataMap = {}
      await Promise.all(
        (d.users || []).map(async u => {
          try {
            const ud = await API.getUserData(u.username)
            // If user has a program name in users.json but no assigned_program in user_data,
            // load the program from the library so the calendar can display it
            if (!ud.assigned_program && u.program) {
              try {
                const libProg = await API.getProgram(u.program)
                if (libProg && libProg.weeks && libProg.weeks.length > 0) {
                  ud.assigned_program = libProg
                  ud.assigned_program_date = u.startDate || ''
                  console.log(`[Dashboard] ${u.username}: loaded program '${u.program}' from library (${libProg.weeks.length} weeks)`)
                }
              } catch (pe) {
                console.warn(`[Dashboard] ${u.username}: could not load program '${u.program}' from library:`, pe)
              }
            }
            dataMap[u.username] = ud
            const logCount = Object.keys(ud?.workout_logs || {}).length
            const hasProgram = !!ud?.assigned_program
            console.log(`[Dashboard] ${u.username}: logs=${logCount}, program=${hasProgram}, startDate=${u.startDate || 'none'}`)
          } catch (e) {
            console.warn(`[Dashboard] Failed to load ${u.username}:`, e)
          }
        })
      )
      setUserData(dataMap)
    } catch { if (!silent) toast('Failed to load users', 'error') }
    setLoading(false)
  }

  // Initial load
  useEffect(() => { loadAllData() }, [])

  // Re-fetch when switching to overview tab (picks up newly assigned programs)
  useEffect(() => {
    if (activeTab === 'overview' && users.length > 0) {
      loadAllData(true)
    }
  }, [activeTab])

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
        <CalendarOverview athletes={athletes} userData={userData} setUserData={setUserData} loading={loading} toast={toast} onRefresh={() => loadAllData(true)} />
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
