import React, { useState, useCallback } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import MuscleHeatmap from '../components/MuscleHeatmap'
import { calculateMuscleLoad } from '../utils/muscleLoad'
import { PROGRAM_TYPES, MODEL_COSTS } from '../utils/constants'
import { Icon } from '../components/Icons'
import HelpTip from '../components/HelpTip'

const STRENGTH_GOALS = ['Hypertrophy', 'Strength', 'Endurance', 'Power']
const STRENGTH_SPLITS = ['Push/Pull/Legs', 'Upper/Lower', 'Full Body', 'Bro Split']
const EQUIPMENT = ['Full Gym', 'Barbell + Dumbbells', 'Dumbbells Only', 'Bodyweight']

const fmt = v => (!v || v === 'NA' || v === 'N/A' || v === 'na') ? '-' : v

export default function AIBuilder() {
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
  const [editing, setEditing] = useState(null) // {week, day, group, exercise, field}
  const [editValue, setEditValue] = useState('')
  const [nlPrompt, setNlPrompt] = useState('')
  const [nlLoading, setNlLoading] = useState(false)

  // The program we're working with (edited version or original)
  const program = editedProgram || result?.program

  function toggleType(id) {
    setTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function updateConfig(type, key, value) {
    setConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [key]: value } }))
  }

  async function generate() {
    if (!name.trim()) { toast('Enter a program name', 'error'); return }
    if (types.length === 0) { toast('Select at least one type', 'error'); return }
    setLoading(true); setResult(null); setEditedProgram(null)
    try {
      const r = await API.generateProgram({
        types, typeConfig: config, model, weeks,
        name: name.trim(), notes,
        daysPerWeek, sessionTime,
      })
      console.log('AI generate response:', JSON.stringify(r).slice(0, 500))
      if (r.error || r.detail) { toast(r.error || r.detail, 'error'); setLoading(false); return }
      if (!r.program) { toast('Generation returned no program data', 'error'); console.error('Full response:', r); setLoading(false); return }
      if (!r.program.weeks || r.program.weeks.length === 0) { toast('Program generated but has no weeks', 'error'); setLoading(false); return }
      setResult(r)
      setStep(5)
      toast(`Program generated! ${r.program.weeks.length} weeks`)
    } catch (e) {
      console.error('AI generate error:', e)
      toast(e.message === 'auth_expired' ? 'Session expired' : `Generation failed: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  function cancelGeneration() {
    setLoading(false)
    toast('Generation cancelled (server may still be processing)', 'info')
  }

  // --- Inline editing ---
  function startEdit(weekIdx, dayIdx, groupIdx, exIdx, field) {
    const ex = program.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx].exercises[exIdx]
    setEditing({ weekIdx, dayIdx, groupIdx, exIdx, field })
    setEditValue(ex[field] || '')
  }

  function commitEdit() {
    if (!editing) return
    const { weekIdx, dayIdx, groupIdx, exIdx, field } = editing
    const updated = JSON.parse(JSON.stringify(program))
    updated.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx].exercises[exIdx][field] = editValue
    setEditedProgram(updated)
    setEditing(null)
  }

  function removeExercise(weekIdx, dayIdx, groupIdx, exIdx) {
    const updated = JSON.parse(JSON.stringify(program))
    const group = updated.weeks[weekIdx].days[dayIdx].exerciseGroups[groupIdx]
    group.exercises.splice(exIdx, 1)
    if (group.exercises.length === 0) {
      updated.weeks[weekIdx].days[dayIdx].exerciseGroups.splice(groupIdx, 1)
    }
    setEditedProgram(updated)
  }

  function addExercise(weekIdx, dayIdx) {
    const updated = JSON.parse(JSON.stringify(program))
    const day = updated.weeks[weekIdx].days[dayIdx]
    if (!day.exerciseGroups || day.exerciseGroups.length === 0) {
      day.exerciseGroups = [{ exercises: [] }]
    }
    const lastGroup = day.exerciseGroups[day.exerciseGroups.length - 1]
    const maxOrder = lastGroup.exercises.reduce((m, e) => Math.max(m, parseInt(e.order) || 0), 0)
    lastGroup.exercises.push({
      order: String(maxOrder + 1),
      name: 'New Exercise',
      sets: '3',
      reps: '10',
      tempo: '-',
      rest: '60s',
      rpe: '7',
    })
    setEditedProgram(updated)
  }

  // --- Natural language modification ---
  async function applyNlModification() {
    if (!nlPrompt.trim()) return
    setNlLoading(true)
    try {
      const r = await API.modifyProgram({
        program: program,
        modification_prompt: nlPrompt.trim(),
        model,
      })
      if (r.error || r.detail) {
        toast(r.error || r.detail, 'error')
      } else if (r.program) {
        setEditedProgram(r.program)
        setNlPrompt('')
        toast('Program modified!')
      } else {
        toast('Modification returned no data', 'error')
      }
    } catch (e) {
      toast(`Modification failed: ${e.message}`, 'error')
    }
    setNlLoading(false)
  }

  async function saveToLibrary() {
    if (!program) return
    try {
      await API.createProgram({ name: program.name || name, weeks: program.weeks || [] })
      toast('Saved to library!')
    } catch { toast('Save failed', 'error') }
  }

  const stepCount = 5
  const modelInfo = MODEL_COSTS[model]

  function renderEditableCell(weekIdx, dayIdx, groupIdx, exIdx, field, value) {
    const isEditing = editing?.weekIdx === weekIdx && editing?.dayIdx === dayIdx &&
      editing?.groupIdx === groupIdx && editing?.exIdx === exIdx && editing?.field === field
    if (isEditing) {
      return (
        <input
          className="inline-edit"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
          autoFocus
          style={{ width: field === 'name' ? '100%' : 48 }}
        />
      )
    }
    return (
      <span
        className={`editable-cell ${field === 'name' ? '' : 'dim'}`}
        onClick={() => startEdit(weekIdx, dayIdx, groupIdx, exIdx, field)}
        title="Click to edit"
      >
        {field === 'name' ? (value || '-') : fmt(value)}
      </span>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="page-title"><Icon name="ai-builder" size={22} style={{ color: 'var(--accent2)' }} /> AI Program Builder</div>

      {/* Step indicator */}
      <div className="step-indicator">
        {Array.from({ length: stepCount }).map((_, i) => (
          <div key={i} className={`step-dot ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}`} />
        ))}
      </div>

      {/* Generation overlay */}
      {loading && (
        <div className="generation-overlay">
          <div className="generation-modal">
            <div className="generation-spinner" />
            <h3>Generating Program...</h3>
            <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>
              Claude is building your {weeks}-week {types.join(' + ')} program.
              This typically takes 15-45 seconds.
            </p>
            <button className="btn btn-secondary" onClick={cancelGeneration}>Cancel</button>
          </div>
        </div>
      )}

      {/* NL modification overlay */}
      {nlLoading && (
        <div className="generation-overlay">
          <div className="generation-modal">
            <div className="generation-spinner" />
            <h3>Modifying Program...</h3>
            <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>
              Claude is applying your changes. This usually takes 10-20 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Select types */}
      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Select Program Type(s) <HelpTip text="Choose one or combine multiple types (e.g. Strength + Running) for a hybrid program. The AI will balance training volume across types." /></h3>
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

      {/* Step 2: Type-specific config + scheduling */}
      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Configure Program</h3>

          <div className="config-schedule">
            <div className="form-group">
              <label>Training days per week: <strong style={{ color: 'var(--accent2)' }}>{daysPerWeek}</strong></label>
              <input type="range" min="2" max="7" value={daysPerWeek} onChange={e => setDaysPerWeek(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
                <span>2 days</span><span>7 days</span>
              </div>
            </div>
            <div className="form-group">
              <label>Session duration: <strong style={{ color: 'var(--accent2)' }}>{sessionTime} min</strong></label>
              <input type="range" min="30" max="120" step="5" value={sessionTime} onChange={e => setSessionTime(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
                <span>30 min</span><span>120 min</span>
              </div>
            </div>
          </div>

          {types.includes('strength') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Strength</h4>
              <div className="form-group">
                <label>Goal</label>
                <select value={config.strength?.goal || ''} onChange={e => updateConfig('strength', 'goal', e.target.value)}>
                  <option value="">Select...</option>
                  {STRENGTH_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Split</label>
                <select value={config.strength?.split || ''} onChange={e => updateConfig('strength', 'split', e.target.value)}>
                  <option value="">Select...</option>
                  {STRENGTH_SPLITS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Equipment</label>
                <select value={config.strength?.equipment || ''} onChange={e => updateConfig('strength', 'equipment', e.target.value)}>
                  {EQUIPMENT.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          )}
          {types.includes('crossfit') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>CrossFit</h4>
              <div className="form-group">
                <label>Focus</label>
                <input type="text" value={config.crossfit?.focus || ''} onChange={e => updateConfig('crossfit', 'focus', e.target.value)} placeholder="e.g. Olympic lifting, MetCon, Competition prep" />
              </div>
            </div>
          )}
          {types.includes('running') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Running</h4>
              <div className="form-group">
                <label>Goal</label>
                <input type="text" value={config.running?.goal || ''} onChange={e => updateConfig('running', 'goal', e.target.value)} placeholder="e.g. 5K PR, Marathon, General fitness" />
              </div>
              <div className="form-group">
                <label>Current Weekly Mileage (km)</label>
                <input type="text" value={config.running?.mileage || ''} onChange={e => updateConfig('running', 'mileage', e.target.value)} placeholder="e.g. 20-30" />
              </div>
            </div>
          )}
          {types.includes('hyrox') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>HYROX</h4>
              <div className="form-group">
                <label>Phase</label>
                <select value={config.hyrox?.phase || ''} onChange={e => updateConfig('hyrox', 'phase', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="base">Base Building</option>
                  <option value="build">Build Phase</option>
                  <option value="peak">Peak / Race Prep</option>
                </select>
              </div>
            </div>
          )}
          {types.includes('cycling') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Cycling</h4>
              <div className="form-group">
                <label>Goal</label>
                <input type="text" value={config.cycling?.goal || ''} onChange={e => updateConfig('cycling', 'goal', e.target.value)} placeholder="e.g. FTP improvement, Endurance" />
              </div>
            </div>
          )}
          {types.includes('swimming') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--accent2)', marginBottom: 8 }}>Swimming</h4>
              <div className="form-group">
                <label>Goal</label>
                <input type="text" value={config.swimming?.goal || ''} onChange={e => updateConfig('swimming', 'goal', e.target.value)} placeholder="e.g. Triathlon prep, Technique" />
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next</button>
          </div>
        </div>
      )}

      {/* Step 3: Model selection */}
      {step === 3 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Select AI Model <HelpTip text="Haiku is fast and cheap — good for simple programs. Sonnet balances quality and cost. Opus produces the most detailed programs but costs more." /></h3>
          {Object.entries(MODEL_COSTS).map(([key, m]) => (
            <div key={key} className={`model-option ${model === key ? 'selected' : ''}`} onClick={() => setModel(key)}>
              <div>
                <div className="model-name">{m.name}</div>
                <div className="model-desc">{m.desc}</div>
              </div>
              <div className="model-cost">~${((m.input * 2000 + m.output * 4000) / 1000000).toFixed(2)}/program</div>
            </div>
          ))}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Next</button>
          </div>
        </div>
      )}

      {/* Step 4: Name, weeks, notes */}
      {step === 4 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Program Details</h3>
          <div className="form-group">
            <label>Program Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Hypertrophy Phase 1" />
          </div>
          <div className="form-group">
            <label>Duration (weeks): <strong style={{ color: 'var(--accent2)' }}>{weeks}</strong></label>
            <input type="range" min="4" max="24" value={weeks} onChange={e => setWeeks(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontFamily: "'Space Mono', monospace" }}>
            {daysPerWeek} days/week &middot; {sessionTime} min/session &middot; {weeks} weeks
          </div>
          <div className="form-group">
            <label>Additional Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. No deadlifts due to back injury, prefer morning sessions, focus on posterior chain..." />
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn-primary" onClick={generate}>
              <Icon name="ai-builder" size={16} /> Generate Program
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Preview + Edit result */}
      {step === 5 && program && (
        <div>
          {result?.cost && (
            <div className="stats-row" style={{ marginBottom: 16 }}>
              <div className="stat-card"><div className="stat-value">${result.cost.cost_usd?.toFixed(3)}</div><div className="stat-label">Cost</div></div>
              <div className="stat-card"><div className="stat-value">{result.cost.input_tokens}</div><div className="stat-label">Input Tokens</div></div>
              <div className="stat-card"><div className="stat-value">{result.cost.output_tokens}</div><div className="stat-label">Output Tokens</div></div>
            </div>
          )}

          {program && (
            <>
              {(() => { try { return <MuscleHeatmap loads={calculateMuscleLoad(program)} /> } catch(e) { console.error('MuscleHeatmap error:', e); return null } })()}

              {/* Natural language modification bar */}
              <div className="nl-modify-bar">
                <input
                  type="text"
                  value={nlPrompt}
                  onChange={e => setNlPrompt(e.target.value)}
                  placeholder="Describe changes... e.g. 'Make week 2 harder' or 'Swap bench press for incline press'"
                  onKeyDown={e => { if (e.key === 'Enter' && !nlLoading) applyNlModification() }}
                  disabled={nlLoading}
                />
                <button className="btn btn-primary btn-sm" onClick={applyNlModification} disabled={nlLoading || !nlPrompt.trim()}>
                  {nlLoading ? 'Applying...' : <><Icon name="send" size={14} /> Apply</>}
                </button>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <h3>{program.name || name}</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {editedProgram && <span style={{ fontSize: 12, color: 'var(--accent2)', alignSelf: 'center' }}>Edited</span>}
                    <button className="btn btn-primary btn-sm" onClick={saveToLibrary}>
                      <Icon name="save" size={14} /> Save to Library
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
                  Click any value to edit inline. Use the text bar above to describe changes in plain English (e.g. "make week 2 harder" or "swap bench press for incline press"). Showing first 2 of {(program.weeks || []).length} weeks — save to library to view the full program.
                </p>

                {(program.weeks || []).slice(0, 2).map((week, wi) => (
                  <div key={week.week || wi} className="week-block">
                    <div className="week-label">Week {week.week || wi + 1}</div>
                    {(week.days || []).map((day, di) => (
                      <div key={day.day || di} className="day-block">
                        <div className="day-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Day {day.day || di + 1}{day.isRest ? ' (Rest)' : ''}</span>
                          {!day.isRest && (
                            <button className="btn-icon" onClick={() => addExercise(wi, di)} title="Add exercise">
                              <Icon name="add" size={14} />
                            </button>
                          )}
                        </div>
                        {!day.isRest && (
                          <>
                            <div className="exercise-row-header">
                              <span>#</span>
                              <span>Exercise</span>
                              <span>Sets</span>
                              <span>Reps</span>
                              <span>Tempo <HelpTip text="Eccentric-Pause-Concentric-Pause in seconds. E.g. 3-1-2-0 = 3s down, 1s hold, 2s up, 0s top." style={{ fontSize: 7 }} /></span>
                              <span>Rest</span>
                              <span>RPE <HelpTip text="Rate of Perceived Exertion (1-10). 7 = 3 reps left in the tank. 9 = could do 1 more. 10 = max effort." style={{ fontSize: 7 }} /></span>
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
                                    <button
                                      className="btn-icon"
                                      onClick={() => removeExercise(wi, di, gi, ei)}
                                      title="Remove exercise"
                                      style={{ position: 'absolute', right: -28, top: 2 }}
                                    >
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
                  <p style={{ color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 8, fontSize: 13 }}>
                    Showing first 2 of {program.weeks.length} weeks...
                  </p>
                )}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => { setStep(1); setResult(null); setEditedProgram(null) }}>New Program</button>
          </div>
        </div>
      )}
    </div>
  )
}
