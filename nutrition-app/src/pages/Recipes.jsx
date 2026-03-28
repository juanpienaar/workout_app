import React, { useState, useEffect } from 'react'
import { API } from '../api'
import toast from 'react-hot-toast'

export default function Recipes() {
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSuggest, setShowSuggest] = useState(false)
  const [ingredients, setIngredients] = useState('')
  const [preferences, setPreferences] = useState('')
  const [generating, setGenerating] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    API.listRecipes().then(res => {
      setRecipes(res.recipes || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSuggest = async () => {
    const items = ingredients.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
    if (items.length === 0) { toast.error('Enter at least one ingredient'); return }
    setGenerating(true)
    try {
      const res = await API.suggestRecipes({ ingredients: items, preferences })
      setSuggestions(res.recipes || [])
      if (res.recipes?.length) toast.success(`Got ${res.recipes.length} suggestions!`)
    } catch (err) {
      toast.error('Failed to generate suggestions')
    }
    setGenerating(false)
  }

  const handleSave = async (recipe) => {
    try {
      const res = await API.saveRecipe({
        name: recipe.name,
        ingredients: (recipe.ingredients || []).map(i => ({
          food_name: i.food_name || i.name || '',
          serving_size: i.serving_size || i.amount || '',
          calories: i.calories || 0,
          protein_g: i.protein_g || 0,
          carbs_g: i.carbs_g || 0,
          fat_g: i.fat_g || 0,
        })),
        instructions: recipe.instructions || '',
        prep_time_min: recipe.prep_time_min || null,
        servings: recipe.servings || 1,
        tags: recipe.tags || [],
      })
      if (res.ok) {
        setRecipes(prev => [...prev, res.recipe])
        toast.success('Recipe saved!')
      }
    } catch { toast.error('Failed to save') }
  }

  const handleDelete = async (id) => {
    try {
      await API.deleteRecipe(id)
      setRecipes(prev => prev.filter(r => r.id !== id))
      toast.success('Deleted')
    } catch { toast.error('Failed to delete') }
  }

  if (loading) return <div className="spinner" />

  return (
    <>
      <div className="flex justify-between items-center mb-16">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>My Recipes</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowSuggest(!showSuggest)}>
          {showSuggest ? 'Close' : '✨ Suggest'}
        </button>
      </div>

      {/* AI suggestion panel */}
      {showSuggest && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="fw-600 mb-8" style={{ fontSize: 14 }}>Generate recipes from ingredients</div>
          <div className="input-group">
            <label>What ingredients do you have?</label>
            <textarea value={ingredients} onChange={e => setIngredients(e.target.value)}
              placeholder="chicken, rice, broccoli, garlic..." rows={3}
              style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div className="input-group">
            <label>Preferences (optional)</label>
            <input value={preferences} onChange={e => setPreferences(e.target.value)}
              placeholder="e.g. high protein, quick, low carb" />
          </div>
          <button className="btn btn-primary btn-full" onClick={handleSuggest} disabled={generating}>
            {generating ? 'Generating...' : 'Get Suggestions'}
          </button>

          {suggestions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {suggestions.map((recipe, i) => (
                <div key={i} className="card" style={{ background: 'var(--surface2)' }}>
                  <div className="flex justify-between items-center">
                    <div className="fw-600" style={{ fontSize: 14 }}>{recipe.name}</div>
                    <button className="btn btn-sm btn-primary" onClick={() => handleSave(recipe)}>Save</button>
                  </div>
                  {recipe.macro_totals && (
                    <div className="text-xs text-dim mt-8">
                      {Math.round(recipe.macro_totals.calories || 0)} kcal ·
                      P: {Math.round(recipe.macro_totals.protein_g || 0)}g ·
                      C: {Math.round(recipe.macro_totals.carbs_g || 0)}g ·
                      F: {Math.round(recipe.macro_totals.fat_g || 0)}g
                      {recipe.prep_time_min && ` · ${recipe.prep_time_min} min`}
                    </div>
                  )}
                  {recipe.instructions && (
                    <div className="text-sm mt-8" style={{ color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>
                      {recipe.instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saved recipes */}
      {recipes.length === 0 && !showSuggest ? (
        <div className="empty-state">
          <div className="emoji">📖</div>
          <p>No saved recipes yet.<br />Use "Suggest" to generate recipes from your ingredients!</p>
        </div>
      ) : (
        recipes.map(recipe => (
          <div key={recipe.id} className="card" style={{ cursor: 'pointer' }}
            onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)}>
            <div className="flex justify-between items-center">
              <div>
                <div className="fw-600" style={{ fontSize: 14 }}>{recipe.name}</div>
                {recipe.macro_totals && (
                  <div className="text-xs text-dim mt-8">
                    {Math.round(recipe.macro_totals.calories || 0)} kcal ·
                    P: {Math.round(recipe.macro_totals.protein_g || 0)}g ·
                    C: {Math.round(recipe.macro_totals.carbs_g || 0)}g ·
                    F: {Math.round(recipe.macro_totals.fat_g || 0)}g
                  </div>
                )}
              </div>
              <div className="flex gap-8">
                {recipe.tags?.map(t => <span key={t} className="meal-badge" style={{ fontSize: 9 }}>{t}</span>)}
              </div>
            </div>
            {expandedId === recipe.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--card-border)', paddingTop: 12 }}>
                {recipe.ingredients?.length > 0 && (
                  <div className="mb-8">
                    <div className="text-xs fw-600 text-dim mb-8">Ingredients</div>
                    {recipe.ingredients.map((ing, i) => (
                      <div key={i} className="text-sm" style={{ padding: '2px 0' }}>
                        {ing.food_name} — {ing.serving_size || ''}
                        {ing.calories ? ` (${Math.round(ing.calories)} kcal)` : ''}
                      </div>
                    ))}
                  </div>
                )}
                {recipe.instructions && (
                  <div className="mb-8">
                    <div className="text-xs fw-600 text-dim mb-8">Instructions</div>
                    <div className="text-sm" style={{ whiteSpace: 'pre-wrap', color: 'var(--text-dim)' }}>
                      {recipe.instructions}
                    </div>
                  </div>
                )}
                <button className="btn btn-ghost text-xs" style={{ color: 'var(--red)' }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id) }}>
                  Delete Recipe
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </>
  )
}
