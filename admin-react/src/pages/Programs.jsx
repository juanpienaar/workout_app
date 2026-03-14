import React, { useState, useEffect, useCallback, useRef } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import MuscleHeatmap from '../components/MuscleHeatmap'
import { calculateMuscleLoad } from '../utils/muscleLoad'
import { PROGRAM_TYPES, MODEL_COSTS } from '../utils/constants'
import Modal from '../components/Modal'
import { Icon } from '../components/Icons'
import HelpTip from '../components/HelpTip'

/* ═══════════════════════════════════════════════════════════
   TAB STYLE (shared)
   ═══════════════════════════════════════════════════════════ */
const tabStyle = (active) => ({
  padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 500,
  color: active ? 'var(--accent2)' : 'var(--text-dim)',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  background: 'none', border: 'none', borderBottomStyle: 'solid',
})

/* ═══════════════════════════════════════════════════════════
   PROGRAMS TAB
   ═══════════════════════════════════════════════════════════ */
function exerciseSummary(week) {
  const names = []
  for (const day of (week.days || [])) {
    if (day.isRest) continue
    for (const g of (day.exerciseGroups || [])) {
      for (const ex of g.exercises) {
        if (!names.includes(ex.name)) names.push(ex.name)
      }
    }
  }
  if (names.length <= 5) return names.join(', ')
  return names.slice(0, 5).join(', ') + ` +${names.length - 5} more`
}

function daySummary(day) {
  if (day.isRest) return 'Rest'
  const exCount = (day.exerciseGroups || []).reduce((s, g) => s + g.exercises.length, 0)
  const names = []
  for (const g of (day.exerciseGroups || [])) {
    for (const ex of g.exercises) {
      if (names.length < 3 && !names.includes(ex.name)) names.push(ex.name)
    }
  }
  const label = names.join(', ') + (exCount > 3 ? ` +${exCount - 3}` : '')
  return `${exCount} exercises — ${label}`
}

function ProgramsTab() {
  const toast = useToast()
  const [programs, setPrograms] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const [openWeeks, setOpenWeeks] = useState(new Set())
  const [openDays, setOpenDays] = useState(new Set())
  const [expandAllWeek, setExpandAllWeek] = useState(null)
  const [assignModal, setAssignModal] = useState(null) // { programName }
  const [athletes, setAthletes] = useState([])
  const [selectedAthletes, setSelectedAthletes] = useState([])
  const [assignStartDate, setAssignStartDate] = useState('')
  const [assigning, setAssigning] = useState(false)

  const load = async () => {
    try { const d = await API.listPrograms(); setPrograms(d.programs) }
    catch { toast('Failed to load', 'error') }
  }
  useEffect(() => { load() }, [])

  async function openAssign(programName) {
    setAssignModal({ programName })
    setSelectedAthletes([])
    setAssignStartDate(new Date().toISOString().slice(0, 10))
    try {
      const d = await API.listUsers()
      setAthletes(d.users || [])
    } catch { toast('Failed to load athletes', 'error') }
  }

  async function doAssign() {
    if (selectedAthletes.length === 0) { toast('Select at least one user', 'error'); return }
    setAssigning(true)
    try {
      await Promise.all(selectedAthletes.map(name =>
        API.assignProgram({ athlete: name, program: assignModal.programName, startDate: assignStartDate })
      ))
      toast(`Assigned to ${selectedAthletes.length} user(s)`)
      setAssignModal(null)
    } catch { toast('Assign failed', 'error') }
    setAssigning(false)
  }

  async function toggleProgram(name) {
    if (expanded === name) { setExpanded(null); setDetail(null); setOpenWeeks(new Set()); setOpenDays(new Set()); return }
    setExpanded(name)
    setOpenWeeks(new Set()); setOpenDays(new Set())
    try { const d = await API.getProgram(name); setDetail(d) }
    catch { toast('Failed to load program', 'error') }
  }

  function toggleWeek(w) {
    setOpenWeeks(prev => { const next = new Set(prev); if (next.has(w)) { next.delete(w); setExpandAllWeek(null) } else next.add(w); return next })
  }
  function toggleDay(key) {
    setOpenDays(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }
  function expandAllDays(weekNum) {
    if (expandAllWeek === weekNum) {
      setOpenDays(prev => { const next = new Set(prev); for (const k of prev) { if (k.startsWith(`w${weekNum}-`)) next.delete(k) } return next })
      setExpandAllWeek(null)
    } else {
      const week = (detail?.weeks || []).find(w => w.week === weekNum)
      if (!week) return
      setOpenDays(prev => { const next = new Set(prev); for (const day of (week.days || [])) { next.add(`w${weekNum}-d${day.day}`) } return next })
      setExpandAllWeek(weekNum)
    }
  }

  async function duplicate(name) {
    const newName = prompt(`Duplicate "${name}" as:`, `${name} (Copy)`)
    if (!newName) return
    try { await API.duplicateProgram(name, newName); toast('Duplicated'); load() }
    catch { toast('Failed', 'error') }
  }
  async function remove(name) {
    if (!confirm(`Delete "${name}"?`)) return
    try { await API.deleteProgram(name); toast('Deleted'); if (expanded === name) setExpanded(null); load() }
    catch { toast('Failed', 'error') }
  }
  async function rebuild() {
    try { await API.build(); toast('Build complete!'); load() }
    catch { toast('Build failed', 'error') }
  }

  const muscleLoads = detail ? calculateMuscleLoad(detail) : null

  return (
    <div>
      <div className="toolbar">
        <div />
        <button className="btn btn-secondary btn-sm" onClick={rebuild}>Rebuild JSON <HelpTip text="Regenerates program.json from program.csv. Only needed after manually editing the CSV file." /></button>
      </div>
      {programs.map(p => (
        <div key={p.name} className="program-card">
          <div className="program-header" onClick={() => toggleProgram(p.name)}>
            <div>
              <h3>{p.name}</h3>
              <span className="meta">{p.weeks} weeks · {p.days_per_week} days/week</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <button className="btn btn-primary btn-sm" onClick={() => openAssign(p.name)}>Assign</button>
              <button className="btn btn-secondary btn-sm" onClick={() => duplicate(p.name)}>Duplicate</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(p.name)}>Delete</button>
            </div>
          </div>
          {expanded === p.name && detail && (
            <div style={{ padding: '0 16px 16px' }}>
              {muscleLoads && <MuscleHeatmap loads={muscleLoads} />}
              {(detail.weeks || []).map(week => {
                const wKey = week.week
                const isWeekOpen = openWeeks.has(wKey)
                const trainingDays = (week.days || []).filter(d => !d.isRest).length
                const restDays = (week.days || []).filter(d => d.isRest).length
                return (
                  <div key={wKey} className="drill-week">
                    <div className="drill-week-header" onClick={() => toggleWeek(wKey)}>
                      <div className="drill-toggle">{isWeekOpen ? '−' : '+'}</div>
                      <div className="drill-week-title">
                        <span>Week {wKey}</span>
                        <span className="drill-meta">{trainingDays} training · {restDays} rest</span>
                      </div>
                      {!isWeekOpen && <div className="drill-summary">{exerciseSummary(week)}</div>}
                    </div>
                    {isWeekOpen && (
                      <div className="drill-week-body">
                        <div className="drill-expand-all">
                          <button className="btn-link" onClick={(e) => { e.stopPropagation(); expandAllDays(wKey) }}>
                            {expandAllWeek === wKey ? 'Collapse all days' : 'Expand all days'}
                          </button>
                        </div>
                        {(week.days || []).map(day => {
                          const dKey = `w${wKey}-d${day.day}`
                          const isDayOpen = openDays.has(dKey)
                          return (
                            <div key={day.day} className="drill-day">
                              <div className="drill-day-header" onClick={() => toggleDay(dKey)}>
                                <div className="drill-toggle drill-toggle-sm">{isDayOpen ? '−' : '+'}</div>
                                <div className="drill-day-title">
                                  <span>Day {day.day}{day.isRest ? <span className="rest-badge">Rest</span> : ''}</span>
                                  {!isDayOpen && !day.isRest && <span className="drill-day-summary">{daySummary(day)}</span>}
                                  {!isDayOpen && day.isRest && day.restNote && <span className="drill-day-summary">{day.restNote}</span>}
                                </div>
                              </div>
                              {isDayOpen && !day.isRest && (
                                <div className="drill-day-body">
                                  {(day.exerciseGroups || []).map((group, gi) => (
                                    <div key={gi} className={group.exercises.length > 1 ? 'superset-bar' : ''}>
                                      {group.exercises.length > 1 && (
                                        <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 2 }}>
                                          {group.type === 'superset' ? 'Superset' : group.type === 'circuit' ? 'Circuit' : ''}
                                        </div>
                                      )}
                                      <div className="exercise-row exercise-row-header">
                                        <span>#</span><span>Exercise</span><span>Sets</span><span>Reps</span><span>Tempo <HelpTip text="Ecc-Pause-Con-Pause in seconds." style={{ fontSize: 7 }} /></span><span>Rest</span><span>RPE <HelpTip text="1-10 effort scale. 7 = 3 reps in reserve." style={{ fontSize: 7 }} /></span>
                                      </div>
                                      {group.exercises.map((ex, ei) => (
                                        <div key={ei} className="exercise-row">
                                          <span className="order">{ex.order}</span>
                                          <span>{ex.name}</span>
                                          <span className="dim">{ex.sets}</span>
                                          <span className="dim">{ex.reps}</span>
                                          <span className="dim">{ex.tempo}</span>
                                          <span className="dim">{ex.rest}</span>
                                          <span className="dim">{ex.rpe || ''}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {isDayOpen && day.isRest && (
                                <div className="drill-day-body">
                                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13, padding: '4px 0' }}>
                                    {day.restNote || 'Rest day — active recovery'}
                                  </div>
                                </div>
                              )}
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
        </div>
      ))}

      {assignModal && (
        <Modal title={`Assign "${assignModal.programName}"`} onClose={() => setAssignModal(null)} actions={[
          { label: 'Cancel', cls: 'btn-secondary', onClick: () => setAssignModal(null) },
          { label: assigning ? 'Assigning...' : 'Assign', cls: 'btn-primary', onClick: doAssign },
        ]}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Start Date</label>
            <input type="date" value={assignStartDate} onChange={e => setAssignStartDate(e.target.value)} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>Select users to assign this program to:</p>
          {athletes.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No users found.</p>}
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {athletes.map(u => (
              <label key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: selectedAthletes.includes(u.username) ? 'rgba(124,110,240,0.1)' : 'var(--input-bg)', cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={selectedAthletes.includes(u.username)}
                  onChange={e => setSelectedAthletes(prev => e.target.checked ? [...prev, u.username] : prev.filter(n => n !== u.username))} />
                <span>{u.username}</span>
                {u.role === 'coach' && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(52,211,153,0.15)', color: 'var(--teal)' }}>COACH</span>}
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>{u.program || 'No program'}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   EXERCISES TAB
   ═══════════════════════════════════════════════════════════ */
function ExercisesTab() {
  const toast = useToast()
  const [data, setData] = useState({})
  const [search, setSearch] = useState('')
  const [openGroups, setOpenGroups] = useState(new Set())
  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState({ group: '', name: '', equipment: '' })
  const [moveModal, setMoveModal] = useState(null)
  const [category, setCategory] = useState('Strength')

  // CrossFit state
  const [crossfitTab, setCrossfitTab] = useState('movements')
  const [showWorkoutBuilder, setShowWorkoutBuilder] = useState(false)
  const [workoutForm, setWorkoutForm] = useState({
    name: '',
    format: 'AMRAP',
    timeCap: '15',
    rounds: '3',
    movements: []
  })
  const [workoutMovement, setWorkoutMovement] = useState({ movement: '', reps: '', distance: '' })
  const [savedWorkouts, setSavedWorkouts] = useState([...crossfitOpenWods])

  // Custom exercises state
  const [customCardio, setCustomCardio] = useState([])
  const [newCardioName, setNewCardioName] = useState('')
  const [customOlympic, setCustomOlympic] = useState([])
  const [newOlympicName, setNewOlympicName] = useState('')
  const [newOlympicCategory, setNewOlympicCategory] = useState('Snatch Variations')
  const [customCrossfitMoves, setCustomCrossfitMoves] = useState([])
  const [newCrossfitMove, setNewCrossfitMove] = useState('')

  const load = async () => {
    try { setData(await API.getExercises()) } catch { toast('Failed to load', 'error') }
  }
  useEffect(() => { load() }, [])

  const groups = Object.keys(data)
  const totalExercises = groups.reduce((sum, g) => {
    for (const exList of Object.values(data[g])) sum += exList.length
    return sum
  }, 0)

  function toggleGroup(g) {
    setOpenGroups(prev => { const next = new Set(prev); next.has(g) ? next.delete(g) : next.add(g); return next })
  }
  async function remove(group, name) {
    if (!confirm(`Delete "${name}" from ${group}?`)) return
    try { await API.deleteExercise(group, name); toast('Deleted'); load() }
    catch { toast('Failed', 'error') }
  }
  async function add() {
    if (!form.name) { toast('Name required', 'error'); return }
    try {
      await API.addExercise(form.group || groups[0], { name: form.name, equipment: form.equipment })
      toast('Added'); setAddModal(false); load()
    } catch { toast('Failed', 'error') }
  }
  async function moveExercise(name, fromGroup, equipment, toGroup) {
    if (toGroup === fromGroup) { setMoveModal(null); return }
    try {
      await API.addExercise(toGroup, { name, equipment })
      await API.deleteExercise(fromGroup, name)
      toast(`Moved "${name}" to ${toGroup}`)
      setMoveModal(null); load()
    } catch { toast('Move failed', 'error') }
  }

  useEffect(() => { if (search) setOpenGroups(new Set(groups)) }, [search])

  const sortedGroups = [...groups].sort((a, b) => {
    if (a === 'Custom') return 1; if (b === 'Custom') return -1; return a.localeCompare(b)
  })

  // Cardio exercises (default)
  const cardioExercises = ['Stairmaster', 'Treadmill', 'Rowing Machine', 'Ski Erg', 'Assault Bike', 'Spin Bike']

  // CrossFit movements
  const crossfitMovements = [
    'Muscle Ups', 'Box Jumps', 'Walking Lunges', 'Shoulder to Overhead (Bar)',
    'Shoulder to Overhead (Dumbbell)', 'Thrusters', 'Double Unders', 'Wall Walks',
    'Snatches', 'Clean & Jerk', 'Toes to Bar', 'Handstand Push Ups', 'Rope Climbs',
    'Burpees', 'Kettlebell Swings', 'Pull Ups', 'Ring Dips', 'Pistol Squats',
    'Wall Balls', 'Assault Bike Calories', 'Row Calories'
  ]

  // CrossFit benchmark WODs
  const benchmarkWods = [
    { name: 'Fran', description: '21-15-9 reps: Thrusters (95/65 lbs), Pull Ups' },
    { name: 'Murph', description: '1 mile run, 100 pull ups, 200 push ups, 300 air squats, 1 mile run (partition as needed)' },
    { name: 'Grace', description: '30 reps: Clean & Jerk (135/95 lbs)' },
    { name: 'Diane', description: '21-15-9 reps: Deadlifts (225/155 lbs), Handstand Push Ups' },
    { name: 'Helen', description: '3 rounds: 400m run, 21 kettlebell swings (53/35 lbs), 12 pull ups' },
    { name: 'Isabel', description: '30 reps: Snatches (135/95 lbs)' },
    { name: 'Jackie', description: '1000m row, 50 thrusters (45/35 lbs), 30 pull ups' },
    { name: 'Karen', description: '150 wall balls (20/14 lbs) for time' },
    { name: 'Annie', description: '50-40-30-20-10 reps: Double unders, sit ups' },
    { name: 'Cindy', description: '20 min AMRAP: 5 pull ups, 10 push ups, 15 air squats' },
    { name: 'Fight Gone Bad', description: '3 rounds x 1 min each station: Wall balls, sumo deadlift high pulls, box jumps, push press, row calories' },
    { name: 'DT', description: '5 rounds: 12 deadlifts, 9 hang power cleans, 6 push jerks (135/95 lbs)' }
  ]

  // Olympic Lifting variations
  const olympicLifts = {
    'Snatch Variations': [
      'Snatch', 'Power Snatch', 'Hang Snatch', 'Snatch Pull',
      'Snatch Grip Deadlift', 'Overhead Squat'
    ],
    'Clean & Jerk Variations': [
      'Clean', 'Power Clean', 'Hang Clean', 'Clean Pull',
      'Push Jerk', 'Split Jerk', 'Push Press'
    ],
    'Accessory': [
      'Front Squat', 'Back Squat', 'Romanian Deadlift',
      'Good Morning', 'Snatch Balance'
    ]
  }

  // Tab styles
  const categoryTabStyle = (active) => ({
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: active ? 'var(--accent2)' : 'var(--text-dim)',
    background: active ? 'rgba(167,139,250,0.08)' : 'transparent',
    border: '1px solid',
    borderColor: active ? 'var(--accent2)' : 'var(--border)',
    borderRadius: 6,
    margin: '0 4px'
  })

  const subtabStyle = (active) => ({
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    color: active ? 'var(--accent2)' : 'var(--text-dim)',
    background: active ? 'rgba(167,139,250,0.1)' : 'transparent',
    border: 'none',
    borderRadius: 12,
    margin: '0 4px'
  })

  // Strength category render
  const renderStrengthCategory = () => (
    <div>
      <div className="info-banner">
        <div className="info-banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>
        <div>
          <div className="info-banner-title">Used by the AI Program Builder</div>
          <div className="info-banner-text">
            This library ({totalExercises} exercises across {groups.length} muscle groups) is sent to Claude when generating programs.
            Exercises added by athletes appear in <strong>Custom</strong> — use the move button to recategorize them.
          </div>
        </div>
      </div>
      <div className="toolbar">
        <input type="search" className="search-input" placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({ group: groups[0] || '', name: '', equipment: '' }); setAddModal(true) }}>+ Add Exercise</button>
      </div>
      {sortedGroups.map(group => {
        const equipTypes = data[group]
        let count = 0
        const matchSections = []
        for (const [equip, exList] of Object.entries(equipTypes)) {
          const filtered = search ? exList.filter(e => e.name.toLowerCase().includes(search.toLowerCase())) : exList
          if (!filtered.length) continue
          count += filtered.length
          matchSections.push({ equip, exercises: filtered })
        }
        if (search && count === 0) return null
        const isCustom = group === 'Custom'
        return (
          <div key={group} className="muscle-group" style={isCustom ? { borderColor: 'rgba(167,139,250,0.25)' } : undefined}>
            <div className="muscle-group-header" onClick={() => toggleGroup(group)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="drill-toggle drill-toggle-sm">{openGroups.has(group) ? '−' : '+'}</span>
                <span>{group}</span>
                {isCustom && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(167,139,250,0.15)', color: 'var(--accent2)', fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>ATHLETE-ADDED</span>}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{count} exercises</span>
            </div>
            {openGroups.has(group) && (
              <div className="muscle-group-body" style={{ display: 'block' }}>
                {matchSections.map(({ equip, exercises }) => (
                  <div key={equip} style={{ marginBottom: 10 }}>
                    <div className="equip-label">{equip}</div>
                    {exercises.map(ex => (
                      <div key={ex.name} className="exercise-item">
                        <span>{ex.name}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" title="Move to another muscle group" style={{ fontSize: 12, padding: '4px 6px' }}
                            onClick={() => setMoveModal({ name: ex.name, fromGroup: group, equipment: equip })}><Icon name="move" size={12} /></button>
                          <button className="btn-icon" style={{ fontSize: 14 }} onClick={() => remove(group, ex.name)}><Icon name="delete" size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // Cardio category render
  const renderCardioCategory = () => (
    <div>
      <div className="info-banner">
        <div className="info-banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.78.77L12 20.65l7.64-7.65.78-.77a5.4 5.4 0 0 0 0-7.65z"/></svg></div>
        <div>
          <div className="info-banner-title">Cardio Exercises</div>
          <div className="info-banner-text">
            Common cardiovascular training equipment and methods for conditioning work.
          </div>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 16 }}>
        <input
          type="text"
          className="search-input"
          placeholder="New cardio exercise..."
          value={newCardioName}
          onChange={e => setNewCardioName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newCardioName.trim()) {
              setCustomCardio([...customCardio, newCardioName.trim()])
              setNewCardioName('')
              toast('Cardio exercise added')
            }
          }}
        />
        <button className="btn btn-primary btn-sm" onClick={() => {
          if (newCardioName.trim()) {
            setCustomCardio([...customCardio, newCardioName.trim()])
            setNewCardioName('')
            toast('Cardio exercise added')
          }
        }}>+ Add Exercise</button>
      </div>
      <div style={{ marginTop: 16 }}>
        {cardioExercises.map(ex => (
          <div key={ex} className="exercise-item" style={{ marginBottom: 8 }}>
            <span>{ex}</span>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Default</div>
          </div>
        ))}
        {customCardio.map((ex, idx) => (
          <div key={`custom-${ex}`} className="exercise-item" style={{ marginBottom: 8 }}>
            <span>{ex}</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(167,139,250,0.15)', color: 'var(--accent2)', fontWeight: 600 }}>CUSTOM</span>
              <button className="btn-icon" style={{ fontSize: 14 }} onClick={() => {
                setCustomCardio(customCardio.filter((_, i) => i !== idx))
                toast('Exercise removed')
              }}><Icon name="delete" size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // CrossFit category render
  const renderCrossfitCategory = () => (
    <div>
      <div className="info-banner">
        <div className="info-banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
        <div>
          <div className="info-banner-title">CrossFit Library</div>
          <div className="info-banner-text">
            Common CrossFit movements, benchmark WODs, and a tool to build custom workouts.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {['movements', 'benchmarks', 'builder'].map(tab => (
          <button
            key={tab}
            style={subtabStyle(crossfitTab === tab)}
            onClick={() => setCrossfitTab(tab)}
          >
            {tab === 'movements' && 'Movements'}
            {tab === 'benchmarks' && 'Benchmark WODs'}
            {tab === 'builder' && 'Workout Builder'}
          </button>
        ))}
      </div>

      {crossfitTab === 'movements' && (
        <div style={{ marginTop: 16 }}>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <input
              type="text"
              className="search-input"
              placeholder="New CrossFit movement..."
              value={newCrossfitMove}
              onChange={e => setNewCrossfitMove(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newCrossfitMove.trim()) {
                  setCustomCrossfitMoves([...customCrossfitMoves, newCrossfitMove.trim()])
                  setNewCrossfitMove('')
                  toast('Movement added')
                }
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => {
              if (newCrossfitMove.trim()) {
                setCustomCrossfitMoves([...customCrossfitMoves, newCrossfitMove.trim()])
                setNewCrossfitMove('')
                toast('Movement added')
              }
            }}>+ Add Movement</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {crossfitMovements.map(mov => (
              <div
                key={mov}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: 'rgba(167,139,250,0.1)',
                  border: '1px solid rgba(167,139,250,0.2)',
                  color: 'var(--accent2)',
                  fontSize: 13,
                  fontWeight: 500
                }}
              >
                {mov}
              </div>
            ))}
            {customCrossfitMoves.map((mov, idx) => (
              <div key={`custom-${mov}`} style={{ padding: '8px 12px', borderRadius: 12, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', color: 'var(--accent2)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                {mov}
                <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, padding: 0 }} onClick={() => {
                  setCustomCrossfitMoves(customCrossfitMoves.filter((_, i) => i !== idx))
                  toast('Movement removed')
                }}>x</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {crossfitTab === 'benchmarks' && (
        <div style={{ marginTop: 16 }}>
          {benchmarkWods.map(wod => (
            <div key={wod.name} className="muscle-group" style={{ marginBottom: 12 }}>
              <div className="muscle-group-header" onClick={() => toggleGroup(`wod-${wod.name}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="drill-toggle drill-toggle-sm">{openGroups.has(`wod-${wod.name}`) ? '−' : '+'}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent2)' }}>{wod.name}</span>
                </div>
              </div>
              {openGroups.has(`wod-${wod.name}`) && (
                <div className="muscle-group-body" style={{ display: 'block', padding: '12px 16px' }}>
                  <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5 }}>{wod.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {crossfitTab === 'builder' && (
        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowWorkoutBuilder(!showWorkoutBuilder)}
            style={{ marginBottom: 16 }}
          >
            {showWorkoutBuilder ? '▼ Close' : '▶ New Workout'}
          </button>

          {showWorkoutBuilder && (
            <div style={{ borderRadius: 8, border: '1px solid var(--border)', padding: 16, background: 'rgba(167,139,250,0.04)' }}>
              <div className="form-group">
                <label>Workout Name</label>
                <input type="text" value={workoutForm.name} onChange={e => setWorkoutForm({ ...workoutForm, name: e.target.value })} placeholder="e.g. The Grinder" />
              </div>
              <div className="form-group">
                <label>Workout Format</label>
                <select value={workoutForm.format} onChange={e => setWorkoutForm({ ...workoutForm, format: e.target.value })}>
                  <option>AMRAP</option>
                  <option>EMOM</option>
                  <option>For Time</option>
                  <option>Rounds For Time</option>
                  <option>Chipper</option>
                </select>
              </div>

              {(workoutForm.format === 'AMRAP' || workoutForm.format === 'For Time') && (
                <div className="form-group">
                  <label>Time Cap (minutes)</label>
                  <input
                    type="number"
                    value={workoutForm.timeCap}
                    onChange={e => setWorkoutForm({ ...workoutForm, timeCap: e.target.value })}
                    placeholder="15"
                  />
                </div>
              )}

              {(workoutForm.format === 'Rounds For Time' || workoutForm.format === 'EMOM') && (
                <div className="form-group">
                  <label>Rounds / Stations</label>
                  <input
                    type="number"
                    value={workoutForm.rounds}
                    onChange={e => setWorkoutForm({ ...workoutForm, rounds: e.target.value })}
                    placeholder="3"
                  />
                </div>
              )}

              <div style={{ marginTop: 16, padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12 }}>Add Movements</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <select
                    value={workoutMovement.movement}
                    onChange={e => setWorkoutMovement({ ...workoutMovement, movement: e.target.value })}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select movement...</option>
                    {[...crossfitMovements, ...customCrossfitMoves].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input
                    type="text"
                    placeholder="Reps/Distance"
                    value={workoutMovement.reps}
                    onChange={e => setWorkoutMovement({ ...workoutMovement, reps: e.target.value })}
                    style={{ width: 80 }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (workoutMovement.movement && workoutMovement.reps) {
                        setWorkoutForm({
                          ...workoutForm,
                          movements: [...workoutForm.movements, { ...workoutMovement }]
                        })
                        setWorkoutMovement({ movement: '', reps: '', distance: '' })
                        toast('Movement added')
                      }
                    }}
                  >
                    Add
                  </button>
                </div>

                {workoutForm.movements.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>Workout Preview</div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 4 }}>
                      {workoutForm.movements.map((mov, idx) => (
                        <div key={idx} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span>{mov.movement}</span>
                          <span style={{ color: 'var(--accent2)' }}>{mov.reps}</span>
                          <button
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-dim)',
                              cursor: 'pointer',
                              fontSize: 12
                            }}
                            onClick={() => {
                              setWorkoutForm({
                                ...workoutForm,
                                movements: workoutForm.movements.filter((_, i) => i !== idx)
                              })
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setShowWorkoutBuilder(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (!workoutForm.name.trim()) { toast('Enter a workout name', 'error'); return }
                    if (workoutForm.movements.length === 0) { toast('Add at least one movement', 'error'); return }
                    const workout = {
                      name: workoutForm.name.trim(),
                      format: workoutForm.format,
                      timeCap: workoutForm.timeCap,
                      rounds: workoutForm.rounds,
                      movements: [...workoutForm.movements],
                      isCustom: true
                    }
                    setSavedWorkouts([...savedWorkouts, workout])
                    toast('Workout saved!')
                    setShowWorkoutBuilder(false)
                    setWorkoutForm({ name: '', format: 'AMRAP', timeCap: '15', rounds: '3', movements: [] })
                  }}
                >
                  Save Workout
                </button>
              </div>
            </div>
          )}

          {/* Saved Workouts */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Saved Workouts ({savedWorkouts.length})
            </div>
            {savedWorkouts.map((wod, idx) => (
              <div key={`${wod.name}-${idx}`} className="muscle-group" style={{ marginBottom: 12 }}>
                <div className="muscle-group-header" onClick={() => toggleGroup(`saved-wod-${wod.name}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="drill-toggle drill-toggle-sm">{openGroups.has(`saved-wod-${wod.name}`) ? '−' : '+'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent2)' }}>{wod.name}</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: wod.isCustom ? 'rgba(167,139,250,0.15)' : 'rgba(45,212,191,0.15)', color: wod.isCustom ? 'var(--accent2)' : 'var(--teal)', fontWeight: 600 }}>
                      {wod.isCustom ? 'CUSTOM' : wod.year ? `OPEN ${wod.year}` : 'OPEN'}
                    </span>
                  </div>
                  {wod.isCustom && (
                    <button className="btn-icon" style={{ fontSize: 14 }} onClick={e => {
                      e.stopPropagation()
                      setSavedWorkouts(savedWorkouts.filter((_, i) => i !== idx))
                      toast('Workout removed')
                    }}><Icon name="delete" size={14} /></button>
                  )}
                </div>
                {openGroups.has(`saved-wod-${wod.name}`) && (
                  <div className="muscle-group-body" style={{ display: 'block', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Format: <strong style={{ color: 'var(--text)' }}>{wod.format}</strong></span>
                      {wod.timeCap && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Time: <strong style={{ color: 'var(--text)' }}>{wod.timeCap} min</strong></span>}
                      {wod.rounds && wod.format !== 'AMRAP' && wod.format !== 'For Time' && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Rounds: <strong style={{ color: 'var(--text)' }}>{wod.rounds}</strong></span>}
                    </div>
                    {wod.movements && wod.movements.length > 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                        {wod.movements.map((m, mi) => (
                          <div key={mi}>{m.reps} {m.movement}</div>
                        ))}
                      </div>
                    ) : wod.description ? (
                      <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5 }}>{wod.description}</p>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // Olympic Lifting category render
  const renderOlympicCategory = () => (
    <div>
      <div className="info-banner">
        <div className="info-banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2"><path d="M6.5 6.5h11M6.5 17.5h11M2 10v4M22 10v4M4 8v8M20 8v8"/></svg></div>
        <div>
          <div className="info-banner-title">Olympic Lifting</div>
          <div className="info-banner-text">
            Snatch, Clean & Jerk, and accessory movements for strength development.
          </div>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 16 }}>
        <input
          type="text"
          className="search-input"
          placeholder="New Olympic lift..."
          value={newOlympicName}
          onChange={e => setNewOlympicName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newOlympicName.trim()) {
              setCustomOlympic([...customOlympic, { name: newOlympicName.trim() }])
              setNewOlympicName('')
              toast('Olympic lift added')
            }
          }}
        />
        <button className="btn btn-primary btn-sm" onClick={() => {
          if (newOlympicName.trim()) {
            setCustomOlympic([...customOlympic, { name: newOlympicName.trim() }])
            setNewOlympicName('')
            toast('Olympic lift added')
          }
        }}>+ Add Lift</button>
      </div>
      <div style={{ marginTop: 16 }}>
        {Object.entries(olympicLifts).map(([category, lifts]) => (
          <div key={category} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              {category}
            </div>
            {lifts.map(lift => (
              <div key={lift} className="exercise-item" style={{ marginBottom: 8 }}>
                <span>{lift}</span>
                <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Olympic</div>
              </div>
            ))}
          </div>
        ))}
        {customOlympic.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Custom
            </div>
            {customOlympic.map((item, idx) => (
              <div key={`custom-${item.name}`} className="exercise-item" style={{ marginBottom: 8 }}>
                <span>{item.name}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(167,139,250,0.15)', color: 'var(--accent2)', fontWeight: 600 }}>CUSTOM</span>
                  <button className="btn-icon" style={{ fontSize: 14 }} onClick={() => {
                    setCustomOlympic(customOlympic.filter((_, i) => i !== idx))
                    toast('Lift removed')
                  }}><Icon name="delete" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {['Strength', 'Cardio', 'CrossFit', 'Olympic Lifting'].map(cat => (
          <button
            key={cat}
            style={categoryTabStyle(category === cat)}
            onClick={() => {
              setCategory(cat)
              setSearch('')
              setOpenGroups(new Set())
              setCrossfitTab('movements')
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {category === 'Strength' && renderStrengthCategory()}
      {category === 'Cardio' && renderCardioCategory()}
      {category === 'CrossFit' && renderCrossfitCategory()}
      {category === 'Olympic Lifting' && renderOlympicCategory()}

      {addModal && (
        <Modal title="Add Exercise" onClose={() => setAddModal(false)} actions={[
          { label: 'Cancel', cls: 'btn-secondary', onClick: () => setAddModal(false) },
          { label: 'Add', cls: 'btn-primary', onClick: add },
        ]}>
          <div className="form-group">
            <label>Muscle Group</label>
            <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Exercise Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Incline Cable Fly" />
          </div>
          <div className="form-group">
            <label>Equipment</label>
            <input type="text" value={form.equipment} onChange={e => setForm({ ...form, equipment: e.target.value })} placeholder="e.g. Cable, Dumbbell" />
          </div>
        </Modal>
      )}
      {moveModal && (
        <Modal title={`Move "${moveModal.name}"`} onClose={() => setMoveModal(null)} actions={[
          { label: 'Cancel', cls: 'btn-secondary', onClick: () => setMoveModal(null) },
        ]}>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>
            Currently in <strong style={{ color: 'var(--accent2)' }}>{moveModal.fromGroup}</strong>. Select a new muscle group:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups.filter(g => g !== moveModal.fromGroup).map(g => (
              <button key={g} className="btn btn-secondary" style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                onClick={() => moveExercise(moveModal.name, moveModal.fromGroup, moveModal.equipment, g)}>
                {g}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   AI BUILDER TAB
   ═══════════════════════════════════════════════════════════ */
const STRENGTH_GOALS = ['Hypertrophy', 'Strength', 'Endurance', 'Power']
const STRENGTH_SPLITS = ['Push/Pull/Legs', 'Upper/Lower', 'Full Body', 'Bro Split']
const EQUIPMENT = ['Full Gym', 'Barbell + Dumbbells', 'Dumbbells Only', 'Bodyweight']
const fmt = v => (!v || v === 'NA' || v === 'N/A' || v === 'na') ? '-' : v

const crossfitOpenWods = [
  { name: '24.1', year: '2024', format: 'AMRAP', timeCap: '15', movements: [
    { movement: 'Dumbbell Snatches', reps: '21' }, { movement: 'Lateral Burpees over DB', reps: '21' },
    { movement: 'Dumbbell Snatches', reps: '15' }, { movement: 'Lateral Burpees over DB', reps: '15' },
    { movement: 'Dumbbell Snatches', reps: '9' }, { movement: 'Lateral Burpees over DB', reps: '9' }
  ]},
  { name: '24.2', year: '2024', format: 'For Time', timeCap: '20', movements: [
    { movement: 'Rowing', reps: '300m' }, { movement: 'Deadlifts', reps: '10' }, { movement: 'Bar Muscle-Ups', reps: '5' },
    { movement: 'Rowing', reps: '300m' }, { movement: 'Deadlifts', reps: '10' }, { movement: 'Bar Muscle-Ups', reps: '5' },
    { movement: 'Rowing', reps: '300m' }, { movement: 'Deadlifts', reps: '10' }, { movement: 'Bar Muscle-Ups', reps: '5' }
  ]},
  { name: '24.3', year: '2024', format: 'For Time', timeCap: '15', movements: [
    { movement: 'Thrusters', reps: '10 (65/45 lb)' }, { movement: 'Chest-to-Bar Pull-Ups', reps: '10' },
    { movement: 'Thrusters', reps: '10 (85/55 lb)' }, { movement: 'Chest-to-Bar Pull-Ups', reps: '10' },
    { movement: 'Thrusters', reps: '10 (115/75 lb)' }, { movement: 'Bar Muscle-Ups', reps: '10' }
  ]},
  { name: '23.1', year: '2023', format: 'AMRAP', timeCap: '14', movements: [
    { movement: 'Shuttle Runs', reps: '60 ft' }, { movement: 'Single-Arm DB Hang Clean & Jerk', reps: '6' },
    { movement: 'Shuttle Runs', reps: '60 ft' }, { movement: 'Single-Arm DB Hang Clean & Jerk', reps: '9' }
  ]},
  { name: '23.2A', year: '2023', format: 'For Time', timeCap: '15', movements: [
    { movement: 'Rowing', reps: '5 min max distance' }
  ]},
  { name: '23.2B', year: '2023', format: 'For Time', timeCap: '10', movements: [
    { movement: 'Thrusters', reps: '21 (75/55 lb)' }, { movement: 'Pull-Ups', reps: '21' },
    { movement: 'Thrusters', reps: '15 (95/65 lb)' }, { movement: 'Pull-Ups', reps: '15' },
    { movement: 'Thrusters', reps: '9 (115/80 lb)' }, { movement: 'Pull-Ups', reps: '9' }
  ]},
  { name: '23.3', year: '2023', format: 'For Time', timeCap: '6', movements: [
    { movement: 'Wall Balls', reps: '5' }, { movement: 'Cleans', reps: '5' },
    { movement: 'Wall Balls', reps: '5' }, { movement: 'Cleans', reps: '5' },
    { movement: 'Wall Balls', reps: '5' }, { movement: 'Cleans', reps: '5' }
  ]},
  { name: '22.1', year: '2022', format: 'AMRAP', timeCap: '15', movements: [
    { movement: 'Wall Balls', reps: '3' }, { movement: 'Double Unders', reps: '3' },
    { movement: 'Wall Balls', reps: '6' }, { movement: 'Double Unders', reps: '6' },
    { movement: 'Wall Balls', reps: '9' }, { movement: 'Double Unders', reps: '9' }
  ]},
  { name: '22.2', year: '2022', format: 'For Time', timeCap: '10', movements: [
    { movement: 'Deadlifts', reps: '1' }, { movement: 'Bar Muscle-Ups', reps: '1' },
    { movement: 'Deadlifts', reps: '3' }, { movement: 'Bar Muscle-Ups', reps: '3' },
    { movement: 'Deadlifts', reps: '6' }, { movement: 'Bar Muscle-Ups', reps: '6' }
  ]},
  { name: '22.3', year: '2022', format: 'For Time', timeCap: '12', movements: [
    { movement: 'Wall Walks', reps: '2' }, { movement: 'Dumbbell Snatches', reps: '10' },
    { movement: 'Wall Walks', reps: '4' }, { movement: 'Dumbbell Snatches', reps: '20' }
  ]},
  { name: '21.1', year: '2021', format: 'For Time', timeCap: '15', movements: [
    { movement: 'Wall Walks', reps: '1' }, { movement: 'Double Unders', reps: '10' },
    { movement: 'Wall Walks', reps: '3' }, { movement: 'Double Unders', reps: '30' },
    { movement: 'Wall Walks', reps: '6' }, { movement: 'Double Unders', reps: '60' }
  ]},
  { name: '20.1', year: '2020', format: 'For Time', timeCap: '15', movements: [
    { movement: 'Ground to Overhead', reps: '10' }, { movement: 'Bar-Facing Burpees', reps: '15' },
    { movement: 'Ground to Overhead', reps: '20' }, { movement: 'Bar-Facing Burpees', reps: '15' },
    { movement: 'Ground to Overhead', reps: '30' }, { movement: 'Bar-Facing Burpees', reps: '15' }
  ]}
]

function AIBuilderTab() {
  const toast = useToast()
  const [step, setStep] = useState(1)
  const [types, setTypes] = useState([])
  const [config, setConfig] = useState({})
  const [model, setModel] = useState('sonnet')
  const [name, setName] = useState('')
  const [weeks, setWeeks] = useState(12)
  const [daysPerWeek, setDaysPerWeek] = useState(5)
  const [sessionTime, setSessionTime] = useState(60)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [editedProgram, setEditedProgram] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [nlPrompt, setNlPrompt] = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [buildForAthlete, setBuildForAthlete] = useState(false)
  const [selectedAthlete, setSelectedAthlete] = useState('')
  const [athletes, setAthletes] = useState([])
  const [athleteStartDate, setAthleteStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [dayPlan, setDayPlan] = useState({
    Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: []
  })
  const [dayPickerOpen, setDayPickerOpen] = useState(null) // which day's picker is open
  const [dayPickerCategory, setDayPickerCategory] = useState(null) // which category is selected in picker
  const [dayPlannerOpenGroups, setDayPlannerOpenGroups] = useState(new Set())
  const [exerciseLib, setExerciseLib] = useState({ strength: {}, cardio: [], crossfit: { movements: [], benchmarks: [] }, olympic: {} })

  const program = editedProgram || result?.program

  function toggleType(id) { setTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]) }
  function updateConfig(type, key, value) { setConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [key]: value } })) }
  function toggleDayPlannerGroup(g) {
    setDayPlannerOpenGroups(prev => { const next = new Set(prev); next.has(g) ? next.delete(g) : next.add(g); return next })
  }

  // Load athletes when toggle is enabled
  useEffect(() => {
    if (buildForAthlete && athletes.length === 0) {
      API.listUsers().then(d => {
        const athletesList = (d.users || []).filter(u => u.role === 'athlete')
        setAthletes(athletesList)
        if (athletesList.length > 0) setSelectedAthlete(athletesList[0].username)
      }).catch(() => toast('Failed to load athletes', 'error'))
    }
  }, [buildForAthlete])

  // Load exercise library for day planner
  useEffect(() => {
    API.getExercises().then(data => {
      // Keep the grouped structure for strength (muscle group -> exercises)
      const strengthGroups = {}
      for (const [group, equips] of Object.entries(data)) {
        const names = []
        for (const exList of Object.values(equips)) {
          for (const ex of exList) {
            if (!names.includes(ex.name)) names.push(ex.name)
          }
        }
        if (names.length > 0) strengthGroups[group] = names
      }
      setExerciseLib({
        strength: strengthGroups,
        cardio: ['Stairmaster', 'Treadmill', 'Rowing Machine', 'Ski Erg', 'Assault Bike', 'Spin Bike', 'Outdoor Run', 'Cycling'],
        crossfit: {
          movements: ['Muscle Ups', 'Box Jumps', 'Walking Lunges', 'Thrusters', 'Double Unders', 'Wall Walks', 'Snatches', 'Clean & Jerk', 'Toes to Bar', 'Handstand Push Ups', 'Rope Climbs', 'Burpees', 'Kettlebell Swings', 'Pull Ups', 'Ring Dips', 'Pistol Squats', 'Wall Balls'],
          benchmarks: ['Fran', 'Murph', 'Grace', 'Diane', 'Helen', 'Isabel', 'Jackie', 'Karen', 'Annie', 'Cindy', 'Fight Gone Bad', 'DT']
        },
        olympic: {
          'Snatch Variations': ['Snatch', 'Power Snatch', 'Hang Snatch', 'Snatch Pull', 'Overhead Squat'],
          'Clean & Jerk Variations': ['Clean', 'Power Clean', 'Hang Clean', 'Push Jerk', 'Split Jerk', 'Push Press'],
          'Accessory': ['Front Squat', 'Back Squat', 'Romanian Deadlift', 'Good Morning']
        }
      })
    }).catch(() => {})
  }, [])

  async function generate() {
    if (!name.trim()) { toast('Enter a program name', 'error'); return }
    if (types.length === 0) { toast('Select at least one type', 'error'); return }
    setLoading(true); setResult(null); setEditedProgram(null)
    try {
      const reqBody = { types, typeConfig: config, model, weeks, name: name.trim(), notes, daysPerWeek, sessionTime }
      // Add day plan if any days have items
      const hasAnyDayPlan = Object.values(dayPlan).some(items => items.length > 0)
      if (hasAnyDayPlan) {
        reqBody.dayPlan = dayPlan
      }
      // Add athlete data if building for specific athlete
      if (buildForAthlete && selectedAthlete) {
        const athlete = athletes.find(a => a.username === selectedAthlete)
        reqBody.athlete_name = selectedAthlete
        reqBody.athlete_prompt = athlete?.athlete_prompt || ''
      }
      const r = await API.generateProgram(reqBody)
      if (r.error || r.detail) { toast(r.error || r.detail, 'error'); setLoading(false); return }
      if (!r.program) { toast('Generation returned no program data', 'error'); setLoading(false); return }
      if (!r.program.weeks || r.program.weeks.length === 0) { toast('Program generated but has no weeks', 'error'); setLoading(false); return }
      setResult(r); setStep(5)
      const msg = buildForAthlete ? `Program generated and assigned to ${selectedAthlete}! ${r.program.weeks.length} weeks` : `Program generated! ${r.program.weeks.length} weeks`
      toast(msg)
    } catch (e) {
      toast(e.message === 'auth_expired' ? 'Session expired' : `Generation failed: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  function startEdit(weekIdx, dayIdx, groupIdx, exIdx, field) {
    const ex = program.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx].exercises[exIdx]
    setEditing({ weekIdx, dayIdx, groupIdx, exIdx, field }); setEditValue(ex[field] || '')
  }
  function commitEdit() {
    if (!editing) return
    const { weekIdx, dayIdx, groupIdx, exIdx, field } = editing
    const updated = JSON.parse(JSON.stringify(program))
    updated.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx].exercises[exIdx][field] = editValue
    setEditedProgram(updated); setEditing(null)
  }
  function removeExercise(weekIdx, dayIdx, groupIdx, exIdx) {
    const updated = JSON.parse(JSON.stringify(program))
    const group = updated.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx]
    group.exercises.splice(exIdx, 1)
    if (group.exercises.length === 0) updated.weeks[weekIdx].days[dayIdx].exerciseGroups.splice(groupIdx, 1)
    setEditedProgram(updated)
  }
  function addExercise(weekIdx, dayIdx) {
    const updated = JSON.parse(JSON.stringify(program))
    const day = updated.weeks[weekIdx].days[dayIdx]
    if (!day.exerciseGroups || day.exerciseGroups.length === 0) day.exerciseGroups = [{ exercises: [] }]
    const lastGroup = day.exerciseGroups[day.exerciseGroups.length - 1]
    const maxOrder = lastGroup.exercises.reduce((m, e) => Math.max(m, parseInt(e.order) || 0), 0)
    lastGroup.exercises.push({ order: String(maxOrder + 1), name: 'New Exercise', sets: '3', reps: '10', tempo: '-', rest: '60s', rpe: '7' })
    setEditedProgram(updated)
  }

  async function applyNlModification() {
    if (!nlPrompt.trim()) return
    setNlLoading(true)
    try {
      const r = await API.modifyProgram({ program, modification_prompt: nlPrompt.trim(), model })
      if (r.error || r.detail) { toast(r.error || r.detail, 'error') }
      else if (r.program) { setEditedProgram(r.program); setNlPrompt(''); toast('Program modified!') }
      else { toast('Modification returned no data', 'error') }
    } catch (e) { toast(`Modification failed: ${e.message}`, 'error') }
    setNlLoading(false)
  }

  async function saveToLibrary() {
    if (!program) return
    try { await API.createProgram({ name: program.name || name, weeks: program.weeks || [] }); toast('Saved to library!') }
    catch { toast('Save failed', 'error') }
  }

  const modelInfo = MODEL_COSTS[model]

  function renderEditableCell(weekIdx, dayIdx, groupIdx, exIdx, field, value) {
    const isEditing = editing?.weekIdx === weekIdx && editing?.dayIdx === dayIdx &&
      editing?.groupIdx === groupIdx && editing?.exIdx === exIdx && editing?.field === field
    if (isEditing) {
      return <input className="inline-edit" value={editValue} onChange={e => setEditValue(e.target.value)}
        onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
        autoFocus style={{ width: field === 'name' ? '100%' : 48 }} />
    }
    return <span className={`editable-cell ${field === 'name' ? '' : 'dim'}`}
      onClick={() => startEdit(weekIdx, dayIdx, groupIdx, exIdx, field)} title="Click to edit">
      {field === 'name' ? (value || '-') : fmt(value)}
    </span>
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="step-indicator">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`step-dot ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}`} />
        ))}
      </div>

      {loading && (
        <div className="generation-overlay">
          <div className="generation-modal">
            <div className="generation-spinner" />
            <h3>Generating Program...</h3>
            <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>Claude is building your {weeks}-week {types.join(' + ')} program. This typically takes 15-45 seconds.</p>
            <button className="btn btn-secondary" onClick={() => setLoading(false)}>Cancel</button>
          </div>
        </div>
      )}
      {nlLoading && (
        <div className="generation-overlay">
          <div className="generation-modal">
            <div className="generation-spinner" />
            <h3>Modifying Program...</h3>
            <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>Claude is applying your changes. This usually takes 10-20 seconds.</p>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Select Program Type(s) <HelpTip text="Choose one or combine multiple types for a hybrid program. The AI will balance training volume across types." /></h3>
          <div className="type-grid">
            {PROGRAM_TYPES.map(t => (
              <div key={t.id} className={`type-card ${types.includes(t.id) ? 'selected' : ''}`} onClick={() => toggleType(t.id)}>
                <div className="type-icon"><Icon name={t.icon} size={22} /></div>
                <div className="type-name">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={types.length === 0} onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Configure Program</h3>
          <div className="config-schedule">
            <div className="form-group">
              <label>Training days per week: <strong style={{ color: 'var(--accent2)' }}>{daysPerWeek}</strong></label>
              <input type="range" min="2" max="7" value={daysPerWeek} onChange={e => setDaysPerWeek(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
            <div className="form-group">
              <label>Session duration: <strong style={{ color: 'var(--accent2)' }}>{sessionTime} min</strong></label>
              <input type="range" min="30" max="120" step="5" value={sessionTime} onChange={e => setSessionTime(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
          </div>
          {types.includes('strength') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Strength</h4>
              <div className="form-group"><label>Goal</label>
                <select value={config.strength?.goal || ''} onChange={e => updateConfig('strength', 'goal', e.target.value)}>
                  <option value="">Select...</option>{STRENGTH_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                </select></div>
              <div className="form-group"><label>Split</label>
                <select value={config.strength?.split || ''} onChange={e => updateConfig('strength', 'split', e.target.value)}>
                  <option value="">Select...</option>{STRENGTH_SPLITS.map(s => <option key={s} value={s}>{s}</option>)}
                </select></div>
              <div className="form-group"><label>Equipment</label>
                <select value={config.strength?.equipment || ''} onChange={e => updateConfig('strength', 'equipment', e.target.value)}>
                  {EQUIPMENT.map(e => <option key={e} value={e}>{e}</option>)}
                </select></div>
            </div>
          )}
          {types.includes('crossfit') && (
            <div style={{ marginBottom: 20 }}><h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>CrossFit</h4>
              <div className="form-group"><label>Focus</label><input type="text" value={config.crossfit?.focus || ''} onChange={e => updateConfig('crossfit', 'focus', e.target.value)} placeholder="e.g. Olympic lifting, MetCon, Competition prep" /></div>
            </div>
          )}
          {types.includes('running') && (
            <div style={{ marginBottom: 20 }}><h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Running</h4>
              <div className="form-group"><label>Goal</label><input type="text" value={config.running?.goal || ''} onChange={e => updateConfig('running', 'goal', e.target.value)} placeholder="e.g. 5K PR, Marathon" /></div>
              <div className="form-group"><label>Current Weekly Mileage (km)</label><input type="text" value={config.running?.mileage || ''} onChange={e => updateConfig('running', 'mileage', e.target.value)} placeholder="e.g. 20-30" /></div>
            </div>
          )}
          {types.includes('hyrox') && (
            <div style={{ marginBottom: 20 }}><h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>HYROX</h4>
              <div className="form-group"><label>Phase</label>
                <select value={config.hyrox?.phase || ''} onChange={e => updateConfig('hyrox', 'phase', e.target.value)}>
                  <option value="">Select...</option><option value="base">Base Building</option><option value="build">Build Phase</option><option value="peak">Peak / Race Prep</option>
                </select></div>
            </div>
          )}
          {types.includes('cycling') && (
            <div style={{ marginBottom: 20 }}><h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Cycling</h4>
              <div className="form-group"><label>Goal</label><input type="text" value={config.cycling?.goal || ''} onChange={e => updateConfig('cycling', 'goal', e.target.value)} placeholder="e.g. FTP improvement, Endurance" /></div>
            </div>
          )}
          {types.includes('swimming') && (
            <div style={{ marginBottom: 20 }}><h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Swimming</h4>
              <div className="form-group"><label>Goal</label><input type="text" value={config.swimming?.goal || ''} onChange={e => updateConfig('swimming', 'goal', e.target.value)} placeholder="e.g. Triathlon prep, Technique" /></div>
            </div>
          )}

          {/* Day-by-day movement planner */}
          <div style={{ marginTop: 24, padding: 16, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
            <h4 style={{ color: 'var(--accent2)', marginBottom: 4 }}>Day Planner (optional)</h4>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
              Assign specific movements to days. The AI will use these preferences when building the program.
            </p>

            {/* Day tabs — styled like Exercises category tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {Object.entries(dayPlan).map(([day, items]) => (
                <button
                  key={day}
                  style={{
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    color: dayPickerOpen === day ? 'var(--accent2)' : 'var(--text-dim)',
                    background: dayPickerOpen === day ? 'rgba(167,139,250,0.08)' : 'transparent',
                    border: '1px solid',
                    borderColor: dayPickerOpen === day ? 'var(--accent2)' : 'var(--border)',
                    borderRadius: 6,
                    position: 'relative',
                  }}
                  onClick={() => { setDayPickerOpen(dayPickerOpen === day ? null : day); setDayPickerCategory(null) }}
                >
                  {day}
                  {items.length > 0 && (
                    <span style={{
                      position: 'absolute', top: -6, right: -6,
                      background: 'var(--accent)', color: '#fff',
                      fontSize: 9, fontWeight: 700, width: 16, height: 16,
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{items.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Selected day view — exercises list + category groups to add from */}
            {dayPickerOpen && (
              <div>
                {/* Currently assigned exercises for this day */}
                {dayPlan[dayPickerOpen].length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      {dayPickerOpen} — {dayPlan[dayPickerOpen].length} exercise{dayPlan[dayPickerOpen].length !== 1 ? 's' : ''} assigned
                    </div>
                    {dayPlan[dayPickerOpen].map((item, idx) => (
                      <div key={idx} className="exercise-item" style={{ marginBottom: 6 }}>
                        <span>{item}</span>
                        <button className="btn-icon" style={{ fontSize: 14 }}
                          onClick={() => setDayPlan(prev => ({ ...prev, [dayPickerOpen]: prev[dayPickerOpen].filter((_, i) => i !== idx) }))}>
                          <Icon name="delete" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {dayPlan[dayPickerOpen].length === 0 && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16, fontStyle: 'italic' }}>
                    No exercises assigned to {dayPickerOpen} yet. Choose a category below to add.
                  </div>
                )}

                {/* Category groups — matching Exercises tab structure */}
                {[
                  { key: 'strength', label: 'Strength' },
                  { key: 'cardio', label: 'Cardio' },
                  { key: 'crossfit', label: 'CrossFit' },
                  { key: 'olympic', label: 'Olympic Lifting' },
                ].map(cat => {
                  const isOpen = dayPickerCategory === cat.key
                  const lib = exerciseLib[cat.key]

                  // Count exercises
                  let count = 0
                  if (cat.key === 'cardio') count = Array.isArray(lib) ? lib.length : 0
                  else if (cat.key === 'strength') count = Object.values(lib || {}).reduce((s, arr) => s + arr.length, 0)
                  else if (cat.key === 'crossfit') count = (lib?.movements?.length || 0) + (lib?.benchmarks?.length || 0)
                  else if (cat.key === 'olympic') count = Object.values(lib || {}).reduce((s, arr) => s + arr.length, 0)

                  return (
                    <div key={cat.key} className="muscle-group" style={{ marginBottom: 10 }}>
                      <div className="muscle-group-header" onClick={() => setDayPickerCategory(isOpen ? null : cat.key)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="drill-toggle drill-toggle-sm">{isOpen ? '−' : '+'}</span>
                          <span style={{ color: 'var(--accent2)' }}>{cat.label}</span>
                        </div>
                        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{count} exercises</span>
                      </div>
                      {isOpen && (
                        <div className="muscle-group-body" style={{ display: 'block' }}>

                          {/* STRENGTH: show sub-groups (Back, Biceps, etc.) */}
                          {cat.key === 'strength' && Object.entries(lib || {}).sort(([a], [b]) => a.localeCompare(b)).map(([group, exercises]) => (
                            <div key={group} style={{ marginBottom: 8 }}>
                              <div className="muscle-group" style={{ marginBottom: 4, border: '1px solid var(--glass-border)' }}>
                                <div className="muscle-group-header" style={{ padding: '10px 14px' }}
                                  onClick={(e) => { e.stopPropagation(); toggleDayPlannerGroup(`str-${group}`) }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="drill-toggle drill-toggle-sm" style={{ width: 16, height: 16, fontSize: 12 }}>
                                      {dayPlannerOpenGroups.has(`str-${group}`) ? '−' : '+'}
                                    </span>
                                    <span style={{ fontSize: 13 }}>{group}</span>
                                  </div>
                                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{exercises.length}</span>
                                </div>
                                {dayPlannerOpenGroups.has(`str-${group}`) && (
                                  <div style={{ padding: '6px 14px 10px' }}>
                                    {exercises.map(ex => (
                                      <div key={ex} className="exercise-item" style={{ cursor: 'pointer', padding: '5px 0' }}
                                        onClick={() => {
                                          setDayPlan(prev => ({ ...prev, [dayPickerOpen]: [...prev[dayPickerOpen], ex] }))
                                          toast(`Added "${ex}" to ${dayPickerOpen}`)
                                        }}>
                                        <span style={{ fontSize: 13 }}>{ex}</span>
                                        <span style={{ color: 'var(--accent2)', fontSize: 18, fontWeight: 300 }}>+</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* CARDIO: flat list */}
                          {cat.key === 'cardio' && (Array.isArray(lib) ? lib : []).map(ex => (
                            <div key={ex} className="exercise-item" style={{ cursor: 'pointer', padding: '5px 0' }}
                              onClick={() => {
                                setDayPlan(prev => ({ ...prev, [dayPickerOpen]: [...prev[dayPickerOpen], ex] }))
                                toast(`Added "${ex}" to ${dayPickerOpen}`)
                              }}>
                              <span style={{ fontSize: 13 }}>{ex}</span>
                              <span style={{ color: 'var(--accent2)', fontSize: 18, fontWeight: 300 }}>+</span>
                            </div>
                          ))}

                          {/* CROSSFIT: sub-groups for Movements and Benchmarks */}
                          {cat.key === 'crossfit' && (
                            <>
                              <div className="muscle-group" style={{ marginBottom: 8, border: '1px solid var(--glass-border)' }}>
                                <div className="muscle-group-header" style={{ padding: '10px 14px' }}
                                  onClick={(e) => { e.stopPropagation(); toggleDayPlannerGroup('cf-movements') }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="drill-toggle drill-toggle-sm" style={{ width: 16, height: 16, fontSize: 12 }}>
                                      {dayPlannerOpenGroups.has('cf-movements') ? '−' : '+'}
                                    </span>
                                    <span style={{ fontSize: 13 }}>Movements</span>
                                  </div>
                                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{lib?.movements?.length || 0}</span>
                                </div>
                                {dayPlannerOpenGroups.has('cf-movements') && (
                                  <div style={{ padding: '6px 14px 10px' }}>
                                    {(lib?.movements || []).map(ex => (
                                      <div key={ex} className="exercise-item" style={{ cursor: 'pointer', padding: '5px 0' }}
                                        onClick={() => {
                                          setDayPlan(prev => ({ ...prev, [dayPickerOpen]: [...prev[dayPickerOpen], ex] }))
                                          toast(`Added "${ex}" to ${dayPickerOpen}`)
                                        }}>
                                        <span style={{ fontSize: 13 }}>{ex}</span>
                                        <span style={{ color: 'var(--accent2)', fontSize: 18, fontWeight: 300 }}>+</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="muscle-group" style={{ marginBottom: 8, border: '1px solid var(--glass-border)' }}>
                                <div className="muscle-group-header" style={{ padding: '10px 14px' }}
                                  onClick={(e) => { e.stopPropagation(); toggleDayPlannerGroup('cf-benchmarks') }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="drill-toggle drill-toggle-sm" style={{ width: 16, height: 16, fontSize: 12 }}>
                                      {dayPlannerOpenGroups.has('cf-benchmarks') ? '−' : '+'}
                                    </span>
                                    <span style={{ fontSize: 13 }}>Benchmark WODs</span>
                                  </div>
                                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{lib?.benchmarks?.length || 0}</span>
                                </div>
                                {dayPlannerOpenGroups.has('cf-benchmarks') && (
                                  <div style={{ padding: '6px 14px 10px' }}>
                                    {(lib?.benchmarks || []).map(ex => (
                                      <div key={ex} className="exercise-item" style={{ cursor: 'pointer', padding: '5px 0' }}
                                        onClick={() => {
                                          setDayPlan(prev => ({ ...prev, [dayPickerOpen]: [...prev[dayPickerOpen], `WOD: ${ex}`] }))
                                          toast(`Added "${ex}" to ${dayPickerOpen}`)
                                        }}>
                                        <span style={{ fontSize: 13 }}>{ex}</span>
                                        <span style={{ color: 'var(--accent2)', fontSize: 18, fontWeight: 300 }}>+</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}

                          {/* OLYMPIC: sub-groups (Snatch Variations, Clean & Jerk, etc.) */}
                          {cat.key === 'olympic' && Object.entries(lib || {}).map(([group, lifts]) => (
                            <div key={group} style={{ marginBottom: 8 }}>
                              <div className="muscle-group" style={{ marginBottom: 4, border: '1px solid var(--glass-border)' }}>
                                <div className="muscle-group-header" style={{ padding: '10px 14px' }}
                                  onClick={(e) => { e.stopPropagation(); toggleDayPlannerGroup(`oly-${group}`) }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="drill-toggle drill-toggle-sm" style={{ width: 16, height: 16, fontSize: 12 }}>
                                      {dayPlannerOpenGroups.has(`oly-${group}`) ? '−' : '+'}
                                    </span>
                                    <span style={{ fontSize: 13 }}>{group}</span>
                                  </div>
                                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{lifts.length}</span>
                                </div>
                                {dayPlannerOpenGroups.has(`oly-${group}`) && (
                                  <div style={{ padding: '6px 14px 10px' }}>
                                    {lifts.map(ex => (
                                      <div key={ex} className="exercise-item" style={{ cursor: 'pointer', padding: '5px 0' }}
                                        onClick={() => {
                                          setDayPlan(prev => ({ ...prev, [dayPickerOpen]: [...prev[dayPickerOpen], ex] }))
                                          toast(`Added "${ex}" to ${dayPickerOpen}`)
                                        }}>
                                        <span style={{ fontSize: 13 }}>{ex}</span>
                                        <span style={{ color: 'var(--accent2)', fontSize: 18, fontWeight: 300 }}>+</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Select AI Model <HelpTip text="Haiku is fast and cheap. Sonnet balances quality and cost. Opus produces the most detailed programs." /></h3>
          {Object.entries(MODEL_COSTS).map(([key, m]) => (
            <div key={key} className={`model-option ${model === key ? 'selected' : ''}`} onClick={() => setModel(key)}>
              <div><div className="model-name">{m.name}</div><div className="model-desc">{m.desc}</div></div>
              <div className="model-cost">~${((m.input * 2000 + m.output * 4000) / 1000000).toFixed(2)}/program</div>
            </div>
          ))}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Next</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Program Details</h3>
          <div className="form-group"><label>Program Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hypertrophy Phase 1" /></div>
          <div className="form-group">
            <label>Duration (weeks): <strong style={{ color: 'var(--accent2)' }}>{weeks}</strong></label>
            <input type="range" min="4" max="24" value={weeks} onChange={e => setWeeks(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontFamily: "'Space Mono', monospace" }}>
            {daysPerWeek} days/week &middot; {sessionTime} min/session &middot; {weeks} weeks
          </div>
          <div className="form-group"><label>Additional Notes (optional)</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. No deadlifts due to back injury..." /></div>

          <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(124,110,240,0.05)', borderRadius: 8, border: '1px solid rgba(124,110,240,0.1)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 0 }}>
              <input type="checkbox" checked={buildForAthlete} onChange={e => setBuildForAthlete(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              <span style={{ fontWeight: 500 }}>Build for specific athlete</span>
              <HelpTip text="If checked, the program will be built with the athlete's specific context and automatically assigned to them." />
            </label>
          </div>

          {buildForAthlete && (
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--input-bg)', borderRadius: 8 }}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Select Athlete</label>
                <select value={selectedAthlete} onChange={e => setSelectedAthlete(e.target.value)}>
                  <option value="">-- Choose athlete --</option>
                  {athletes.map(a => <option key={a.username} value={a.username}>{a.username}</option>)}
                </select>
              </div>
              {selectedAthlete && athletes.find(a => a.username === selectedAthlete)?.athlete_prompt && (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 10, background: 'var(--surface2)', borderRadius: 6, marginBottom: 12 }}>
                  <strong style={{ color: 'var(--text)' }}>AI Builder Prompt:</strong>
                  <p style={{ margin: '8px 0 0', fontStyle: 'italic' }}>{athletes.find(a => a.username === selectedAthlete)?.athlete_prompt}</p>
                </div>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn-primary" onClick={generate}><Icon name="ai-builder" size={16} /> Generate Program</button>
          </div>
        </div>
      )}

      {step === 5 && program && (
        <div>
          {result?.cost && (
            <div className="stats-row" style={{ marginBottom: 16 }}>
              <div className="stat-card"><div className="stat-value">${result.cost.cost_usd?.toFixed(3)}</div><div className="stat-label">Cost</div></div>
              <div className="stat-card"><div className="stat-value">{result.cost.input_tokens}</div><div className="stat-label">Input Tokens</div></div>
              <div className="stat-card"><div className="stat-value">{result.cost.output_tokens}</div><div className="stat-label">Output Tokens</div></div>
            </div>
          )}
          {(() => { try { return <MuscleHeatmap loads={calculateMuscleLoad(program)} /> } catch { return null } })()}
          <div className="nl-modify-bar">
            <input type="text" value={nlPrompt} onChange={e => setNlPrompt(e.target.value)}
              placeholder="Describe changes... e.g. 'Make week 2 harder' or 'Swap bench press for incline press'"
              onKeyDown={e => { if (e.key === 'Enter' && !nlLoading) applyNlModification() }} disabled={nlLoading} />
            <button className="btn btn-primary btn-sm" onClick={applyNlModification} disabled={nlLoading || !nlPrompt.trim()}>
              {nlLoading ? 'Applying...' : <><Icon name="send" size={14} /> Apply</>}
            </button>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <h3>{program.name || name}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {editedProgram && <span style={{ fontSize: 12, color: 'var(--accent2)', alignSelf: 'center' }}>Edited</span>}
                <button className="btn btn-primary btn-sm" onClick={saveToLibrary}><Icon name="save" size={14} /> Save to Library</button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              Click any value to edit inline. Use the text bar above for AI modifications. Showing first 2 of {(program.weeks || []).length} weeks.
            </p>
            {(program.weeks || []).slice(0, 2).map((week, wi) => (
              <div key={week.week || wi} className="week-block">
                <div className="week-label">Week {week.week || wi + 1}</div>
                {(week.days || []).map((day, di) => (
                  <div key={day.day || di} className="day-block">
                    <div className="day-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Day {day.day || di + 1}{day.isRest ? ' (Rest)' : ''}</span>
                      {!day.isRest && <button className="btn-icon" onClick={() => addExercise(wi, di)} title="Add exercise"><Icon name="add" size={14} /></button>}
                    </div>
                    {!day.isRest && (
                      <>
                        <div className="exercise-row-header">
                          <span>#</span><span>Exercise</span><span>Sets</span><span>Reps</span>
                          <span>Tempo <HelpTip text="Ecc-Pause-Con-Pause in seconds." style={{ fontSize: 7 }} /></span>
                          <span>Rest</span><span>RPE <HelpTip text="1-10 effort scale." style={{ fontSize: 7 }} /></span>
                        </div>
                        {(day.exerciseGroups || []).map((group, gi) => (
                          <div key={gi}>
                            {group.exercises.map((ex, ei) => (
                              <div key={ei} className="exercise-row" style={{ position: 'relative' }}>
                                {renderEditableCell(wi, di, gi, ei, 'order', ex.order)}
                                {renderEditableCell(wi, di, gi, ei, 'name', ex.name)}
                                {renderEditableCell(wi, di, gi, ei, 'sets', ex.sets)}
                                {renderEditableCell(wi, di, gi, ei, 'reps', ex.reps)}
                                {renderEditableCell(wi, di, gi, ei, 'tempo', ex.tempo)}
                                {renderEditableCell(wi, di, gi, ei, 'rest', ex.rest)}
                                {renderEditableCell(wi, di, gi, ei, 'rpe', ex.rpe)}
                                <button className="btn-icon" onClick={() => removeExercise(wi, di, gi, ei)} title="Remove exercise"
                                  style={{ position: 'absolute', right: -28, top: 2 }}>
                                  <Icon name="close" size={12} style={{ color: 'var(--red)' }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {(program.weeks || []).length > 2 && (
              <p style={{ color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 8, fontSize: 13 }}>Showing first 2 of {program.weeks.length} weeks...</p>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => { setStep(1); setResult(null); setEditedProgram(null) }}>New Program</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   SETTINGS TAB
   ═══════════════════════════════════════════════════════════ */
function SettingsTab() {
  const toast = useToast()
  const [philosophy, setPhilosophy] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const settings = await API.getCoachSettings()
        setPhilosophy(settings.philosophy || '')
      } catch {
        toast('Failed to load settings', 'error')
      }
    }
    load()
  }, [])

  async function save() {
    setLoading(true)
    try {
      await API.updateCoachSettings({ philosophy })
      setSaved(true)
      toast('Settings saved!')
      setTimeout(() => setSaved(false), 3000)
    } catch {
      toast('Failed to save settings', 'error')
    }
    setLoading(false)
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>Coach Training Philosophy <HelpTip text="This philosophy will be injected into all AI-generated programs to ensure consistency with your coaching approach." /></h3>
      <div className="form-group">
        <label>Training Philosophy</label>
        <textarea
          value={philosophy}
          onChange={e => setPhilosophy(e.target.value)}
          placeholder="e.g. Emphasis on eccentric training, periodized volume progression, frequent deloads, athlete autonomy in exercise selection..."
          rows="8"
          style={{ fontFamily: "'Space Mono', monospace", fontSize: 13 }}
        />
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
        When you generate programs, this philosophy will be included in the AI prompt to ensure all programs align with your coaching principles.
      </div>
      <div className="modal-actions">
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={loading}
          style={{ opacity: saved ? 0.7 : 1 }}
        >
          {loading ? 'Saving...' : saved ? 'Saved' : 'Save Philosophy'}
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   IMPORT CSV TAB
   ═══════════════════════════════════════════════════════════ */
function ImportCSVTab() {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [rawCSV, setRawCSV] = useState('')
  const [transformedCSV, setTransformedCSV] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [stage, setStage] = useState('upload') // 'upload', 'preview', 'transformed', 'result'
  const [costInfo, setCostInfo] = useState(null)
  const inputRef = useRef()

  async function handleFileSelect(selectedFile) {
    if (!selectedFile || !selectedFile.name.endsWith('.csv')) {
      toast('Must be a .csv file', 'error')
      return
    }
    setFile(selectedFile)
    const text = await selectedFile.text()
    setRawCSV(text)
    setTransformedCSV('')
    setResult(null)
    setCostInfo(null)
    setStage('preview')
  }

  async function directImport() {
    if (!file) return
    setLoading(true)
    try {
      const d = await API.importCSV(file)
      setResult({ ok: true, output: d.output || 'Done', isDirectImport: true })
      toast('CSV imported & built')
      setStage('result')
    } catch (e) {
      setResult({ ok: false, error: e.message || 'Upload failed' })
      setStage('result')
    }
    setLoading(false)
  }

  async function aiTransform() {
    if (!file) return
    setLoading(true)
    try {
      const d = await API.aiTransformCSV(file)
      if (!d.ok) throw new Error(d.error || 'Transform failed')
      setTransformedCSV(d.transformed_csv || '')
      setCostInfo(d.cost || {})
      toast('CSV transformed with AI')
      setStage('transformed')
    } catch (e) {
      toast(e.message || 'Transform failed', 'error')
      setResult({ ok: false, error: e.message || 'Transform failed' })
      setStage('result')
    }
    setLoading(false)
  }

  async function applyTransformed() {
    if (!transformedCSV) return
    setLoading(true)
    try {
      const d = await API.importTransformedCSV(transformedCSV)
      setResult({ ok: true, output: d.output || 'Done', isDirectImport: false })
      toast('Transformed CSV imported & built')
      setStage('result')
    } catch (e) {
      setResult({ ok: false, error: e.message || 'Import failed' })
      setStage('result')
    }
    setLoading(false)
  }

  function reset() {
    setFile(null)
    setRawCSV('')
    setTransformedCSV('')
    setResult(null)
    setCostInfo(null)
    setStage('upload')
  }

  return (
    <div>
      <div className="card">
        <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>
          Upload a program CSV file. Choose between direct import or AI-powered cleaning & transformation.
          <HelpTip text="Direct Import: Uploads CSV as-is. AI Transform: Cleans messy data and maps columns intelligently." />
        </p>

        {stage === 'upload' && (
          <>
            <p style={{ color: 'var(--text-dim)', marginBottom: 16, fontSize: 13 }}>
              Required columns (for direct import): Program, Week, Day, Order, Exercise, Sets, Reps, Tempo, Rest, RPE, Instruction
              <HelpTip text="Each row is one exercise. Week and Day are numbers. Order sets sequence (A1, A2, B1...). Tempo is eccentric-pause-concentric. RPE is 1-10." />
            </p>
            <div
              className={`drop-zone ${dragOver ? 'dragover' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]) }}
            >
              <Icon name="import" size={32} style={{ marginBottom: 8, display: 'block' }} />
              <p>Drop CSV file here or click to browse</p>
            </div>
            <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files[0])} />
          </>
        )}

        {stage === 'preview' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
                <strong>Raw CSV Preview</strong> ({file?.name || 'file.csv'})
              </div>
              <pre
                style={{
                  background: 'var(--input-bg)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  overflowX: 'auto',
                  maxHeight: 300,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                }}
              >
                {rawCSV}
              </pre>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={directImport}
                disabled={loading}
                style={{
                  flex: 1,
                  minWidth: 150,
                  padding: '10px 16px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  fontWeight: 500,
                }}
              >
                {loading ? 'Processing...' : 'Direct Import'}
              </button>
              <button
                onClick={aiTransform}
                disabled={loading}
                style={{
                  flex: 1,
                  minWidth: 150,
                  padding: '10px 16px',
                  background: 'var(--accent2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  fontWeight: 500,
                }}
              >
                {loading ? 'Transforming...' : 'AI Clean & Transform'}
              </button>
              <button
                onClick={reset}
                disabled={loading}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  color: 'var(--text-dim)',
                  border: '1px solid var(--card-border)',
                  borderRadius: 6,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {stage === 'transformed' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
                <strong>Transformed CSV Preview</strong>
              </div>
              {costInfo && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    marginBottom: 8,
                    padding: '8px 12px',
                    background: 'var(--input-bg)',
                    borderRadius: 4,
                  }}
                >
                  Cost: {costInfo.input_tokens?.toLocaleString()} input + {costInfo.output_tokens?.toLocaleString()} output tokens = ${costInfo.cost_usd?.toFixed(4)} ({costInfo.model})
                </div>
              )}
              <pre
                style={{
                  background: 'var(--input-bg)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  overflowX: 'auto',
                  maxHeight: 300,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                }}
              >
                {transformedCSV}
              </pre>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={applyTransformed}
                disabled={loading}
                style={{
                  flex: 1,
                  minWidth: 150,
                  padding: '10px 16px',
                  background: 'var(--green)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  fontWeight: 500,
                }}
              >
                {loading ? 'Importing...' : 'Apply Transformed'}
              </button>
              <button
                onClick={reset}
                disabled={loading}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  color: 'var(--text-dim)',
                  border: '1px solid var(--card-border)',
                  borderRadius: 6,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                Start Over
              </button>
            </div>
          </>
        )}

        {stage === 'result' && (
          <>
            <div style={{ marginBottom: 16 }}>
              {result?.ok ? (
                <>
                  <div style={{ color: 'var(--green)', marginBottom: 8, fontWeight: 500 }}>
                    {result.isDirectImport ? 'Direct import' : 'Transformed CSV'} successful!
                  </div>
                  <pre
                    style={{
                      background: 'var(--input-bg)',
                      padding: 12,
                      borderRadius: 8,
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      overflowX: 'auto',
                      maxHeight: 200,
                      overflow: 'auto',
                      fontFamily: 'monospace',
                    }}
                  >
                    {result.output}
                  </pre>
                </>
              ) : (
                <div style={{ color: '#dc2626' }}>
                  ✗ Import failed: {result?.error || 'Unknown error'}
                </div>
              )}
            </div>

            <button
              onClick={reset}
              style={{
                padding: '10px 16px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Import Another CSV
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN PROGRAMS PAGE (TABBED)
   ═══════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'programs', label: 'Programs' },
  { id: 'exercises', label: 'Exercises' },
  { id: 'ai-builder', label: 'AI Builder' },
  { id: 'settings', label: 'Settings' },
  { id: 'import', label: 'Import CSV' },
]

export default function Programs() {
  const [tab, setTab] = useState('programs')

  return (
    <div>
      <div className="page-title"><Icon name="programs" size={22} style={{ color: 'var(--accent2)' }} /> Programs</div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--card-border)', marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'programs' && <ProgramsTab />}
      {tab === 'exercises' && <ExercisesTab />}
      {tab === 'ai-builder' && <AIBuilderTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'import' && <ImportCSVTab />}
    </div>
  )
}
