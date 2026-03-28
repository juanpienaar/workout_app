import React, { useState, useEffect } from 'react'
import { authFetch } from '../api'
import toast from 'react-hot-toast'

const GOAL_OPTIONS = [
  { value: 'lose', label: 'Lose weight', emoji: '📉' },
  { value: 'maintain', label: 'Maintain', emoji: '⚖️' },
  { value: 'gain', label: 'Gain weight', emoji: '📈' },
]

const ACTIVITY_OPTIONS = [
  ['sedentary', 'Sedentary (desk job)'],
  ['light', 'Light (1-2x/week)'],
  ['moderate', 'Moderate (3-5x/week)'],
  ['active', 'Active (6-7x/week)'],
  ['very_active', 'Very active (2x/day)'],
]

const DIET_OPTIONS = [
  ['none', 'No restrictions'],
  ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['pescatarian', 'Pescatarian'],
  ['keto', 'Keto'],
  ['banting', 'Banting / Low-carb'],
  ['paleo', 'Paleo'],
  ['no_red_meat', 'No red meat'],
  ['halal', 'Halal'],
  ['kosher', 'Kosher'],
]

export default function Profile() {
  const [profile, setProfile] = useState({
    goal: 'maintain', current_weight_kg: '', target_weight_kg: '', target_weeks: '',
    height_cm: '', age: '', sex: 'male', activity_level: 'moderate',
    diet_type: 'none', allergies: '', additional_preferences: '',
  })
  const [calc, setCalc] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [metricsWeight, setMetricsWeight] = useState(null)

  useEffect(() => {
    authFetch('/api/nutrition/profile').then(r => r.json()).then(res => {
      const p = res.profile
      if (res.latest_metrics_weight) setMetricsWeight(res.latest_metrics_weight)
      if (p) {
        setProfile({
          goal: p.goal || 'maintain', current_weight_kg: p.current_weight_kg || '',
          target_weight_kg: p.target_weight_kg || '', target_weeks: p.target_weeks || '',
          height_cm: p.height_cm || '', age: p.age || '', sex: p.sex || 'male',
          activity_level: p.activity_level || 'moderate', diet_type: p.diet_type || 'none',
          allergies: p.allergies || '', additional_preferences: p.additional_preferences || '',
        })
      } else if (res.latest_metrics_weight) {
        // Pre-fill weight from metrics if no profile yet
        setProfile(prev => ({ ...prev, current_weight_kg: res.latest_metrics_weight }))
      }
      if (res.calculated) setCalc(res.calculated)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/nutrition/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          current_weight_kg: parseFloat(profile.current_weight_kg) || null,
          target_weight_kg: parseFloat(profile.target_weight_kg) || null,
          target_weeks: parseInt(profile.target_weeks) || null,
          height_cm: parseFloat(profile.height_cm) || null,
          age: parseInt(profile.age) || null,
        }),
      }).then(r => r.json())
      if (res.ok) {
        toast.success('Profile saved!')
        setCalc(res.calculated)
      } else {
        toast.error(res.detail || 'Failed to save')
      }
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  if (loading) return <div className="spinner" />

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>My Profile</h2>

      {/* Goal selector */}
      <div className="card">
        <div className="text-xs fw-600 text-dim mb-8">What's your goal?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {GOAL_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => setProfile(p => ({ ...p, goal: opt.value }))}
              style={{
                flex: 1, padding: '14px 8px', borderRadius: 10, cursor: 'pointer',
                border: profile.goal === opt.value ? '2px solid var(--accent)' : '1px solid var(--card-border)',
                background: profile.goal === opt.value ? 'var(--accent-dim)' : 'var(--surface)',
                color: profile.goal === opt.value ? 'var(--accent2)' : 'var(--text-dim)',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 600, textAlign: 'center',
              }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{opt.emoji}</div>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body stats */}
      <div className="card">
        <div className="text-xs fw-600 text-dim mb-8">Body stats</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="input-group">
            <label>Weight (kg)</label>
            <input type="number" value={profile.current_weight_kg}
              onChange={e => setProfile(p => ({ ...p, current_weight_kg: e.target.value }))}
              placeholder="e.g. 80" />
            {metricsWeight && parseFloat(profile.current_weight_kg) !== metricsWeight && (
              <div style={{ fontSize: 10, color: 'var(--accent2)', marginTop: 4, cursor: 'pointer' }}
                onClick={() => setProfile(p => ({ ...p, current_weight_kg: metricsWeight }))}>
                Use {metricsWeight}kg from weigh-ins
              </div>
            )}
          </div>
          <div className="input-group">
            <label>Height (cm)</label>
            <input type="number" value={profile.height_cm}
              onChange={e => setProfile(p => ({ ...p, height_cm: e.target.value }))}
              placeholder="e.g. 175" />
          </div>
          <div className="input-group">
            <label>Age</label>
            <input type="number" value={profile.age}
              onChange={e => setProfile(p => ({ ...p, age: e.target.value }))}
              placeholder="e.g. 30" />
          </div>
          <div className="input-group">
            <label>Sex</label>
            <select value={profile.sex} onChange={e => setProfile(p => ({ ...p, sex: e.target.value }))}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
      </div>

      {/* Weight target (only if not maintain) */}
      {profile.goal !== 'maintain' && (
        <div className="card">
          <div className="text-xs fw-600 text-dim mb-8">
            {profile.goal === 'lose' ? 'Weight loss target' : 'Weight gain target'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="input-group">
              <label>Target weight (kg)</label>
              <input type="number" value={profile.target_weight_kg}
                onChange={e => setProfile(p => ({ ...p, target_weight_kg: e.target.value }))}
                placeholder={profile.goal === 'lose' ? 'e.g. 70' : 'e.g. 90'} />
            </div>
            <div className="input-group">
              <label>Weeks to achieve</label>
              <input type="number" value={profile.target_weeks}
                onChange={e => setProfile(p => ({ ...p, target_weeks: e.target.value }))}
                placeholder="e.g. 12" />
            </div>
          </div>
        </div>
      )}

      {/* Activity level */}
      <div className="card">
        <div className="text-xs fw-600 text-dim mb-8">Activity level</div>
        <select value={profile.activity_level}
          onChange={e => setProfile(p => ({ ...p, activity_level: e.target.value }))}>
          {ACTIVITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Diet type */}
      <div className="card">
        <div className="text-xs fw-600 text-dim mb-8">Diet type</div>
        <select value={profile.diet_type}
          onChange={e => setProfile(p => ({ ...p, diet_type: e.target.value }))}>
          {DIET_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Allergies & preferences */}
      <div className="card">
        <div className="input-group">
          <label>Allergies</label>
          <input value={profile.allergies}
            onChange={e => setProfile(p => ({ ...p, allergies: e.target.value }))}
            placeholder="e.g. nuts, shellfish, dairy" />
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label>Other preferences</label>
          <input value={profile.additional_preferences}
            onChange={e => setProfile(p => ({ ...p, additional_preferences: e.target.value }))}
            placeholder="e.g. no spicy food, prefer quick meals" />
        </div>
      </div>

      {/* Save */}
      <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}
        style={{ marginBottom: 16 }}>
        {saving ? 'Saving...' : 'Save Profile'}
      </button>

      {/* Calculated results */}
      {calc && (
        <div className="card" style={{ background: 'var(--surface2)' }}>
          <div className="fw-600 mb-8" style={{ fontSize: 14 }}>Your Daily Recommendations</div>
          <div className="macro-grid">
            <div className="macro-cell cal">
              <div className="num">{calc.recommended_calories}</div>
              <div className="label">kcal target</div>
            </div>
            <div className="macro-cell protein">
              <div className="num">{calc.recommended_protein_g}g</div>
              <div className="label">protein</div>
            </div>
            <div className="macro-cell carbs">
              <div className="num">{calc.recommended_carbs_g}g</div>
              <div className="label">carbs</div>
            </div>
            <div className="macro-cell fat">
              <div className="num">{calc.recommended_fat_g}g</div>
              <div className="label">fat</div>
            </div>
          </div>
          <div className="text-xs text-dim mt-8" style={{ textAlign: 'center' }}>
            BMR: {calc.bmr} · TDEE: {calc.tdee} · Adjustment: {calc.daily_adjustment > 0 ? '+' : ''}{calc.daily_adjustment} kcal/day
          </div>
        </div>
      )}
    </>
  )
}
