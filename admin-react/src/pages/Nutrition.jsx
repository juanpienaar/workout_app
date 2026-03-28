import React, { useState, useEffect, useCallback } from 'react'
import { authFetch } from '../api'

/* ── Nutrition Coach Dashboard ── */

export default function Nutrition() {
  const [tab, setTab] = useState('overview')
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Nutrition</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['overview', 'targets', 'logs'].map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid var(--glass-border)',
              background: tab === t ? 'var(--accent)' : 'var(--surface)',
              color: tab === t ? 'white' : 'var(--text-dim)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
            }}>
            {t === 'overview' ? 'Overview' : t === 'targets' ? 'Set Targets' : 'Athlete Logs'}
          </button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'targets' && <TargetsTab />}
      {tab === 'logs' && <LogsTab />}
    </div>
  )
}

/* ── Overview Tab ── */
function OverviewTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch('/api/nutrition/coach/overview').then(r => r.json()).then(d => {
      setData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>
  if (!data?.athletes?.length) return <div style={{ color: 'var(--text-dim)' }}>No athletes found.</div>

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>Today: {data.date}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <th style={thStyle}>Athlete</th>
              <th style={thStyle}>Targets</th>
              <th style={thStyle}>Calories</th>
              <th style={thStyle}>Protein</th>
              <th style={thStyle}>Carbs</th>
              <th style={thStyle}>Fat</th>
              <th style={thStyle}>Entries</th>
            </tr>
          </thead>
          <tbody>
            {data.athletes.map(a => {
              const t = a.targets || {}
              const tot = a.today_totals || {}
              const c = a.compliance || {}
              return (
                <tr key={a.username} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={tdStyle}><span style={{ fontWeight: 500 }}>{a.username}</span></td>
                  <td style={tdStyle}>{a.has_targets ? <Dot color="var(--green)" /> : <Dot color="var(--red)" />}</td>
                  <td style={tdStyle}>
                    <MacroCell val={tot.calories} target={t.daily_calories} pct={c.calories_pct} unit="kcal" />
                  </td>
                  <td style={tdStyle}>
                    <MacroCell val={tot.protein_g} target={t.daily_protein_g} pct={c.protein_pct} unit="g" />
                  </td>
                  <td style={tdStyle}>
                    <MacroCell val={tot.carbs_g} target={t.daily_carbs_g} pct={c.carbs_pct} unit="g" />
                  </td>
                  <td style={tdStyle}>
                    <MacroCell val={tot.fat_g} target={t.daily_fat_g} pct={c.fat_pct} unit="g" />
                  </td>
                  <td style={tdStyle}>{a.today_entries || 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MacroCell({ val, target, pct, unit }) {
  if (!target) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const v = Math.round(val || 0)
  const t = Math.round(target)
  const color = !pct ? 'var(--text-dim)' :
    pct >= 80 && pct <= 120 ? 'var(--green)' :
    pct >= 50 ? 'var(--yellow)' : 'var(--red)'
  return (
    <span>
      <span style={{ color, fontWeight: 600 }}>{v}</span>
      <span style={{ color: 'var(--text-muted)' }}> / {t}{unit}</span>
    </span>
  )
}

function Dot({ color }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color }} />
}

const thStyle = { textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }
const tdStyle = { padding: '10px 12px', whiteSpace: 'nowrap' }


/* ── Targets Tab ── */
const inputStyle = { width: '100%', padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 4 }
const DIET_OPTIONS = [
  ['none', 'No restrictions'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'],
  ['pescatarian', 'Pescatarian'], ['keto', 'Keto'], ['banting', 'Banting / Low-carb'],
  ['paleo', 'Paleo'], ['no_red_meat', 'No red meat'], ['halal', 'Halal'], ['kosher', 'Kosher'],
]
const GOAL_OPTIONS = [['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain weight']]
const ACTIVITY_OPTIONS = [
  ['sedentary', 'Sedentary (desk job)'], ['light', 'Light (1-2x/week)'],
  ['moderate', 'Moderate (3-5x/week)'], ['active', 'Active (6-7x/week)'],
  ['very_active', 'Very active (2x/day)'],
]

function TargetsTab() {
  const [athletes, setAthletes] = useState([])
  const [selected, setSelected] = useState('')
  const [section, setSection] = useState('profile') // 'profile' | 'targets'

  // Profile state
  const [profile, setProfile] = useState({
    goal: 'maintain', current_weight_kg: '', target_weight_kg: '', target_weeks: '',
    height_cm: '', age: '', sex: 'male', activity_level: 'moderate',
    diet_type: 'none', allergies: '', additional_preferences: '',
  })
  const [calc, setCalc] = useState(null)

  // Targets state
  const [targets, setTargets] = useState({ daily_calories: '', daily_protein_g: '', daily_carbs_g: '', daily_fat_g: '', daily_fiber_g: '', notes: '' })
  const [currentTargets, setCurrentTargets] = useState(null)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    authFetch('/api/nutrition/coach/overview').then(r => r.json()).then(d => {
      setAthletes(d.athletes || [])
    })
  }, [])

  const loadAthlete = async (username) => {
    setSelected(username)
    setMessage('')
    setCalc(null)
    try {
      const [profileRes, targetRes] = await Promise.all([
        authFetch(`/api/nutrition/profile?username=${encodeURIComponent(username)}`).then(r => r.json()),
        authFetch(`/api/nutrition/targets?username=${encodeURIComponent(username)}`).then(r => r.json()),
      ])
      const p = profileRes.profile
      if (p) {
        setProfile({
          goal: p.goal || 'maintain', current_weight_kg: p.current_weight_kg || '',
          target_weight_kg: p.target_weight_kg || '', target_weeks: p.target_weeks || '',
          height_cm: p.height_cm || '', age: p.age || '', sex: p.sex || 'male',
          activity_level: p.activity_level || 'moderate', diet_type: p.diet_type || 'none',
          allergies: p.allergies || '', additional_preferences: p.additional_preferences || '',
        })
      } else {
        setProfile({ goal: 'maintain', current_weight_kg: '', target_weight_kg: '', target_weeks: '', height_cm: '', age: '', sex: 'male', activity_level: 'moderate', diet_type: 'none', allergies: '', additional_preferences: '' })
      }
      if (profileRes.calculated) setCalc(profileRes.calculated)

      const t = targetRes.targets
      setCurrentTargets(t)
      if (t) {
        setTargets({ daily_calories: t.daily_calories || '', daily_protein_g: t.daily_protein_g || '', daily_carbs_g: t.daily_carbs_g || '', daily_fat_g: t.daily_fat_g || '', daily_fiber_g: t.daily_fiber_g || '', notes: t.notes || '' })
      } else {
        setTargets({ daily_calories: '', daily_protein_g: '', daily_carbs_g: '', daily_fat_g: '', daily_fiber_g: '', notes: '' })
      }
    } catch { /* ignore */ }
  }

  const saveProfile = async () => {
    if (!selected) return
    setSaving(true); setMessage('')
    try {
      const res = await authFetch('/api/nutrition/profile/set', {
        method: 'POST',
        body: JSON.stringify({
          username: selected,
          profile: {
            ...profile,
            current_weight_kg: parseFloat(profile.current_weight_kg) || null,
            target_weight_kg: parseFloat(profile.target_weight_kg) || null,
            target_weeks: parseInt(profile.target_weeks) || null,
            height_cm: parseFloat(profile.height_cm) || null,
            age: parseInt(profile.age) || null,
          },
        }),
      }).then(r => r.json())
      if (res.ok) {
        setMessage('Profile saved!')
        setCalc(res.calculated)
      } else {
        setMessage('Error: ' + (res.detail || 'failed'))
      }
    } catch (e) { setMessage('Error: ' + e.message) }
    setSaving(false)
  }

  const applyCalculated = () => {
    if (!calc) return
    setTargets(p => ({
      ...p,
      daily_calories: calc.recommended_calories,
      daily_protein_g: calc.recommended_protein_g,
      daily_carbs_g: calc.recommended_carbs_g,
      daily_fat_g: calc.recommended_fat_g,
    }))
    setSection('targets')
  }

  const saveTargets = async () => {
    if (!selected) return
    setSaving(true); setMessage('')
    try {
      const res = await authFetch('/api/nutrition/targets', {
        method: 'POST',
        body: JSON.stringify({
          username: selected,
          targets: {
            daily_calories: parseFloat(targets.daily_calories) || 0,
            daily_protein_g: parseFloat(targets.daily_protein_g) || 0,
            daily_carbs_g: parseFloat(targets.daily_carbs_g) || 0,
            daily_fat_g: parseFloat(targets.daily_fat_g) || 0,
            daily_fiber_g: targets.daily_fiber_g ? parseFloat(targets.daily_fiber_g) : null,
            notes: targets.notes,
          },
        }),
      }).then(r => r.json())
      if (res.ok) { setMessage('Targets saved!'); setCurrentTargets(res.targets) }
      else { setMessage('Error: ' + (res.detail || 'failed')) }
    } catch (e) { setMessage('Error: ' + e.message) }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Athlete selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Select athlete</label>
        <select value={selected} onChange={e => loadAthlete(e.target.value)} style={inputStyle}>
          <option value="">Choose athlete...</option>
          {athletes.map(a => <option key={a.username} value={a.username}>{a.username}</option>)}
        </select>
      </div>

      {selected && (
        <>
          {/* Section toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[['profile', 'Profile & Goal'], ['targets', 'Macro Targets']].map(([key, label]) => (
              <button key={key} onClick={() => setSection(key)} style={{
                padding: '7px 16px', borderRadius: 6, border: '1px solid var(--glass-border)',
                background: section === key ? 'var(--accent)' : 'var(--surface)',
                color: section === key ? 'white' : 'var(--text-dim)',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
              }}>{label}</button>
            ))}
          </div>

          {section === 'profile' && (
            <>
              {/* Goal */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Goal</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {GOAL_OPTIONS.map(([val, label]) => (
                    <button key={val} onClick={() => setProfile(p => ({ ...p, goal: val }))} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                      border: profile.goal === val ? '2px solid var(--accent)' : '1px solid var(--glass-border)',
                      background: profile.goal === val ? 'var(--accent-dim, rgba(124,110,240,0.15))' : 'var(--surface)',
                      color: profile.goal === val ? 'var(--accent)' : 'var(--text-dim)',
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Body stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={labelStyle}>Current weight (kg)</label>
                  <input type="number" value={profile.current_weight_kg} onChange={e => setProfile(p => ({ ...p, current_weight_kg: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Height (cm)</label>
                  <input type="number" value={profile.height_cm} onChange={e => setProfile(p => ({ ...p, height_cm: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Age</label>
                  <input type="number" value={profile.age} onChange={e => setProfile(p => ({ ...p, age: e.target.value }))} style={inputStyle} /></div>
              </div>

              {/* Sex */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Sex</label>
                  <select value={profile.sex} onChange={e => setProfile(p => ({ ...p, sex: e.target.value }))} style={inputStyle}>
                    <option value="male">Male</option><option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Activity level</label>
                  <select value={profile.activity_level} onChange={e => setProfile(p => ({ ...p, activity_level: e.target.value }))} style={inputStyle}>
                    {ACTIVITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              {/* Weight goal details (only if lose/gain) */}
              {profile.goal !== 'maintain' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div><label style={labelStyle}>Target weight (kg)</label>
                    <input type="number" value={profile.target_weight_kg} onChange={e => setProfile(p => ({ ...p, target_weight_kg: e.target.value }))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Weeks to achieve</label>
                    <input type="number" value={profile.target_weeks} onChange={e => setProfile(p => ({ ...p, target_weeks: e.target.value }))} placeholder="e.g. 12" style={inputStyle} /></div>
                </div>
              )}

              {/* Diet type */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Diet type</label>
                <select value={profile.diet_type} onChange={e => setProfile(p => ({ ...p, diet_type: e.target.value }))} style={inputStyle}>
                  {DIET_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {/* Allergies & preferences */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={labelStyle}>Allergies</label>
                  <input value={profile.allergies} onChange={e => setProfile(p => ({ ...p, allergies: e.target.value }))} placeholder="e.g. nuts, shellfish" style={inputStyle} /></div>
                <div><label style={labelStyle}>Other preferences</label>
                  <input value={profile.additional_preferences} onChange={e => setProfile(p => ({ ...p, additional_preferences: e.target.value }))} placeholder="e.g. no spicy food" style={inputStyle} /></div>
              </div>

              <button onClick={saveProfile} disabled={saving} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #7c6ef0, #9333ea)', color: 'white',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
              }}>{saving ? 'Saving...' : 'Save Profile'}</button>

              {/* Calculated TDEE display */}
              {calc && (
                <div style={{ marginTop: 20, padding: 16, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Calculated Recommendations</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>BMR</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{calc.bmr}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>TDEE</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{calc.tdee}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Target</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#a78bfa' }}>{calc.recommended_calories}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                    {calc.daily_adjustment > 0 ? `+${calc.daily_adjustment}` : calc.daily_adjustment} kcal/day adjustment ·
                    Protein {calc.recommended_protein_g}g · Carbs {calc.recommended_carbs_g}g · Fat {calc.recommended_fat_g}g
                  </div>
                  <button onClick={applyCalculated} style={{
                    padding: '7px 16px', borderRadius: 6, border: '1px solid var(--accent)',
                    background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
                  }}>Apply as Macro Targets</button>
                </div>
              )}
            </>
          )}

          {section === 'targets' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  ['daily_calories', 'Calories (kcal)'], ['daily_protein_g', 'Protein (g)'],
                  ['daily_carbs_g', 'Carbs (g)'], ['daily_fat_g', 'Fat (g)'],
                  ['daily_fiber_g', 'Fiber (g, optional)'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input type="number" value={targets[key]} onChange={e => setTargets(p => ({ ...p, [key]: e.target.value }))} style={inputStyle} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Notes</label>
                <input value={targets.notes} onChange={e => setTargets(p => ({ ...p, notes: e.target.value }))}
                  placeholder="e.g. Cutting phase, increase protein" style={inputStyle} />
              </div>
              <button onClick={saveTargets} disabled={saving} style={{
                marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #7c6ef0, #9333ea)', color: 'white',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
              }}>{saving ? 'Saving...' : 'Save Targets'}</button>
              {currentTargets && (
                <div style={{ marginTop: 20, padding: 14, background: 'var(--surface)', borderRadius: 10, fontSize: 12, color: 'var(--text-dim)' }}>
                  Current targets set by {currentTargets.set_by} on {new Date(currentTargets.set_at).toLocaleDateString()}
                </div>
              )}
            </>
          )}

          {message && (
            <div style={{ marginTop: 12, fontSize: 13, color: message.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
              {message}
            </div>
          )}
        </>
      )}
    </div>
  )
}


/* ── Logs Tab ── */
function LogsTab() {
  const [athletes, setAthletes] = useState([])
  const [selected, setSelected] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [log, setLog] = useState(null)
  const [weekData, setWeekData] = useState(null)

  useEffect(() => {
    authFetch('/api/nutrition/coach/overview').then(r => r.json()).then(d => {
      setAthletes(d.athletes || [])
    })
  }, [])

  const loadLog = useCallback(async () => {
    if (!selected) return
    try {
      const [logRes, weekRes] = await Promise.all([
        authFetch(`/api/nutrition/logs/${date}?username=${encodeURIComponent(selected)}`).then(r => r.json()),
        authFetch(`/api/nutrition/logs/week/${getWeekStart(date)}?username=${encodeURIComponent(selected)}`).then(r => r.json()),
      ])
      setLog(logRes.log)
      setWeekData(weekRes.days)
    } catch { /* ignore */ }
  }, [selected, date])

  useEffect(() => { loadLog() }, [loadLog])

  const entries = log?.entries || []
  const totals = log?.totals || {}

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={selected} onChange={e => setSelected(e.target.value)}
          style={{ padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, minWidth: 180 }}>
          <option value="">Choose athlete...</option>
          {athletes.map(a => <option key={a.username} value={a.username}>{a.username}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }} />
      </div>

      {!selected ? (
        <div style={{ color: 'var(--text-dim)' }}>Select an athlete to view their food log.</div>
      ) : entries.length === 0 ? (
        <div style={{ color: 'var(--text-dim)' }}>No food logged on {date}.</div>
      ) : (
        <>
          {/* Daily totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              ['Calories', totals.calories, 'kcal', '#a78bfa'],
              ['Protein', totals.protein_g, 'g', '#2dd4bf'],
              ['Carbs', totals.carbs_g, 'g', '#fbbf24'],
              ['Fat', totals.fat_g, 'g', '#f87171'],
            ].map(([label, val, unit, color]) => (
              <div key={label} style={{ background: 'var(--surface)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{Math.round(val || 0)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{unit} {label}</div>
              </div>
            ))}
          </div>

          {/* Food list */}
          {entries.map((e, i) => (
            <div key={e.id || i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: 'var(--surface)', borderRadius: 8, marginBottom: 6,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{e.food_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {e.serving_size} · P: {Math.round(e.protein_g || 0)}g · C: {Math.round(e.carbs_g || 0)}g · F: {Math.round(e.fat_g || 0)}g
                  <span style={{ opacity: 0.4, marginLeft: 6 }}>{e.meal_type}</span>
                </div>
              </div>
              <div style={{ fontWeight: 600, color: '#a78bfa', fontSize: 14 }}>{Math.round(e.calories || 0)}</div>
            </div>
          ))}
        </>
      )}

      {/* Weekly summary */}
      {weekData && selected && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Week View</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {Object.entries(weekData).map(([d, info]) => {
              const cal = info.totals?.calories || 0
              const isCurrentDay = d === date
              return (
                <div key={d} onClick={() => setDate(d)}
                  style={{
                    background: isCurrentDay ? 'var(--accent)' : 'var(--surface)',
                    borderRadius: 8, padding: 10, textAlign: 'center', cursor: 'pointer',
                    border: isCurrentDay ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                  }}>
                  <div style={{ fontSize: 10, color: isCurrentDay ? 'white' : 'var(--text-dim)' }}>
                    {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isCurrentDay ? 'white' : (cal > 0 ? 'var(--text)' : 'var(--text-muted)') }}>
                    {cal > 0 ? Math.round(cal) : '—'}
                  </div>
                  <div style={{ fontSize: 9, color: isCurrentDay ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
                    {info.entry_count || 0} items
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day) // Sunday
  return d.toISOString().split('T')[0]
}
