import React, { useState, useEffect } from 'react'
import { API } from '../api'
import toast from 'react-hot-toast'

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

export default function MealPlans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [numDays, setNumDays] = useState(7)
  const [preferences, setPreferences] = useState('')
  const [restrictions, setRestrictions] = useState('')
  const [generating, setGenerating] = useState(false)
  const [expandedPlan, setExpandedPlan] = useState(null)
  const [expandedDay, setExpandedDay] = useState(null)

  useEffect(() => {
    API.listMealPlans().then(res => {
      setPlans(res.meal_plans || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await API.generateMealPlan({ num_days: numDays, preferences, restrictions })
      if (res.ok) {
        setPlans(prev => [...prev, res.meal_plan])
        setShowGenerate(false)
        setExpandedPlan(res.meal_plan.id)
        toast.success('Meal plan generated!')
      } else {
        toast.error(res.detail || 'Failed to generate')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to generate meal plan')
    }
    setGenerating(false)
  }

  const handleDelete = async (id) => {
    try {
      await API.deleteMealPlan(id)
      setPlans(prev => prev.filter(p => p.id !== id))
      toast.success('Deleted')
    } catch { toast.error('Failed to delete') }
  }

  if (loading) return <div className="spinner" />

  return (
    <>
      <div className="flex justify-between items-center mb-16">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Meal Plans</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowGenerate(!showGenerate)}>
          {showGenerate ? 'Cancel' : '✨ Generate'}
        </button>
      </div>

      {showGenerate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="fw-600 mb-8" style={{ fontSize: 14 }}>Generate a meal plan</div>
          <p className="text-xs text-dim mb-16">AI will create meals that hit your macro targets</p>
          <div className="input-group">
            <label>Number of days</label>
            <select value={numDays} onChange={e => setNumDays(parseInt(e.target.value))}>
              <option value={3}>3 days</option>
              <option value={5}>5 days</option>
              <option value={7}>7 days</option>
            </select>
          </div>
          <div className="input-group">
            <label>Preferences (optional)</label>
            <input value={preferences} onChange={e => setPreferences(e.target.value)}
              placeholder="e.g. Mediterranean, high protein, quick meals" />
          </div>
          <div className="input-group">
            <label>Dietary restrictions (optional)</label>
            <input value={restrictions} onChange={e => setRestrictions(e.target.value)}
              placeholder="e.g. gluten-free, no dairy, vegetarian" />
          </div>
          <button className="btn btn-primary btn-full" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating (this may take a moment)...' : 'Generate Plan'}
          </button>
        </div>
      )}

      {plans.length === 0 && !showGenerate ? (
        <div className="empty-state">
          <div className="emoji">📅</div>
          <p>No meal plans yet.<br />Generate one based on your macro targets!</p>
        </div>
      ) : (
        plans.slice().reverse().map(plan => {
          const isExpanded = expandedPlan === plan.id
          const days = plan.days || []

          return (
            <div key={plan.id} className="card">
              <div className="flex justify-between items-center"
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}>
                <div>
                  <div className="fw-600" style={{ fontSize: 14 }}>
                    {days.length}-Day Plan
                  </div>
                  <div className="text-xs text-dim mt-8">
                    Created {new Date(plan.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{ fontSize: 18 }}>{isExpanded ? '▾' : '▸'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 12 }}>
                  {days.map((day, di) => {
                    const dayKey = `${plan.id}-${di}`
                    const dayExpanded = expandedDay === dayKey
                    return (
                      <div key={di} style={{ borderTop: '1px solid var(--card-border)', paddingTop: 10, marginTop: 10 }}>
                        <div className="flex justify-between items-center"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedDay(dayExpanded ? null : dayKey)}>
                          <span className="fw-600 text-sm">Day {day.day || di + 1}</span>
                          {day.day_totals && (
                            <span className="text-xs text-dim">
                              {Math.round(day.day_totals.calories || 0)} kcal ·
                              P: {Math.round(day.day_totals.protein_g || 0)}g
                            </span>
                          )}
                        </div>

                        {dayExpanded && (day.meals || []).map((meal, mi) => (
                          <div key={mi} style={{ marginTop: 10, marginLeft: 12 }}>
                            <div className="flex items-center gap-8">
                              <span className="meal-badge">{MEAL_LABELS[meal.meal_type] || meal.meal_type}</span>
                              <span className="text-sm fw-600">{meal.name}</span>
                            </div>
                            {meal.meal_macros && (
                              <div className="text-xs text-dim" style={{ marginTop: 4, marginLeft: 4 }}>
                                {Math.round(meal.meal_macros.calories || 0)} kcal ·
                                P: {Math.round(meal.meal_macros.protein_g || 0)}g ·
                                C: {Math.round(meal.meal_macros.carbs_g || 0)}g ·
                                F: {Math.round(meal.meal_macros.fat_g || 0)}g
                                {meal.prep_time_min && ` · ${meal.prep_time_min} min`}
                              </div>
                            )}
                            {meal.instructions && (
                              <div className="text-xs" style={{ marginTop: 6, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>
                                {meal.instructions}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}

                  {/* Shopping list */}
                  {plan.shopping_list?.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: 12, marginTop: 12 }}>
                      <div className="fw-600 text-sm mb-8">Shopping List</div>
                      {plan.shopping_list.map((item, i) => (
                        <div key={i} className="text-sm" style={{ padding: '2px 0' }}>
                          {item.item} — {item.quantity}
                          {item.category && <span className="text-xs text-dim"> ({item.category})</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <button className="btn btn-ghost text-xs mt-16" style={{ color: 'var(--red)' }}
                    onClick={() => handleDelete(plan.id)}>
                    Delete Plan
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )
}
