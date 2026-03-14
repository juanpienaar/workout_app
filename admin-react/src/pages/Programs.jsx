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
  const [assigning, setAssigning] = useState(false)

  const load = async () => {
    try { const d = await API.listPrograms(); setPrograms(d.programs) }
    catch { toast('Failed to load', 'error') }
  }
  useEffect(() => { load() }, [])

  async function openAssign(programName) {
    setAssignModal({ programName })
    setSelectedAthletes([])
    try {
      const d = await API.listUsers()
      setAthletes((d.users || []).filter(u => u.role !== 'coach'))
    } catch { toast('Failed to load athletes', 'error') }
  }

  async function doAssign() {
    if (selectedAthletes.length === 0) { toast('Select at least one athlete', 'error'); return }
    setAssigning(true)
    try {
      await Promise.all(selectedAthletes.map(name =>
        API.updateUser(name, { program: assignModal.programName })
      ))
      toast(`Assigned to ${selectedAthletes.length} athlete(s)`)
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
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>Select athletes to assign this program to:</p>
          {athletes.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No athletes found.</p>}
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {athletes.map(u => (
              <label key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: selectedAthletes.includes(u.username) ? 'rgba(124,110,240,0.1)' : 'var(--input-bg)', cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={selectedAthletes.includes(u.username)}
                  onChange={e => setSelectedAthletes(prev => e.target.checked ? [...prev, u.username] : prev.filter(n => n !== u.username))} />
                <span>{u.username}</span>
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

  return (
    <div>
      <div className="info-banner">
        <div className="info-banner-icon">ℹ️</div>
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
                            onClick={() => setMoveModal({ name: ex.name, fromGroup: group, equipment: equip })}>↗️</button>
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

  const program = editedProgram || result?.program

  function toggleType(id) { setTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]) }
  function updateConfig(type, key, value) { setConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [key]: value } })) }

  async function generate() {
    if (!name.trim()) { toast('Enter a program name', 'error'); return }
    if (types.length === 0) { toast('Select at least one type', 'error'); return }
    setLoading(true); setResult(null); setEditedProgram(null)
    try {
      const r = await API.generateProgram({ types, typeConfig: config, model, weeks, name: name.trim(), notes, daysPerWeek, sessionTime })
      if (r.error || r.detail) { toast(r.error || r.detail, 'error'); setLoading(false); return }
      if (!r.program) { toast('Generation returned no program data', 'error'); setLoading(false); return }
      if (!r.program.weeks || r.program.weeks.length === 0) { toast('Program generated but has no weeks', 'error'); setLoading(false); return }
      setResult(r); setStep(5)
      toast(`Program generated! ${r.program.weeks.length} weeks`)
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
   IMPORT CSV TAB
   ═══════════════════════════════════════════════════════════ */
function ImportCSVTab() {
  const toast = useToast()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  async function upload(file) {
    if (!file || !file.name.endsWith('.csv')) { toast('Must be a .csv file', 'error'); return }
    setLoading(true); setResult(null)
    try {
      const d = await API.importCSV(file)
      setResult({ ok: true, output: d.output || 'Done' })
      toast('CSV imported & built')
    } catch (e) { setResult({ ok: false, error: e.message || 'Upload failed' }) }
    setLoading(false)
  }

  return (
    <div>
      <div className="card">
        <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>Upload a program CSV file. It will replace the current program.csv and rebuild program.json. <HelpTip text="This overwrites all existing programs built from CSV. Programs created via the AI Builder are stored separately." /></p>
        <p style={{ color: 'var(--text-dim)', marginBottom: 16, fontSize: 13 }}>Required columns: Program, Week, Day, Order, Exercise, Sets, Reps, Tempo, Rest, RPE, Instruction <HelpTip text="Each row is one exercise. Week and Day are numbers. Order sets sequence (A1, A2, B1...). Tempo is eccentric-pause-concentric. RPE is 1-10." /></p>
        <div className={`drop-zone ${dragOver ? 'dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]) }}>
          <Icon name="import" size={32} style={{ marginBottom: 8, display: 'block' }} />
          <p>{loading ? 'Uploading and building...' : 'Drop CSV file here or click to browse'}</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => upload(e.target.files[0])} />
        {result && (
          <div style={{ marginTop: 16 }}>
            {result.ok
              ? <><div style={{ color: 'var(--green)', marginBottom: 8 }}>✓ Import successful!</div>
                <pre style={{ background: 'var(--input-bg)', padding: 12, borderRadius: 8, fontSize: 12, color: 'var(--text-dim)', overflowX: 'auto' }}>{result.output}</pre></>
              : <div style={{ color: '#dc2626' }}>Import failed: {result.error}</div>}
          </div>
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
      {tab === 'import' && <ImportCSVTab />}
    </div>
  )
}
