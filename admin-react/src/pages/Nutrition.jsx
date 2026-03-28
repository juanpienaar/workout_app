import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { authFetch } from '../api'
import { Icon } from '../components/Icons'
import Modal from '../components/Modal'
import { useToast } from '../components/Toast'

/* ── Constants ── */

const DIET_LABELS = {
  none: 'No restrictions', vegetarian: 'Vegetarian', vegan: 'Vegan',
  pescatarian: 'Pescatarian', keto: 'Keto', banting: 'Banting',
  paleo: 'Paleo', no_red_meat: 'No red meat', halal: 'Halal', kosher: 'Kosher',
}
const DIET_OPTIONS = [
  ['none', 'No restrictions'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'],
  ['pescatarian', 'Pescatarian'], ['keto', 'Keto'], ['banting', 'Banting / Low-carb'],
  ['paleo', 'Paleo'], ['no_red_meat', 'No red meat'], ['halal', 'Halal'], ['kosher', 'Kosher'],
]
const GOAL_OPTIONS = [
  { value: 'lose', label: 'Lose', icon: '↓', color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  { value: 'maintain', label: 'Maintain', icon: '=', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  { value: 'gain', label: 'Gain', icon: '↑', color: '#2dd4bf', bg: 'rgba(45,212,191,0.15)' },
]
const ACTIVITY_OPTIONS = [
  ['sedentary', 'Sedentary (desk job)'], ['light', 'Light (1-2x/week)'],
  ['moderate', 'Moderate (3-5x/week)'], ['active', 'Active (6-7x/week)'],
  ['very_active', 'Very active (2x/day)'],
]

/* ── Tab Bar (matching Dashboard) ── */
function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--glass-border)', marginBottom: 24 }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)} style={{
          padding: '10px 20px', background: 'none', border: 'none',
          color: activeTab === tab.id ? 'var(--accent2)' : 'var(--text-dim)',
          borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : 'none',
          cursor: 'pointer', fontSize: 14, fontFamily: "'Sora', sans-serif",
          fontWeight: activeTab === tab.id ? 600 : 400, transition: 'all 0.2s ease',
        }}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/* ── Main Nutrition Page ── */

export default function Nutrition() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('overview')
  const [athletes, setAthletes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [profileModal, setProfileModal] = useState(null) // athlete username for profile edit

  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    try {
      const d = await authFetch('/api/nutrition/coach/overview').then(r => r.json())
      setAthletes(d.athletes || [])
    } catch { if (!silent) toast('Failed to load nutrition data', 'error') }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (activeTab === 'overview') loadData(true) }, [activeTab])

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Food Logs' },
  ]

  return (
    <div>
      <div className="page-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
        </svg>
        Nutrition
      </div>

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'overview' && (
        <OverviewTab
          athletes={athletes} loading={loading}
          onSelect={setSelected} selected={selected}
          onEditProfile={u => setProfileModal(u)}
          onRefresh={() => loadData(true)}
        />
      )}
      {activeTab === 'logs' && <LogsTab athletes={athletes} />}

      {profileModal && (
        <ProfileModal
          username={profileModal}
          onClose={() => { setProfileModal(null); loadData(true) }}
          toast={toast}
        />
      )}
    </div>
  )
}


/* ── Overview Tab — Athlete cards grid ── */

function OverviewTab({ athletes, loading, onSelect, selected, onEditProfile, onRefresh }) {
  if (loading) return <div style={{ color: 'var(--text-dim)', padding: 32 }}>Loading...</div>
  if (!athletes.length) return <div style={{ color: 'var(--text-dim)', padding: 32 }}>No athletes found.</div>

  return (
    <>
      {/* Summary stats row */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value">{athletes.length}</div>
          <div className="stat-label">Athletes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{athletes.filter(a => a.has_profile).length}</div>
          <div className="stat-label">Profiles Set</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{athletes.filter(a => a.has_targets).length}</div>
          <div className="stat-label">Targets Set</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{athletes.reduce((s, a) => s + (a.today_entries || 0), 0)}</div>
          <div className="stat-label">Entries Today</div>
        </div>
      </div>

      {/* Athlete cards grid */}
      <div className="athlete-grid">
        {athletes.map(a => {
          const ps = a.profile_summary
          const goal = GOAL_OPTIONS.find(g => g.value === ps?.goal)
          const t = a.targets || {}
          const tot = a.today_totals || {}
          const isSelected = selected === a.username

          return (
            <div key={a.username} className="athlete-card"
              onClick={() => onSelect(isSelected ? null : a.username)}
              style={isSelected ? { borderColor: 'rgba(124,110,240,0.45)', boxShadow: '0 8px 32px rgba(124,110,240,0.15)' } : {}}>

              {/* Header: avatar + name + badges */}
              <div className="athlete-card-header">
                <div className="athlete-avatar">
                  {a.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="athlete-name">{a.username}</div>
                  <div className="athlete-program">{a.program || 'No program'}</div>
                </div>
                {goal && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                    background: goal.bg, color: goal.color,
                    fontFamily: "'Space Mono', monospace", letterSpacing: '0.04em',
                  }}>
                    {goal.icon} {goal.label.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Status badges */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                <span className={`badge ${a.has_profile ? 'badge-athlete' : ''}`}
                  style={!a.has_profile ? { background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--red)' } : {}}>
                  {a.has_profile ? 'Profile' : 'No Profile'}
                </span>
                <span className={`badge ${a.has_targets ? 'badge-athlete' : ''}`}
                  style={!a.has_targets ? { background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--red)' } : {}}>
                  {a.has_targets ? 'Targets' : 'No Targets'}
                </span>
                {ps?.diet_type && ps.diet_type !== 'none' && (
                  <span className="badge badge-coach">{DIET_LABELS[ps.diet_type] || ps.diet_type}</span>
                )}
              </div>

              {/* Macro stats */}
              <div className="athlete-card-label">Today's Intake</div>
              <div className="athlete-week-stats">
                <div className="athlete-stat">
                  <div className="athlete-stat-val" style={{ fontSize: 16 }}>
                    {a.has_targets ? Math.round(tot.calories || 0) : '—'}
                  </div>
                  <div className="athlete-stat-lbl">kcal</div>
                  {a.has_targets && t.daily_calories > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      / {Math.round(t.daily_calories)}
                    </div>
                  )}
                </div>
                <div className="athlete-stat">
                  <div className="athlete-stat-val" style={{ fontSize: 16 }}>
                    {a.has_targets ? Math.round(tot.protein_g || 0) : '—'}
                  </div>
                  <div className="athlete-stat-lbl">Protein</div>
                  {a.has_targets && t.daily_protein_g > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      / {Math.round(t.daily_protein_g)}g
                    </div>
                  )}
                </div>
                <div className="athlete-stat">
                  <div className="athlete-stat-val" style={{ fontSize: 16 }}>
                    {a.has_targets ? Math.round(tot.carbs_g || 0) : '—'}
                  </div>
                  <div className="athlete-stat-lbl">Carbs</div>
                  {a.has_targets && t.daily_carbs_g > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      / {Math.round(t.daily_carbs_g)}g
                    </div>
                  )}
                </div>
                <div className="athlete-stat">
                  <div className="athlete-stat-val" style={{ fontSize: 16 }}>
                    {a.has_targets ? Math.round(tot.fat_g || 0) : '—'}
                  </div>
                  <div className="athlete-stat-lbl">Fat</div>
                  {a.has_targets && t.daily_fat_g > 0 && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      / {Math.round(t.daily_fat_g)}g
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded detail when selected */}
              {isSelected && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onEditProfile(a.username) }}>
                      {a.has_profile ? 'Edit Profile & Targets' : 'Set Profile & Targets'}
                    </button>
                  </div>
                  {a.latest_metrics_weight && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                      Latest weigh-in: <strong style={{ color: 'var(--teal)' }}>{a.latest_metrics_weight}kg</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}


/* ── Profile & Targets Modal ── */

function ProfileModal({ username, onClose, toast }) {
  const [section, setSection] = useState('profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [metricsWeight, setMetricsWeight] = useState(null)
  const [athleteProgram, setAthleteProgram] = useState('')

  // Profile state
  const [profile, setProfile] = useState({
    goal: 'maintain', current_weight_kg: '', target_weight_kg: '', target_weeks: '',
    height_cm: '', age: '', sex: 'male', activity_level: 'moderate',
    diet_type: 'none', allergies: '', additional_preferences: '',
  })
  const [calc, setCalc] = useState(null)

  // Targets state
  const [targets, setTargets] = useState({
    daily_calories: '', daily_protein_g: '', daily_carbs_g: '',
    daily_fat_g: '', daily_fiber_g: '', notes: ''
  })
  const [currentTargets, setCurrentTargets] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [profileRes, targetRes] = await Promise.all([
          authFetch(`/api/nutrition/profile?username=${encodeURIComponent(username)}`).then(r => r.json()),
          authFetch(`/api/nutrition/targets?username=${encodeURIComponent(username)}`).then(r => r.json()),
        ])

        if (profileRes.latest_metrics_weight) setMetricsWeight(profileRes.latest_metrics_weight)
        if (profileRes.program) setAthleteProgram(profileRes.program)

        const p = profileRes.profile
        if (p) {
          setProfile({
            goal: p.goal || 'maintain', current_weight_kg: p.current_weight_kg || '',
            target_weight_kg: p.target_weight_kg || '', target_weeks: p.target_weeks || '',
            height_cm: p.height_cm || '', age: p.age || '', sex: p.sex || 'male',
            activity_level: p.activity_level || 'moderate', diet_type: p.diet_type || 'none',
            allergies: p.allergies || '', additional_preferences: p.additional_preferences || '',
          })
        } else if (profileRes.latest_metrics_weight) {
          setProfile(prev => ({ ...prev, current_weight_kg: profileRes.latest_metrics_weight }))
        }
        if (profileRes.calculated) setCalc(profileRes.calculated)

        const t = targetRes.targets
        setCurrentTargets(t)
        if (t) {
          setTargets({
            daily_calories: t.daily_calories || '', daily_protein_g: t.daily_protein_g || '',
            daily_carbs_g: t.daily_carbs_g || '', daily_fat_g: t.daily_fat_g || '',
            daily_fiber_g: t.daily_fiber_g || '', notes: t.notes || '',
          })
        }
      } catch { toast('Failed to load athlete data', 'error') }
      setLoading(false)
    })()
  }, [username])

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/nutrition/profile/set', {
        method: 'POST',
        body: JSON.stringify({
          username,
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
        toast(`Profile saved for ${username}`)
        setCalc(res.calculated)
      } else toast(res.detail || 'Save failed', 'error')
    } catch (e) { toast(e.message, 'error') }
    setSaving(false)
  }

  const saveTargets = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/nutrition/targets', {
        method: 'POST',
        body: JSON.stringify({
          username,
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
      if (res.ok) {
        toast(`Targets saved for ${username}`)
        setCurrentTargets(res.targets)
      } else toast(res.detail || 'Save failed', 'error')
    } catch (e) { toast(e.message, 'error') }
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

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div className="athlete-avatar" style={{ width: 38, height: 38, fontSize: 15 }}>
            {username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>{username}</h3>
            {athleteProgram && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: "'Space Mono', monospace" }}>{athleteProgram}</div>}
          </div>
          {metricsWeight && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: "'Space Mono', monospace", textTransform: 'uppercase' }}>Latest Weigh-in</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)', fontFamily: "'Space Mono', monospace" }}>{metricsWeight}kg</div>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</div>
        ) : (
          <>
            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--glass-border)', marginBottom: 20 }}>
              {[['profile', 'Profile & Goal'], ['targets', 'Macro Targets']].map(([key, label]) => (
                <button key={key} onClick={() => setSection(key)} style={{
                  padding: '8px 0', background: 'none', border: 'none',
                  color: section === key ? 'var(--accent2)' : 'var(--text-dim)',
                  borderBottom: section === key ? '2px solid var(--accent)' : 'none',
                  cursor: 'pointer', fontSize: 13, fontFamily: "'Sora', sans-serif",
                  fontWeight: section === key ? 600 : 400, transition: 'all 0.2s ease',
                }}>{label}</button>
              ))}
            </div>

            {/* ── Profile Section ── */}
            {section === 'profile' && (
              <>
                {/* Goal selector cards */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {GOAL_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => setProfile(p => ({ ...p, goal: opt.value }))}
                      className="type-card"
                      style={{
                        flex: 1,
                        ...(profile.goal === opt.value ? {
                          borderColor: opt.color + '80',
                          background: opt.bg,
                          boxShadow: `0 4px 16px ${opt.bg}`,
                        } : {}),
                      }}>
                      <div className="type-icon" style={{
                        fontSize: 20,
                        ...(profile.goal === opt.value ? { background: opt.bg, borderColor: opt.color + '40' } : {}),
                      }}>
                        {opt.icon}
                      </div>
                      <div className="type-name" style={profile.goal === opt.value ? { color: opt.color } : {}}>
                        {opt.label} weight
                      </div>
                    </button>
                  ))}
                </div>

                {/* Body stats */}
                <div className="form-group">
                  <label>
                    Current weight (kg)
                    {metricsWeight && parseFloat(profile.current_weight_kg) !== metricsWeight && (
                      <button className="btn-link" style={{ marginLeft: 8, fontSize: 10 }}
                        onClick={() => setProfile(p => ({ ...p, current_weight_kg: metricsWeight }))}>
                        Use {metricsWeight}kg from metrics
                      </button>
                    )}
                  </label>
                  <input type="number" value={profile.current_weight_kg}
                    onChange={e => setProfile(p => ({ ...p, current_weight_kg: e.target.value }))}
                    placeholder="e.g. 80" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Height (cm)</label>
                    <input type="number" value={profile.height_cm}
                      onChange={e => setProfile(p => ({ ...p, height_cm: e.target.value }))} placeholder="e.g. 175" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Age</label>
                    <input type="number" value={profile.age}
                      onChange={e => setProfile(p => ({ ...p, age: e.target.value }))} placeholder="e.g. 30" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Sex</label>
                    <select value={profile.sex} onChange={e => setProfile(p => ({ ...p, sex: e.target.value }))}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>

                {/* Weight target (only if not maintain) */}
                {profile.goal !== 'maintain' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Target weight (kg)</label>
                      <input type="number" value={profile.target_weight_kg}
                        onChange={e => setProfile(p => ({ ...p, target_weight_kg: e.target.value }))}
                        placeholder={profile.goal === 'lose' ? 'e.g. 70' : 'e.g. 90'} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Weeks to achieve</label>
                      <input type="number" value={profile.target_weeks}
                        onChange={e => setProfile(p => ({ ...p, target_weeks: e.target.value }))} placeholder="e.g. 12" />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Activity Level</label>
                    <select value={profile.activity_level} onChange={e => setProfile(p => ({ ...p, activity_level: e.target.value }))}>
                      {ACTIVITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Diet Type</label>
                    <select value={profile.diet_type} onChange={e => setProfile(p => ({ ...p, diet_type: e.target.value }))}>
                      {DIET_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Allergies</label>
                    <input value={profile.allergies} onChange={e => setProfile(p => ({ ...p, allergies: e.target.value }))} placeholder="e.g. nuts, shellfish" />
                  </div>
                  <div className="form-group">
                    <label>Other Preferences</label>
                    <input value={profile.additional_preferences} onChange={e => setProfile(p => ({ ...p, additional_preferences: e.target.value }))} placeholder="e.g. no spicy food" />
                  </div>
                </div>

                <button className="btn btn-primary" onClick={saveProfile} disabled={saving} style={{ width: '100%' }}>
                  {saving ? 'Saving...' : `Save Profile for ${username}`}
                </button>

                {/* TDEE calculation card */}
                {calc && (
                  <div className="card" style={{ marginTop: 16, padding: 20 }}>
                    <div className="card-header" style={{ marginBottom: 12 }}>
                      <h3 style={{ fontSize: 14 }}>Calculated Recommendations</h3>
                    </div>
                    <div className="stats-row" style={{ marginBottom: 12 }}>
                      <div className="stat-card" style={{ padding: 12 }}>
                        <div className="stat-value" style={{ fontSize: 22 }}>{calc.bmr}</div>
                        <div className="stat-label">BMR</div>
                      </div>
                      <div className="stat-card" style={{ padding: 12 }}>
                        <div className="stat-value" style={{ fontSize: 22 }}>{calc.tdee}</div>
                        <div className="stat-label">TDEE</div>
                      </div>
                      <div className="stat-card" style={{ padding: 12 }}>
                        <div className="stat-value" style={{ fontSize: 22 }}>{calc.recommended_calories}</div>
                        <div className="stat-label">Target Cal</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
                      <span>Adjustment: {calc.daily_adjustment > 0 ? '+' : ''}{calc.daily_adjustment} kcal/day</span>
                      <span>P {calc.recommended_protein_g}g · C {calc.recommended_carbs_g}g · F {calc.recommended_fat_g}g</span>
                    </div>
                    <button className="btn btn-secondary" onClick={applyCalculated} style={{ width: '100%' }}>
                      Apply as Macro Targets
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Targets Section ── */}
            {section === 'targets' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    ['daily_calories', 'Calories (kcal)'], ['daily_protein_g', 'Protein (g)'],
                    ['daily_carbs_g', 'Carbs (g)'], ['daily_fat_g', 'Fat (g)'],
                    ['daily_fiber_g', 'Fiber (g, optional)'],
                  ].map(([key, label]) => (
                    <div key={key} className="form-group">
                      <label>{label}</label>
                      <input type="number" value={targets[key]}
                        onChange={e => setTargets(p => ({ ...p, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input value={targets.notes}
                    onChange={e => setTargets(p => ({ ...p, notes: e.target.value }))}
                    placeholder="e.g. Cutting phase, increase protein" />
                </div>

                <button className="btn btn-primary" onClick={saveTargets} disabled={saving} style={{ width: '100%' }}>
                  {saving ? 'Saving...' : `Save Targets for ${username}`}
                </button>

                {currentTargets && (
                  <div style={{ marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 12, fontSize: 12, color: 'var(--text-dim)', border: '1px solid var(--glass-border)' }}>
                    Current targets set by <strong style={{ color: 'var(--accent2)' }}>{currentTargets.set_by}</strong> on {new Date(currentTargets.set_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}


/* ── Food Logs Tab ── */

function LogsTab({ athletes }) {
  const [selected, setSelected] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [log, setLog] = useState(null)
  const [weekData, setWeekData] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadLog = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    try {
      const [logRes, weekRes] = await Promise.all([
        authFetch(`/api/nutrition/logs/${date}?username=${encodeURIComponent(selected)}`).then(r => r.json()),
        authFetch(`/api/nutrition/logs/week/${getWeekStart(date)}?username=${encodeURIComponent(selected)}`).then(r => r.json()),
      ])
      setLog(logRes.log)
      setWeekData(weekRes.days)
    } catch { /* ignore */ }
    setLoading(false)
  }, [selected, date])

  useEffect(() => { loadLog() }, [loadLog])

  const entries = log?.entries || []
  const totals = log?.totals || {}

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            style={{ minWidth: 200 }}>
            <option value="">Choose athlete...</option>
            {athletes.map(a => <option key={a.username} value={a.username}>{a.username}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      {!selected ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
          </div>
          <div style={{ color: 'var(--text-dim)' }}>Select an athlete to view their food log</div>
        </div>
      ) : loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 32 }}>Loading...</div>
      ) : (
        <>
          {/* Weekly calendar */}
          {weekData && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 style={{ fontSize: 14 }}>Week View — {selected}</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {Object.entries(weekData).map(([d, info]) => {
                  const cal = info.totals?.calories || 0
                  const isCurrentDay = d === date
                  return (
                    <div key={d} onClick={() => setDate(d)}
                      style={{
                        background: isCurrentDay ? 'rgba(124,110,240,0.14)' : 'var(--surface2)',
                        borderRadius: 10, padding: 10, textAlign: 'center', cursor: 'pointer',
                        border: isCurrentDay ? '1px solid rgba(124,110,240,0.35)' : '1px solid var(--glass-border)',
                        transition: 'all 0.15s',
                      }}>
                      <div style={{ fontSize: 10, color: isCurrentDay ? 'var(--accent2)' : 'var(--text-muted)', fontFamily: "'Space Mono', monospace", textTransform: 'uppercase' }}>
                        {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div style={{
                        fontSize: 16, fontWeight: 700, marginTop: 2,
                        color: isCurrentDay ? 'var(--accent2)' : (cal > 0 ? 'var(--text)' : 'var(--text-muted)'),
                        fontFamily: "'Space Mono', monospace",
                      }}>
                        {cal > 0 ? Math.round(cal) : '—'}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                        {info.entry_count || 0} items
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Daily totals stat cards */}
          {entries.length > 0 && (
            <div className="stats-row" style={{ marginBottom: 16 }}>
              {[
                ['Calories', totals.calories, 'kcal'],
                ['Protein', totals.protein_g, 'g'],
                ['Carbs', totals.carbs_g, 'g'],
                ['Fat', totals.fat_g, 'g'],
              ].map(([label, val, unit]) => (
                <div key={label} className="stat-card">
                  <div className="stat-value" style={{ fontSize: 22 }}>{Math.round(val || 0)}</div>
                  <div className="stat-label">{unit} {label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Food entries table */}
          {entries.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
              No food logged on {date}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Meal</th>
                  <th>Serving</th>
                  <th>Calories</th>
                  <th>Protein</th>
                  <th>Carbs</th>
                  <th>Fat</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id || i}>
                    <td><strong>{e.food_name}</strong></td>
                    <td>
                      <span className="badge badge-coach" style={{ textTransform: 'capitalize' }}>
                        {e.meal_type || 'other'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-dim)' }}>{e.serving_size}</td>
                    <td style={{ fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>{Math.round(e.calories || 0)}</td>
                    <td style={{ color: 'var(--teal)', fontFamily: "'Space Mono', monospace" }}>{Math.round(e.protein_g || 0)}g</td>
                    <td style={{ color: 'var(--yellow)', fontFamily: "'Space Mono', monospace" }}>{Math.round(e.carbs_g || 0)}g</td>
                    <td style={{ color: 'var(--red)', fontFamily: "'Space Mono', monospace" }}>{Math.round(e.fat_g || 0)}g</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}


/* ── Helpers ── */

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}
