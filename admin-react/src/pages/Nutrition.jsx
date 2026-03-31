import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { authFetch } from '../api'
import { API } from '../api'
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
      {/* Meal Plans moved to Programs > Nutrition Plans */}
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
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
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

              {/* Active Meal Plan */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 11 }}>
                <span style={{ fontSize: 14 }}>📅</span>
                {a.active_meal_plan ? (
                  <span style={{ color: 'var(--teal)', fontWeight: 500 }}>
                    {a.active_meal_plan.name}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
                      ({a.active_meal_plan.days} days)
                    </span>
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    No meal plan{a.meal_plan_count > 0 ? ` · ${a.meal_plan_count} available` : ''}
                  </span>
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
              <MacroTargetsEditor
                targets={targets} setTargets={setTargets}
                currentTargets={currentTargets}
                onSave={saveTargets} saving={saving} username={username}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}


/* ── Macro Targets Editor ── */
// Calories per gram: protein=4, carbs=4, fat=9
function macrosToCalories(p, c, f) {
  return Math.round((parseFloat(p) || 0) * 4 + (parseFloat(c) || 0) * 4 + (parseFloat(f) || 0) * 9)
}

function MacroTargetsEditor({ targets, setTargets, currentTargets, onSave, saving, username }) {
  const protein = parseFloat(targets.daily_protein_g) || 0
  const carbs = parseFloat(targets.daily_carbs_g) || 0
  const fat = parseFloat(targets.daily_fat_g) || 0
  const computedCal = macrosToCalories(protein, carbs, fat)

  // Percentage of total calories from each macro
  const proteinCal = protein * 4
  const carbsCal = carbs * 4
  const fatCal = fat * 9
  const totalCal = proteinCal + carbsCal + fatCal
  const pctP = totalCal > 0 ? Math.round((proteinCal / totalCal) * 100) : 0
  const pctC = totalCal > 0 ? Math.round((carbsCal / totalCal) * 100) : 0
  const pctF = totalCal > 0 ? Math.round((fatCal / totalCal) * 100) : 0

  // Distribute calories across macros by percentage (when user changes calorie target)
  const redistributeFromCalories = (newCal) => {
    const cal = parseFloat(newCal) || 0
    if (cal <= 0) return
    // Use current percentages if available, otherwise default 30/40/30
    const curP = pctP || 30, curC = pctC || 40, curF = pctF || 30
    const total = curP + curC + curF
    const rP = curP / total, rC = curC / total, rF = curF / total
    setTargets(prev => ({
      ...prev,
      daily_calories: cal,
      daily_protein_g: Math.round((cal * rP) / 4),
      daily_carbs_g: Math.round((cal * rC) / 4),
      daily_fat_g: Math.round((cal * rF) / 9),
    }))
  }

  // When a macro changes, auto-update calories
  const setMacro = (key, val) => {
    setTargets(prev => {
      const next = { ...prev, [key]: val }
      const p = parseFloat(key === 'daily_protein_g' ? val : next.daily_protein_g) || 0
      const c = parseFloat(key === 'daily_carbs_g' ? val : next.daily_carbs_g) || 0
      const f = parseFloat(key === 'daily_fat_g' ? val : next.daily_fat_g) || 0
      next.daily_calories = macrosToCalories(p, c, f)
      return next
    })
  }

  // Preset splits
  const presets = [
    { label: 'Balanced', p: 30, c: 40, f: 30 },
    { label: 'High Protein', p: 40, c: 30, f: 30 },
    { label: 'Keto', p: 25, c: 5, f: 70 },
    { label: 'Low Fat', p: 35, c: 45, f: 20 },
  ]
  const applyPreset = (preset) => {
    const cal = computedCal || 2000
    setTargets(prev => ({
      ...prev,
      daily_calories: cal,
      daily_protein_g: Math.round((cal * preset.p / 100) / 4),
      daily_carbs_g: Math.round((cal * preset.c / 100) / 4),
      daily_fat_g: Math.round((cal * preset.f / 100) / 9),
    }))
  }

  // Visual bar for macro split
  const barSegments = [
    { pct: pctP, color: 'var(--teal)', label: 'P' },
    { pct: pctC, color: 'var(--yellow)', label: 'C' },
    { pct: pctF, color: 'var(--red)', label: 'F' },
  ]

  return (
    <>
      {/* Calorie total — computed from macros */}
      <div className="card" style={{ textAlign: 'center', padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--muted2)', fontFamily: "'Space Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Daily Calories
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <input type="number" value={targets.daily_calories || computedCal || ''}
            onChange={e => redistributeFromCalories(e.target.value)}
            style={{
              width: 120, textAlign: 'center', fontSize: 28, fontWeight: 700,
              fontFamily: "'Space Mono', monospace",
              background: 'transparent', border: '1px solid var(--glass-border)',
              borderRadius: 10, padding: '4px 8px', color: 'var(--text)',
            }}
            placeholder="2000" />
          <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>kcal</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Computed from macros: {computedCal} kcal
        </div>

        {/* Macro split bar */}
        {totalCal > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
              {barSegments.map((s, i) => (
                <div key={i} style={{ width: `${s.pct}%`, background: s.color, transition: 'width 0.3s' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 11 }}>
              <span style={{ color: 'var(--teal)' }}>P {pctP}%</span>
              <span style={{ color: 'var(--yellow)' }}>C {pctC}%</span>
              <span style={{ color: 'var(--red)' }}>F {pctF}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Preset splits */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {presets.map(pr => (
          <button key={pr.label} onClick={() => applyPreset(pr)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11 }}>
            {pr.label} ({pr.p}/{pr.c}/{pr.f})
          </button>
        ))}
      </div>

      {/* Macro inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          ['daily_protein_g', 'Protein', 'var(--teal)', 4],
          ['daily_carbs_g', 'Carbs', 'var(--yellow)', 4],
          ['daily_fat_g', 'Fat', 'var(--red)', 9],
        ].map(([key, label, color, calPerG]) => {
          const grams = parseFloat(targets[key]) || 0
          const kcal = grams * calPerG
          return (
            <div key={key}>
              <div className="form-group" style={{ marginBottom: 4 }}>
                <label>{label} (g)</label>
                <input type="number" value={targets[key]}
                  onChange={e => setMacro(key, e.target.value)}
                  style={{ borderColor: color + '40' }} />
              </div>
              <div style={{ fontSize: 10, color, fontFamily: "'Space Mono', monospace" }}>
                {Math.round(kcal)} kcal · {totalCal > 0 ? Math.round((kcal / totalCal) * 100) : 0}%
              </div>
            </div>
          )
        })}
      </div>

      {/* Fiber & notes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <div className="form-group">
          <label>Fiber (g, optional)</label>
          <input type="number" value={targets.daily_fiber_g}
            onChange={e => setTargets(p => ({ ...p, daily_fiber_g: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <input value={targets.notes}
            onChange={e => setTargets(p => ({ ...p, notes: e.target.value }))}
            placeholder="e.g. Cutting phase, increase protein" />
        </div>
      </div>

      <button className="btn btn-primary" onClick={onSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? 'Saving...' : `Save Targets for ${username}`}
      </button>

      {currentTargets && (
        <div style={{ marginTop: 16, padding: 14, background: 'var(--surface)', borderRadius: 12, fontSize: 12, color: 'var(--text-dim)', border: '1px solid var(--glass-border)' }}>
          Current targets set by <strong style={{ color: 'var(--accent2)' }}>{currentTargets.set_by}</strong> on {new Date(currentTargets.set_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      )}
    </>
  )
}


/* ── Meal Plans Tab ── */

const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎', pre_workout: '💪', post_workout: '🥤' }
const MEAL_LABELS_MAP = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', pre_workout: 'Pre-Workout', post_workout: 'Post-Workout' }
const ALL_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout']
const STORE_LIST = ['Morrisons', 'Tesco', 'Sainsburys', 'Asda', 'Aldi', 'Lidl', 'Waitrose', 'M&S', 'Woolworths', 'Checkers', 'Pick n Pay', 'Spar']

function MealPlansTab({ athletes, toast }) {
  const [selected, setSelected] = useState('')
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedPlan, setExpandedPlan] = useState(null)
  const [expandedDay, setExpandedDay] = useState(null)

  // ── Wizard state ──
  const [wizardStep, setWizardStep] = useState(0) // 0=hidden, 1=config, 2=fixed meals, 3=generating
  const [numDays, setNumDays] = useState(7)
  const [selectedMealTypes, setSelectedMealTypes] = useState(['breakfast', 'lunch', 'dinner', 'snack'])
  const [preferences, setPreferences] = useState('')
  const [restrictions, setRestrictions] = useState('')
  const [selectedStores, setSelectedStores] = useState([])
  const [customStore, setCustomStore] = useState('')
  const [planName, setPlanName] = useState('')
  const [fixedMeals, setFixedMeals] = useState([])
  const [generating, setGenerating] = useState(false)
  const [renamingPlan, setRenamingPlan] = useState(null) // plan id being renamed
  const [renameValue, setRenameValue] = useState('')

  const loadPlans = async (username) => {
    setSelected(username)
    setWizardStep(0)
    if (!username) return
    setLoading(true)
    try {
      const res = await authFetch(`/api/nutrition/meal-plans?username=${encodeURIComponent(username)}`).then(r => r.json())
      setPlans(res.meal_plans || [])
    } catch { setPlans([]) }
    setLoading(false)
  }

  const toggleMealType = (mt) => {
    setSelectedMealTypes(prev => prev.includes(mt) ? prev.filter(t => t !== mt) : [...prev, mt])
  }

  const toggleStore = (s) => {
    setSelectedStores(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  // ── Fixed meal with ingredients ──
  const addFixedMeal = () => {
    setFixedMeals(prev => [...prev, {
      day: null, meal_type: selectedMealTypes[0] || 'breakfast', name: '',
      ingredients: [{ food_name: '', amount: '', unit: 'g' }],
    }])
  }

  const updateFixedMeal = (idx, field, value) => {
    setFixedMeals(prev => prev.map((fm, i) => i === idx ? { ...fm, [field]: value } : fm))
  }

  const removeFixedMeal = (idx) => {
    setFixedMeals(prev => prev.filter((_, i) => i !== idx))
  }

  const addIngredient = (mealIdx) => {
    setFixedMeals(prev => prev.map((fm, i) =>
      i === mealIdx ? { ...fm, ingredients: [...fm.ingredients, { food_name: '', amount: '', unit: 'g' }] } : fm
    ))
  }

  const updateIngredient = (mealIdx, ingIdx, field, value) => {
    setFixedMeals(prev => prev.map((fm, i) => {
      if (i !== mealIdx) return fm
      const ings = fm.ingredients.map((ing, j) => j === ingIdx ? { ...ing, [field]: value } : ing)
      return { ...fm, ingredients: ings }
    }))
  }

  const removeIngredient = (mealIdx, ingIdx) => {
    setFixedMeals(prev => prev.map((fm, i) => {
      if (i !== mealIdx) return fm
      return { ...fm, ingredients: fm.ingredients.filter((_, j) => j !== ingIdx) }
    }))
  }

  const startWizard = () => {
    setWizardStep(1)
    setPlanName('')
    setFixedMeals([])
    setPreferences('')
    setRestrictions('')
    setSelectedStores([])
    setCustomStore('')
  }

  const handleGenerate = async () => {
    if (!selected) return
    setGenerating(true)
    setWizardStep(3)

    // Build fixed meals with ingredient detail
    const cleanFixed = fixedMeals
      .filter(fm => fm.ingredients.some(i => i.food_name.trim()))
      .map(fm => ({
        day: fm.day ? parseInt(fm.day) : null,
        meal_type: fm.meal_type,
        name: fm.name.trim() || fm.ingredients.filter(i => i.food_name.trim()).map(i => i.food_name).join(' + '),
        ingredients: fm.ingredients
          .filter(i => i.food_name.trim())
          .map(i => ({ food_name: i.food_name.trim(), serving_size: `${i.amount}${i.unit}` })),
      }))

    const allStores = [...selectedStores, ...(customStore.trim() ? [customStore.trim()] : [])]

    try {
      const r = await authFetch('/api/nutrition/meal-plans/generate-for', {
        method: 'POST',
        body: JSON.stringify({
          username: selected,
          plan_name: planName.trim() || `${numDays}-Day Plan`,
          num_days: numDays,
          meals_per_day: selectedMealTypes.length,
          meal_types: selectedMealTypes,
          fixed_meals: cleanFixed,
          preferences,
          restrictions,
          stores: allStores,
        }),
      })
      const res = await r.json()
      if (r.ok && res.ok) {
        setPlans(prev => [...prev, res.meal_plan])
        setWizardStep(0)
        setExpandedPlan(res.meal_plan.id)
        toast(`Meal plan generated and assigned to ${selected}!`)
      } else {
        const detail = res.detail
        const msg = Array.isArray(detail) ? detail.map(d => d.msg || d).join('; ') : (typeof detail === 'string' ? detail : 'Failed to generate')
        toast(msg, 'error')
        setWizardStep(2)
      }
    } catch (e) {
      toast(e.message || 'Failed to generate meal plan', 'error')
      setWizardStep(2)
    }
    setGenerating(false)
  }

  const handleDelete = async (planId) => {
    if (!confirm('Delete this meal plan?')) return
    try {
      await authFetch(`/api/nutrition/meal-plans/${planId}?username=${encodeURIComponent(selected)}`, { method: 'DELETE' }).then(r => r.json())
      setPlans(prev => prev.filter(p => p.id !== planId))
      toast('Plan deleted')
    } catch { toast('Failed to delete', 'error') }
  }

  const handleAssign = async (planId) => {
    try {
      await API.assignMealPlan(selected, planId)
      toast(`Plan assigned to ${selected}`)
      loadPlans(selected)
    } catch { toast('Failed to assign plan', 'error') }
  }

  const handleUnassign = async () => {
    try {
      await API.unassignMealPlan(selected)
      toast('Plan unassigned')
      loadPlans(selected)
    } catch { toast('Failed to unassign', 'error') }
  }

  const handleRename = async (planId) => {
    if (!renameValue.trim()) return
    try {
      await API.renameMealPlan(selected, planId, renameValue.trim())
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, name: renameValue.trim() } : p))
      setRenamingPlan(null)
      toast('Plan renamed')
    } catch { toast('Failed to rename', 'error') }
  }

  const selectedInfo = athletes.find(a => a.username === selected)
  const activePlanId = selectedInfo?.active_meal_plan?.id || null
  const allStoresDisplay = [...selectedStores, ...(customStore.trim() ? [customStore.trim()] : [])]

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select value={selected} onChange={e => loadPlans(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">Choose athlete...</option>
            {athletes.map(a => <option key={a.username} value={a.username}>{a.username}</option>)}
          </select>
          {selected && wizardStep === 0 && (
            <button className="btn btn-primary btn-sm" onClick={startWizard}>+ Create Meal Plan</button>
          )}
          {selected && wizardStep > 0 && (
            <button className="btn btn-sm" onClick={() => setWizardStep(0)} style={{ opacity: 0.7 }}>Cancel</button>
          )}
        </div>
      </div>

      {!selected ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📅</div>
          <div style={{ color: 'var(--text-dim)' }}>Select an athlete to view and generate meal plans</div>
        </div>
      ) : (
        <>
          {/* Athlete context */}
          {selectedInfo && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div className="athlete-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
                {selected.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selected}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {selectedInfo.program || 'No program'}
                  {selectedInfo.has_targets ? ` · ${Math.round(selectedInfo.targets?.daily_calories || 0)} kcal target` : ' · No targets set'}
                </div>
              </div>
            </div>
          )}

          {/* ════ WIZARD STEP 1: Configuration ════ */}
          {wizardStep === 1 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 style={{ fontSize: 14 }}>Step 1: Plan Configuration</h3>
                <span className="badge" style={{ background: 'var(--surface3)', fontSize: 11 }}>for {selected}</span>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Plan name</label>
                <input value={planName} onChange={e => setPlanName(e.target.value)}
                  placeholder={`e.g. ${selected}'s Cut Plan, Bulk Week 1`}
                  style={{ maxWidth: 350 }} />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Number of days</label>
                <select value={numDays} onChange={e => setNumDays(parseInt(e.target.value))} style={{ maxWidth: 200 }}>
                  {[1,2,3,4,5,6,7,10,14].map(n => <option key={n} value={n}>{n} day{n>1?'s':''}</option>)}
                </select>
              </div>

              {/* Meal slots */}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Meals per day</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ALL_MEAL_TYPES.map(mt => (
                    <button key={mt} className={`btn btn-sm ${selectedMealTypes.includes(mt) ? 'btn-primary' : ''}`}
                      onClick={() => toggleMealType(mt)}
                      style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                        ...(!selectedMealTypes.includes(mt) ? { opacity: 0.5, background: 'var(--surface3)' } : {}) }}>
                      <span>{MEAL_ICONS[mt]}</span> {MEAL_LABELS_MAP[mt]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi-store selection */}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Shopping stores (select one or more for separate lists)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {STORE_LIST.map(s => (
                    <button key={s} className={`btn btn-sm ${selectedStores.includes(s) ? 'btn-primary' : ''}`}
                      onClick={() => toggleStore(s)}
                      style={{ fontSize: 11, padding: '5px 10px',
                        ...(!selectedStores.includes(s) ? { opacity: 0.5, background: 'var(--surface3)' } : {}) }}>
                      🛒 {s}
                    </button>
                  ))}
                </div>
                <input value={customStore} onChange={e => setCustomStore(e.target.value)}
                  placeholder="Other store (type name)" style={{ maxWidth: 250, fontSize: 12 }} />
                {allStoresDisplay.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>
                    Separate shopping lists will be generated for: {allStoresDisplay.join(', ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Extra preferences</label>
                  <input value={preferences} onChange={e => setPreferences(e.target.value)}
                    placeholder="e.g. Mediterranean, quick meals, batch cooking" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Extra restrictions</label>
                  <input value={restrictions} onChange={e => setRestrictions(e.target.value)}
                    placeholder="e.g. no shellfish, low sodium" />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setWizardStep(0)} style={{ opacity: 0.7 }}>Cancel</button>
                <button className="btn btn-primary" onClick={() => setWizardStep(2)} disabled={selectedMealTypes.length === 0}>
                  Next: Your Meals →
                </button>
              </div>
            </div>
          )}

          {/* ════ WIZARD STEP 2: Fixed Meals with Ingredients ════ */}
          {wizardStep === 2 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h3 style={{ fontSize: 14 }}>Step 2: Your Own Meals</h3>
                <span className="badge" style={{ background: 'var(--surface3)', fontSize: 11 }}>AI fills the rest</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
                Add meals with specific ingredients and weights. AI will fill remaining meal slots and adjust to hit daily targets.
                Skip this step to let AI plan everything.
              </p>

              {/* Fixed meals with ingredient builder */}
              {fixedMeals.map((fm, mIdx) => (
                <div key={mIdx} style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, marginBottom: 10, border: '1px solid var(--glass-border)' }}>
                  {/* Meal header row */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <select value={fm.day || ''} onChange={e => updateFixedMeal(mIdx, 'day', e.target.value || null)}
                      style={{ fontSize: 12, width: 100 }}>
                      <option value="">Every day</option>
                      {Array.from({ length: numDays }, (_, i) => <option key={i+1} value={i+1}>Day {i+1}</option>)}
                    </select>
                    <select value={fm.meal_type} onChange={e => updateFixedMeal(mIdx, 'meal_type', e.target.value)}
                      style={{ fontSize: 12, width: 130 }}>
                      {selectedMealTypes.map(mt => <option key={mt} value={mt}>{MEAL_ICONS[mt]} {MEAL_LABELS_MAP[mt]}</option>)}
                    </select>
                    <input value={fm.name} onChange={e => updateFixedMeal(mIdx, 'name', e.target.value)}
                      placeholder="Meal name (optional, auto-generated from ingredients)" style={{ fontSize: 12, flex: 1 }} />
                    <button onClick={() => removeFixedMeal(mIdx)}
                      style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                  </div>

                  {/* Ingredients list */}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontFamily: "'Space Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Ingredients
                  </div>
                  {fm.ingredients.map((ing, iIdx) => (
                    <div key={iIdx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <input value={ing.food_name} onChange={e => updateIngredient(mIdx, iIdx, 'food_name', e.target.value)}
                        placeholder="e.g. 0% Fage Greek yogurt, rolled oats, frozen blueberries"
                        style={{ flex: 1, fontSize: 12, padding: '7px 10px' }} />
                      <input type="number" value={ing.amount} onChange={e => updateIngredient(mIdx, iIdx, 'amount', e.target.value)}
                        placeholder="Qty" style={{ width: 70, fontSize: 12, padding: '7px 10px', textAlign: 'right' }} />
                      <select value={ing.unit} onChange={e => updateIngredient(mIdx, iIdx, 'unit', e.target.value)}
                        style={{ width: 65, fontSize: 12, padding: '7px 6px' }}>
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="oz">oz</option>
                        <option value="cups">cups</option>
                        <option value="tbsp">tbsp</option>
                        <option value="tsp">tsp</option>
                        <option value="pcs">pcs</option>
                        <option value="scoops">scoops</option>
                      </select>
                      {fm.ingredients.length > 1 && (
                        <button onClick={() => removeIngredient(mIdx, iIdx)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addIngredient(mIdx)}
                    style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 12, padding: '4px 0', fontWeight: 500 }}>
                    + Add ingredient
                  </button>
                </div>
              ))}

              <button className="btn btn-sm" onClick={addFixedMeal}
                style={{ marginBottom: 16, fontSize: 12, width: '100%', border: '1px dashed var(--text-muted)', background: 'transparent', color: 'var(--text-dim)', padding: '10px' }}>
                + Add a meal
              </button>

              {/* Summary */}
              <div style={{ padding: 12, background: 'var(--surface1)', borderRadius: 8, marginBottom: 16, fontSize: 12, border: '1px solid var(--glass-border)' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Plan summary</div>
                <div style={{ color: 'var(--text-dim)' }}>
                  {numDays} day{numDays>1?'s':''} · {selectedMealTypes.length} meals/day ({selectedMealTypes.map(mt => MEAL_LABELS_MAP[mt]).join(', ')})
                  {fixedMeals.filter(f => f.ingredients.some(i => i.food_name.trim())).length > 0 &&
                    ` · ${fixedMeals.filter(f => f.ingredients.some(i => i.food_name.trim())).length} your meal${fixedMeals.filter(f => f.ingredients.some(i => i.food_name.trim())).length > 1 ? 's' : ''}`}
                  {allStoresDisplay.length > 0 && ` · Shopping at: ${allStoresDisplay.join(', ')}`}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn btn-sm" onClick={() => setWizardStep(1)}>← Back</button>
                <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
                  Generate & Assign to {selected}
                </button>
              </div>
            </div>
          )}

          {/* ════ WIZARD STEP 3: Generating ════ */}
          {wizardStep === 3 && (
            <div className="card" style={{ textAlign: 'center', padding: 48, marginBottom: 20 }}>
              <div className="generation-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 16px' }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Generating meal plan for {selected}...</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                AI is creating {numDays * selectedMealTypes.length} meals hitting their macro targets.
                {allStoresDisplay.length > 0 && ` Separate shopping lists for ${allStoresDisplay.join(' & ')}.`}
                {' '}This may take up to 2 minutes.
              </div>
            </div>
          )}

          {/* ════ Plans list ════ */}
          {wizardStep === 0 && (
            loading ? (
              <div style={{ color: 'var(--text-dim)', padding: 32 }}>Loading...</div>
            ) : plans.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.3 }}>📅</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No meal plans yet for {selected}.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {plans.slice().reverse().map(plan => {
                  const isExpanded = expandedPlan === plan.id
                  const days = plan.days || []
                  const stores = plan.stores || (plan.store ? [plan.store] : [])

                  return (
                    <div key={plan.id} className="card" style={{ padding: 0, overflow: 'hidden', border: activePlanId === plan.id ? '1px solid rgba(45,212,191,0.4)' : undefined }}>
                      <div className="program-header" onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {renamingPlan === plan.id ? (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && handleRename(plan.id)}
                                  autoFocus style={{ fontSize: 14, fontWeight: 600, padding: '4px 8px', width: 220 }} />
                                <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '4px 10px' }}
                                  onClick={() => handleRename(plan.id)}>Save</button>
                                <button className="btn btn-sm" style={{ fontSize: 11, padding: '4px 8px', opacity: 0.6 }}
                                  onClick={() => setRenamingPlan(null)}>Cancel</button>
                              </div>
                            ) : (
                              <h3 style={{ fontSize: 15, cursor: 'text' }}
                                onDoubleClick={e => { e.stopPropagation(); setRenamingPlan(plan.id); setRenameValue(plan.name || `${days.length}-Day Plan`) }}>
                                {plan.name || `${days.length}-Day Meal Plan`}
                              </h3>
                            )}
                            {activePlanId === plan.id && <span className="badge" style={{ fontSize: 10, background: 'rgba(45,212,191,0.15)', color: 'var(--teal)', border: '1px solid rgba(45,212,191,0.3)' }}>Active</span>}
                            <span className="badge" style={{ fontSize: 10, background: 'var(--surface3)' }}>{days.length} days</span>
                            {stores.map(s => <span key={s} className="badge" style={{ fontSize: 10, background: 'var(--surface3)' }}>🛒 {s}</span>)}
                          </div>
                          <div className="meta">
                            {new Date(plan.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {plan.created_by && ` by ${plan.created_by}`}
                            {plan.fixed_meals?.length > 0 && ` · ${plan.fixed_meals.length} your meal${plan.fixed_meals.length > 1 ? 's' : ''}`}
                          </div>
                        </div>
                        <div className="drill-toggle">{isExpanded ? '−' : '+'}</div>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '0 20px 20px' }}>
                          {days.map((day, di) => {
                            const dayKey = `${plan.id}-${di}`
                            const dayExpanded = expandedDay === dayKey
                            const dt = day.day_totals || {}

                            return (
                              <div key={di} className="drill-day" style={{ marginBottom: 6 }}>
                                <div className="drill-day-header" onClick={() => setExpandedDay(dayExpanded ? null : dayKey)}>
                                  <div className="drill-toggle drill-toggle-sm">{dayExpanded ? '−' : '+'}</div>
                                  <div className="drill-day-title">
                                    <span>Day {day.day || di + 1}</span>
                                    <span className="drill-day-summary">
                                      {Math.round(dt.calories || 0)} kcal · P: {Math.round(dt.protein_g || 0)}g · C: {Math.round(dt.carbs_g || 0)}g · F: {Math.round(dt.fat_g || 0)}g
                                    </span>
                                  </div>
                                </div>

                                {dayExpanded && (
                                  <div className="drill-day-body">
                                    {(day.meals || []).map((meal, mi) => {
                                      const isFixed = plan.fixed_meals?.some(fm =>
                                        fm.meal_type === meal.meal_type && (!fm.day || fm.day === (day.day || di + 1))
                                        && (fm.name === meal.name || fm.ingredients?.some(fi => meal.ingredients?.some(mi2 => mi2.food_name?.includes(fi.food_name))))
                                      )
                                      return (
                                        <div key={mi} style={{ marginBottom: mi < (day.meals || []).length - 1 ? 14 : 0 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 16 }}>{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
                                            <span className="badge badge-coach" style={{ textTransform: 'capitalize' }}>{MEAL_LABELS_MAP[meal.meal_type] || meal.meal_type}</span>
                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{meal.name}</span>
                                            {isFixed && <span className="badge" style={{ fontSize: 9, background: 'var(--teal)', color: '#000' }}>Your meal</span>}
                                          </div>
                                          {meal.meal_macros && (
                                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 28, marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>
                                              {Math.round(meal.meal_macros.calories || 0)} kcal · P: {Math.round(meal.meal_macros.protein_g || 0)}g · C: {Math.round(meal.meal_macros.carbs_g || 0)}g · F: {Math.round(meal.meal_macros.fat_g || 0)}g
                                              {meal.prep_time_min && ` · ${meal.prep_time_min} min`}
                                            </div>
                                          )}
                                          {meal.ingredients && (
                                            <div style={{ marginLeft: 28, marginBottom: 4 }}>
                                              {meal.ingredients.map((ing, ii) => (
                                                <span key={ii} style={{ display: 'inline-block', padding: '2px 8px', marginRight: 4, marginBottom: 4, background: 'var(--surface3)', borderRadius: 6, fontSize: 11, color: 'var(--text-dim)' }}>
                                                  {ing.food_name} {ing.serving_size && `(${ing.serving_size})`}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {meal.instructions && (
                                            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 28, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{meal.instructions}</div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}

                          {/* Shopping lists — one per store */}
                          {(plan.shopping_lists || (plan.shopping_list ? [{ store: plan.store || 'Shopping List', items: plan.shopping_list }] : [])).map((sl, si) => {
                            const items = sl.items || []
                            // Calculate total cost from price strings (extract numbers)
                            const totalCost = items.reduce((sum, item) => {
                              if (!item.price) return sum
                              const match = item.price.replace(/[^\d.,]/g, '').replace(',', '.')
                              const num = parseFloat(match)
                              return sum + (isNaN(num) ? 0 : num)
                            }, 0)
                            const currencySymbol = items.find(i => i.price)?.price?.match(/[£$€R]/)?.[0] || '£'

                            return (
                              <div key={si} className="card" style={{ marginTop: 12, padding: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                                    </svg>
                                    {sl.store || 'Shopping List'}
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({items.length} items)</span>
                                  </div>
                                  {totalCost > 0 && (
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', fontFamily: "'Space Mono', monospace" }}>
                                      Total: {currencySymbol}{totalCost.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                  {items.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <span>{item.item}</span>
                                      <span style={{ color: 'var(--text-dim)', fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                                        {item.quantity}
                                        {item.price && <span style={{ color: 'var(--teal)', marginLeft: 6 }}>{item.price}</span>}
                                        {item.category && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({item.category})</span>}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}

                          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {activePlanId === plan.id ? (
                                <button className="btn btn-sm" onClick={() => handleUnassign()}
                                  style={{ fontSize: 12, border: '1px solid rgba(45,212,191,0.3)', color: 'var(--teal)' }}>
                                  Unassign from {selected}
                                </button>
                              ) : (
                                <button className="btn btn-primary btn-sm" onClick={() => handleAssign(plan.id)}
                                  style={{ fontSize: 12 }}>
                                  Assign to {selected}
                                </button>
                              )}
                              <button className="btn btn-sm" onClick={() => { setRenamingPlan(plan.id); setRenameValue(plan.name || `${days.length}-Day Plan`) }}
                                style={{ fontSize: 12, opacity: 0.7 }}>
                                Rename
                              </button>
                            </div>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(plan.id)}>Delete Plan</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </>
      )}
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
