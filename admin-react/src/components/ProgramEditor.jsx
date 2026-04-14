import React, { useState, useCallback } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function SortableExercise({ exercise, onEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise._id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="exercise-card" {...attributes} {...listeners}>
      <div className="ex-name">{exercise.order} — {exercise.name}</div>
      <div className="ex-params">
        <span className="ex-param" onClick={e => { e.stopPropagation(); onEdit(exercise._id, 'sets') }}>{exercise.sets}s</span>
        <span className="ex-param" onClick={e => { e.stopPropagation(); onEdit(exercise._id, 'reps') }}>{exercise.reps}r</span>
        <span className="ex-param">{exercise.tempo}</span>
        <span className="ex-param">{exercise.rest}</span>
        <span className="ex-param">RPE {exercise.rpe}</span>
        <button className="btn-icon" style={{ fontSize: 12, padding: 0, marginLeft: 'auto' }}
          onClick={e => { e.stopPropagation(); onRemove(exercise._id) }}>✕</button>
      </div>
    </div>
  )
}

export default function ProgramEditor({ program, onSave }) {
  const [weekIdx, setWeekIdx] = useState(0)
  const [editingField, setEditingField] = useState(null) // {id, field}
  const [editValue, setEditValue] = useState('')
  const [localProgram, setLocalProgram] = useState(() => addIds(program))
  const [activeId, setActiveId] = useState(null)
  // Move-workout modal: { srcWeek, srcDay, action }
  const [moveModal, setMoveModal] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const weeks = localProgram.weeks || []
  const currentWeek = weeks[weekIdx]

  function addIds(prog) {
    let counter = 0
    const p = JSON.parse(JSON.stringify(prog))
    for (const w of (p.weeks || [])) {
      for (const d of (w.days || [])) {
        for (const g of (d.exerciseGroups || [])) {
          for (const ex of (g.exercises || [])) {
            ex._id = `ex_${counter++}`
          }
        }
      }
    }
    return p
  }

  function getAllExercisesForDay(day) {
    if (!day || day.isRest) return []
    return (day.exerciseGroups || []).flatMap(g => g.exercises)
  }

  function startEdit(id, field) {
    const allEx = currentWeek?.days?.flatMap(d => getAllExercisesForDay(d)) || []
    const ex = allEx.find(e => e._id === id)
    if (ex) {
      setEditingField({ id, field })
      setEditValue(String(ex[field] || ''))
    }
  }

  function commitEdit() {
    if (!editingField) return
    const updated = JSON.parse(JSON.stringify(localProgram))
    const week = updated.weeks[weekIdx]
    for (const day of (week?.days || [])) {
      for (const group of (day.exerciseGroups || [])) {
        const ex = group.exercises.find(e => e._id === editingField.id)
        if (ex) {
          ex[editingField.field] = editingField.field === 'sets' ? parseInt(editValue) || 0 : editValue
        }
      }
    }
    setLocalProgram(updated)
    setEditingField(null)
  }

  function removeExercise(id) {
    const updated = JSON.parse(JSON.stringify(localProgram))
    const week = updated.weeks[weekIdx]
    for (const day of (week?.days || [])) {
      for (const group of (day.exerciseGroups || [])) {
        group.exercises = group.exercises.filter(e => e._id !== id)
      }
      day.exerciseGroups = (day.exerciseGroups || []).filter(g => g.exercises.length > 0)
    }
    setLocalProgram(updated)
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!active || !over || active.id === over.id) return

    const updated = JSON.parse(JSON.stringify(localProgram))
    const week = updated.weeks[weekIdx]

    // Find which day each exercise is in
    for (const day of (week?.days || [])) {
      for (const group of (day.exerciseGroups || [])) {
        const oldIdx = group.exercises.findIndex(e => e._id === active.id)
        const newIdx = group.exercises.findIndex(e => e._id === over.id)
        if (oldIdx !== -1 && newIdx !== -1) {
          group.exercises = arrayMove(group.exercises, oldIdx, newIdx)
          setLocalProgram(updated)
          return
        }
      }
    }
  }

  // Swap or move the full contents (exerciseGroups + rest flag) of one day
  // into another. Operates on localProgram — user still has to hit Save Changes.
  function applyMoveWorkout(srcWeek, srcDay, dstWeek, dstDay, action) {
    if (srcWeek === dstWeek && srcDay === dstDay) return
    const updated = JSON.parse(JSON.stringify(localProgram))
    const findDay = (wNum, dNum) => {
      const w = (updated.weeks || []).find(x => Number(x.week) === Number(wNum))
      if (!w) return null
      return (w.days || []).find(x => Number(x.day) === Number(dNum)) || null
    }
    const src = findDay(srcWeek, srcDay)
    const dst = findDay(dstWeek, dstDay)
    if (!src || !dst) return

    const CONTENT = ['exerciseGroups', 'isRest', 'label', 'title', 'notes', 'restNote']
    const srcCopy = {}; const dstCopy = {}
    for (const k of CONTENT) {
      if (k in src) srcCopy[k] = JSON.parse(JSON.stringify(src[k]))
      if (k in dst) dstCopy[k] = JSON.parse(JSON.stringify(dst[k]))
    }
    // Clear
    for (const k of CONTENT) { delete src[k]; delete dst[k] }

    if (action === 'swap') {
      Object.assign(src, dstCopy)
      Object.assign(dst, srcCopy)
    } else {
      // move: destination takes src content; source becomes empty rest day
      Object.assign(dst, srcCopy)
      src.exerciseGroups = []
      src.isRest = true
    }
    setLocalProgram(updated)
    setMoveModal(null)
  }

  function doSave() {
    // Strip _id fields before saving
    const clean = JSON.parse(JSON.stringify(localProgram))
    for (const w of (clean.weeks || [])) {
      for (const d of (w.days || [])) {
        for (const g of (d.exerciseGroups || [])) {
          for (const ex of (g.exercises || [])) {
            delete ex._id
          }
        }
      }
    }
    onSave?.(clean)
  }

  if (!currentWeek) return <p style={{ color: 'var(--text-dim)' }}>No week data</p>

  return (
    <div>
      {/* Week tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {weeks.map((w, i) => (
          <button key={i} className={`btn ${i === weekIdx ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setWeekIdx(i)}>W{w.week}</button>
        ))}
      </div>

      {/* Day columns */}
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragStart={e => setActiveId(e.active.id)}
        onDragEnd={handleDragEnd}>
        <div className="editor-grid">
          {currentWeek.days.map(day => {
            const exercises = getAllExercisesForDay(day)
            return (
              <div key={day.day} className="day-column">
                <div className="day-column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Day {day.day}{day.isRest ? ' (Rest)' : ''}</span>
                  <button
                    className="btn-icon"
                    title="Move or swap this workout with another day"
                    style={{ fontSize: 12, padding: '2px 6px', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                    onClick={() => setMoveModal({ srcWeek: currentWeek.week, srcDay: day.day, action: 'swap' })}
                  >⇄</button>
                </div>
                {day.isRest ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>{day.restNote || 'Rest'}</div>
                ) : (
                  <SortableContext items={exercises.map(e => e._id)} strategy={verticalListSortingStrategy}>
                    {exercises.map(ex => (
                      <div key={ex._id}>
                        {editingField?.id === ex._id ? (
                          <div className="exercise-card" style={{ padding: 8 }}>
                            <div style={{ fontSize: 12, marginBottom: 4 }}>Edit {editingField.field}:</div>
                            <input className="inline-edit" value={editValue} onChange={e => setEditValue(e.target.value)}
                              autoFocus onBlur={commitEdit}
                              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingField(null) }} />
                          </div>
                        ) : (
                          <SortableExercise exercise={ex} onEdit={startEdit} onRemove={removeExercise} />
                        )}
                      </div>
                    ))}
                  </SortableContext>
                )}
              </div>
            )
          })}
        </div>
      </DndContext>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={doSave}>Save Changes</button>
      </div>

      {moveModal && (
        <MoveWorkoutModal
          weeks={weeks}
          moveModal={moveModal}
          setMoveModal={setMoveModal}
          onApply={applyMoveWorkout}
        />
      )}
    </div>
  )
}

function MoveWorkoutModal({ weeks, moveModal, setMoveModal, onApply }) {
  const [dstWeek, setDstWeek] = useState(moveModal.srcWeek)
  const [dstDay, setDstDay] = useState('')
  const [action, setAction] = useState(moveModal.action || 'swap')

  const destWeekObj = (weeks || []).find(w => Number(w.week) === Number(dstWeek))
  const destDays = destWeekObj ? destWeekObj.days : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setMoveModal(null)}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 20, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Move workout — W{moveModal.srcWeek}D{moveModal.srcDay}</h3>
          <button className="btn-icon" onClick={() => setMoveModal(null)} style={{ fontSize: 16, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <label style={{ flex: 1, fontSize: 13 }}>
            <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>Target week</div>
            <select value={dstWeek} onChange={e => { setDstWeek(Number(e.target.value)); setDstDay('') }} style={{ width: '100%', padding: 8, background: 'var(--bg-input)', border: '1px solid var(--card-border)', borderRadius: 6, color: 'var(--text)' }}>
              {(weeks || []).map(w => <option key={w.week} value={w.week}>Week {w.week}</option>)}
            </select>
          </label>
          <label style={{ flex: 1, fontSize: 13 }}>
            <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>Target day</div>
            <select value={dstDay} onChange={e => setDstDay(Number(e.target.value))} style={{ width: '100%', padding: 8, background: 'var(--bg-input)', border: '1px solid var(--card-border)', borderRadius: 6, color: 'var(--text)' }}>
              <option value="">Select day…</option>
              {destDays.map(d => {
                const isSelf = Number(dstWeek) === Number(moveModal.srcWeek) && Number(d.day) === Number(moveModal.srcDay)
                return <option key={d.day} value={d.day} disabled={isSelf}>Day {d.day}{d.isRest ? ' (rest)' : ''}</option>
              })}
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          <div style={{ color: 'var(--text-dim)', marginBottom: 6 }}>Action</div>
          <label style={{ marginRight: 16 }}>
            <input type="radio" name="moveAction" checked={action === 'swap'} onChange={() => setAction('swap')} /> Swap (exchange contents)
          </label>
          <label>
            <input type="radio" name="moveAction" checked={action === 'move'} onChange={() => setAction('move')} /> Move (source becomes rest)
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => setMoveModal(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={!dstDay} onClick={() => onApply(moveModal.srcWeek, moveModal.srcDay, dstWeek, dstDay, action)}>
            {action === 'swap' ? 'Swap days' : 'Move to this day'}
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          Changes are applied locally. Hit Save Changes to persist to the program.
        </div>
      </div>
    </div>
  )
}
