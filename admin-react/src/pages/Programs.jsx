import React, { useState, useEffect } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import MuscleHeatmap from '../components/MuscleHeatmap'
import { calculateMuscleLoad } from '../utils/muscleLoad'
import { Icon } from '../components/Icons'
import HelpTip from '../components/HelpTip'

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

export default function Programs() {
  const toast = useToast()
  const [programs, setPrograms] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const [openWeeks, setOpenWeeks] = useState(new Set())
  const [openDays, setOpenDays] = useState(new Set())
  const [expandAllWeek, setExpandAllWeek] = useState(null) // week number with all days open

  const load = async () => {
    try { const d = await API.listPrograms(); setPrograms(d.programs) }
    catch { toast('Failed to load', 'error') }
  }

  useEffect(() => { load() }, [])

  async function toggleProgram(name) {
    if (expanded === name) { setExpanded(null); setDetail(null); setOpenWeeks(new Set()); setOpenDays(new Set()); return }
    setExpanded(name)
    setOpenWeeks(new Set())
    setOpenDays(new Set())
    try { const d = await API.getProgram(name); setDetail(d) }
    catch { toast('Failed to load program', 'error') }
  }

  function toggleWeek(w) {
    setOpenWeeks(prev => {
      const next = new Set(prev)
      if (next.has(w)) { next.delete(w); setExpandAllWeek(null) } else next.add(w)
      return next
    })
  }

  function toggleDay(key) {
    setOpenDays(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function expandAllDays(weekNum) {
    if (expandAllWeek === weekNum) {
      // Collapse all days in this week
      setOpenDays(prev => {
        const next = new Set(prev)
        for (const k of prev) { if (k.startsWith(`w${weekNum}-`)) next.delete(k) }
        return next
      })
      setExpandAllWeek(null)
    } else {
      // Expand all days in this week
      const week = (detail?.weeks || []).find(w => w.week === weekNum)
      if (!week) return
      setOpenDays(prev => {
        const next = new Set(prev)
        for (const day of (week.days || [])) { next.add(`w${weekNum}-d${day.day}`) }
        return next
      })
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
      <div className="page-title"><Icon name="programs" size={22} style={{ color: 'var(--accent2)' }} /> Programs</div>
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
                      {!isWeekOpen && (
                        <div className="drill-summary">{exerciseSummary(week)}</div>
                      )}
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
                                  {!isDayOpen && !day.isRest && (
                                    <span className="drill-day-summary">{daySummary(day)}</span>
                                  )}
                                  {!isDayOpen && day.isRest && day.restNote && (
                                    <span className="drill-day-summary">{day.restNote}</span>
                                  )}
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
                                        <span>#</span><span>Exercise</span><span>Sets</span><span>Reps</span><span>Tempo <HelpTip text="Ecc-Pause-Con-Pause in seconds. E.g. 3-1-2-0" style={{ fontSize: 7 }} /></span><span>Rest</span><span>RPE <HelpTip text="1-10 effort scale. 7 = 3 reps in reserve." style={{ fontSize: 7 }} /></span>
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
    </div>
  )
}
