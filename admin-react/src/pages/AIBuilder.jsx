import React, { useState } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import MuscleHeatmap from '../components/MuscleHeatmap'
import { calculateMuscleLoad } from '../utils/muscleLoad'
import { PROGRAM_TYPES, MODEL_COSTS } from '../utils/constants'

const STRENGTH_GOALS = ['Hypertrophy', 'Strength', 'Endurance', 'Power']
const STRENGTH_SPLITS = ['Push/Pull/Legs', 'Upper/Lower', 'Full Body', 'Bro Split']
const EQUIPMENT = ['Full Gym', 'Barbell + Dumbbells', 'Dumbbells Only', 'Bodyweight']

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

  function toggleType(id) {
    setTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  function updateConfig(type, key, value) {
    setConfig(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [key]: value } }))
  }

  async function generate() {
    if (!name.trim()) { toast('Enter a program name', 'error'); return }
    if (types.length === 0) { toast('Select at least one type', 'error'); return }
    setLoading(true); setResult(null)
    try {
      const d = await API.generateProgram({
        types, typeConfig: config, model, weeks,
        name: name.trim(), notes,
        daysPerWeek, sessionTime,
      })
      if (d.error || d.detail) { toast(d.error || d.detail, 'error'); setLoading(false); return }
      if (!d.program) { toast('Generation returned no program data', 'error'); setLoading(false); return }
      setResult(d)
      setStep(5)
      toast('Program generated!')
    } catch (e) {
      toast(e.message === 'auth_expired' ? 'Session expired' : 'Generation failed', 'error')
    }
    setLoading(false)
  }

  function cancelGeneration() {
    setLoading(false)
    toast('Generation cancelled (server may still be processing)', 'info')
  }

  async function saveToLibrary() {
    if (!result?.program) return
    try {
      await API.createProgram({ name: result.program.name || name, weeks: result.program.weeks || [] })
      toast('Saved to library!')
    } catch { toast('Save failed', 'error') }
  }

  const stepCount = 5
  const modelInfo = MODEL_COSTS[model]

  return (
    <div style={{ position: 'relative' }}>
      <div className="page-title"><span className="icon">🤖</span> AI Program Builder</div>

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
              This typically takes 15–45 seconds.
            </p>
            <button className="btn btn-secondary" onClick={cancelGeneration}>Cancel</button>
          </div>
        </div>
      )}

      {/* Step 1: Select types */}
      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Select Program Type(s)</h3>
          <div className="type-grid">
            {PROGRAM_TYPES.map(t => (
              <div key={t.id} className={`type-card ${types.includes(t.id) ? 'selected' : ''}`} onClick={() => toggleType(t.id)}>
                <div className="type-icon">{t.icon}</div>
                <div className="type-name">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={types.length === 0} onClick={() => setStep(2)}>Next →</button>
          </div>
        </div>
      )}

      {/* Step 2: Type-specific config + scheduling */}
      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Configure Program</h3>

          {/* Schedule section */}
          <div className="config-schedule">
            <div className="form-group">
              <label>Training days per week: <strong>{daysPerWeek}</strong></label>
              <input type="range" min="2" max="7" value={daysPerWeek} onChange={e => setDaysPerWeek(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
                <span>2 days</span><span>7 days</span>
              </div>
            </div>
            <div className="form-group">
              <label>Session duration: <strong>{sessionTime} min</strong></label>
              <input type="range" min="30" max="120" step="5" value={sessionTime} onChange={e => setSessionTime(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
                <span>30 min</span><span>120 min</span>
              </div>
            </div>
          </div>

          {types.includes('strength') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--nn-warm)', marginBottom: 8 }}>💪 Strength</h4>
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
              <h4 style={{ color: 'var(--nn-warm)', marginBottom: 8 }}>🏋️ CrossFit</h4>
              <div className="form-group">
                <label>Focus</label>
                <input type="text" value={config.crossfit?.focus || ''} onChange={e => updateConfig('crossfit', 'focus', e.target.value)} placeholder="e.g. Olympic lifting, MetCon, Competition prep" />
              </div>
            </div>
          )}
          {types.includes('running') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--nn-warm)', marginBottom: 8 }}>👟 Running</h4>
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
              <h4 style={{ color: 'var(--nn-warm)', marginBottom: 8 }}>🏃 HYROX</h4>
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
              <h4 style={{ color: 'var(--nn-warm)', marginBottom: 8 }}>🚴 Cycling</h4>
              <div className="form-group">
                <label>Goal</label>
                <input type="text" value={config.cycling?.goal || ''} onChange={e => updateConfig('cycling', 'goal', e.target.value)} placeholder="e.g. FTP improvement, Endurance" />
              </div>
            </div>
          )}
          {types.includes('swimming') && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ color: 'var(--nn-warm)', marginBottom: 8 }}>🏊 Swimming</h4>
              <div className="form-group">
                <label>Goal</label>
                <input type="text" value={config.swimming?.goal || ''} onChange={e => updateConfig('swimming', 'goal', e.target.value)} placeholder="e.g. Triathlon prep, Technique" />
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next →</button>
          </div>
        </div>
      )}

      {/* Step 3: Model selection */}
      {step === 3 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Select AI Model</h3>
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
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>Next →</button>
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
            <label>Duration (weeks): {weeks}</label>
            <input type="range" min="4" max="24" value={weeks} onChange={e => setWeeks(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, padding: '8px 12px', background: 'rgba(42,42,74,0.2)', borderRadius: 6 }}>
            {daysPerWeek} days/week · {sessionTime} min/session · {weeks} weeks
          </div>
          <div className="form-group">
            <label>Additional Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. No deadlifts due to back injury, prefer morning sessions..." />
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setStep(3)}>← Back</button>
            <button className="btn btn-primary" onClick={generate}>
              🤖 Generate Program
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Preview result */}
      {step === 5 && result && (
        <div>
          {result.cost && (
            <div className="stats-row" style={{ marginBottom: 16 }}>
              <div className="stat-card"><div className="stat-value">${result.cost.cost_usd?.toFixed(3)}</div><div className="stat-label">Cost</div></div>
              <div className="stat-card"><div className="stat-value">{result.cost.input_tokens}</div><div className="stat-label">Input Tokens</div></div>
              <div className="stat-card"><div className="stat-value">{result.cost.output_tokens}</div><div className="stat-label">Output Tokens</div></div>
            </div>
          )}

          {result.program && (
            <>
              <MuscleHeatmap loads={calculateMuscleLoad(result.program)} />
              <div className="card">
                <div className="card-header">
                  <h3>{result.program.name || name}</h3>
                  <button className="btn btn-primary" onClick={saveToLibrary}>💾 Save to Library</button>
                </div>
                {(result.program.weeks || []).slice(0, 2).map(week => (
                  <div key={week.week} className="week-block">
                    <div className="week-label">Week {week.week}</div>
                    {(week.days || []).map(day => (
                      <div key={day.day} className="day-block">
                        <div className="day-label">Day {day.day}{day.isRest ? ' (Rest)' : ''}</div>
                        {!day.isRest && (day.exerciseGroups || []).map((group, gi) => (
                          <div key={gi}>
                            {group.exercises.map((ex, ei) => (
                              <div key={ei} className="exercise-row">
                                <span className="order">{ex.order}</span>
                                <span>{ex.name}</span>
                                <span className="dim">{ex.sets}</span>
                                <span className="dim">{ex.reps}</span>
                                <span className="dim">{ex.tempo}</span>
                                <span className="dim">{ex.rest}</span>
                                <span className="dim">{ex.rpe}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
                {(result.program.weeks || []).length > 2 && (
                  <p style={{ color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 8 }}>
                    Showing first 2 of {result.program.weeks.length} weeks...
                  </p>
                )}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => { setStep(1); setResult(null) }}>← New Program</button>
          </div>
        </div>
      )}
    </div>
  )
}
