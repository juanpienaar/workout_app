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
                <div className="day-column-header">Day {day.day}{day.isRest ? ' (Rest)' : ''}</div>
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
        <button className="btn btn-primary" onClick={doSave}>💾 Save Changes</button>
      </div>
    </div>
  )
}
