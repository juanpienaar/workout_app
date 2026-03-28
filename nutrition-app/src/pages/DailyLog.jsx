import React, { useState, useEffect, useRef, useCallback } from 'react'
import { API } from '../api'
import toast from 'react-hot-toast'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', other: 'Other' }

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function dateStr(d) {
  return d.toISOString().split('T')[0]
}

export default function DailyLog() {
  const [date, setDate] = useState(new Date())
  const [log, setLog] = useState({ entries: [], totals: {} })
  const [targets, setTargets] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const loadDay = useCallback(async (d) => {
    setLoading(true)
    try {
      const [logRes, targetRes] = await Promise.all([
        API.getDailyLog(dateStr(d)),
        API.getTargets(),
      ])
      setLog(logRes.log || { entries: [], totals: {} })
      setTargets(targetRes.targets)
    } catch (err) {
      if (err.message !== 'auth_expired') toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDay(date) }, [date, loadDay])

  const shiftDate = (days) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(d)
  }

  const isToday = dateStr(date) === dateStr(new Date())

  const handleAddEntry = async (entry) => {
    try {
      const res = await API.addFoodEntry(dateStr(date), entry)
      if (res.ok) {
        setLog(prev => ({
          entries: [...prev.entries, res.entry],
          totals: res.totals,
        }))
        setShowAdd(false)
        toast.success('Added!')
      }
    } catch (err) {
      toast.error('Failed to add food')
    }
  }

  const handleDelete = async (entryId) => {
    try {
      const res = await API.deleteFoodEntry(dateStr(date), entryId)
      if (res.ok) {
        setLog(prev => ({
          entries: prev.entries.filter(e => e.id !== entryId),
          totals: res.totals,
        }))
        toast.success('Removed')
      }
    } catch { toast.error('Failed to delete') }
  }

  const totals = log.totals || {}

  // Group entries by meal type
  const grouped = {}
  for (const e of log.entries || []) {
    const meal = e.meal_type || 'other'
    if (!grouped[meal]) grouped[meal] = []
    grouped[meal].push(e)
  }

  return (
    <>
      {/* Date navigation */}
      <div className="date-bar">
        <button onClick={() => shiftDate(-1)}>&larr;</button>
        <span className="date-text">{isToday ? 'Today' : formatDate(date)}</span>
        <button onClick={() => shiftDate(1)}>&rarr;</button>
      </div>

      {loading ? <div className="spinner" /> : (
        <>
          {/* Macro summary */}
          <MacroSummary totals={totals} targets={targets} />

          {/* Food entries by meal */}
          {(log.entries || []).length === 0 ? (
            <div className="empty-state">
              <div className="emoji">🍽️</div>
              <p>No food logged yet.<br />Tap + to add your first meal!</p>
            </div>
          ) : (
            [...MEAL_TYPES, 'other'].map(meal => {
              const entries = grouped[meal]
              if (!entries || entries.length === 0) return null
              return (
                <div key={meal} style={{ marginBottom: 16 }}>
                  <div className="flex items-center gap-8 mb-8">
                    <span className="meal-badge">{MEAL_LABELS[meal] || meal}</span>
                    <span className="text-xs text-dim">
                      {Math.round(entries.reduce((s, e) => s + (e.calories || 0), 0))} kcal
                    </span>
                  </div>
                  {entries.map(entry => (
                    <FoodEntryCard key={entry.id} entry={entry} onDelete={() => handleDelete(entry.id)} />
                  ))}
                </div>
              )
            })
          )}
        </>
      )}

      {/* FAB */}
      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add food">+</button>

      {/* Add food modal */}
      {showAdd && (
        <AddFoodModal
          onAdd={handleAddEntry}
          onClose={() => setShowAdd(false)}
        />
      )}
    </>
  )
}

/* ── Macro Summary ── */
function MacroSummary({ totals, targets }) {
  const cal = totals.calories || 0
  const pro = totals.protein_g || 0
  const carb = totals.carbs_g || 0
  const fat = totals.fat_g || 0

  const tCal = targets?.daily_calories || 0
  const tPro = targets?.daily_protein_g || 0
  const tCarb = targets?.daily_carbs_g || 0
  const tFat = targets?.daily_fat_g || 0

  const pct = (val, target) => target > 0 ? Math.min((val / target) * 100, 100) : 0

  return (
    <div className="card">
      <div className="macro-grid">
        <div className="macro-cell cal">
          <div className="num">{Math.round(cal)}</div>
          <div className="label">{tCal ? `/ ${Math.round(tCal)}` : ''} kcal</div>
        </div>
        <div className="macro-cell protein">
          <div className="num">{Math.round(pro)}g</div>
          <div className="label">{tPro ? `/ ${Math.round(tPro)}g` : ''} protein</div>
        </div>
        <div className="macro-cell carbs">
          <div className="num">{Math.round(carb)}g</div>
          <div className="label">{tCarb ? `/ ${Math.round(tCarb)}g` : ''} carbs</div>
        </div>
        <div className="macro-cell fat">
          <div className="num">{Math.round(fat)}g</div>
          <div className="label">{tFat ? `/ ${Math.round(tFat)}g` : ''} fat</div>
        </div>
      </div>

      {targets && (
        <div style={{ marginTop: 8 }}>
          <MacroBar label="Calories" value={cal} target={tCal} cls="cal" />
          <MacroBar label="Protein" value={pro} target={tPro} cls="protein" />
          <MacroBar label="Carbs" value={carb} target={tCarb} cls="carbs" />
          <MacroBar label="Fat" value={fat} target={tFat} cls="fat" />
        </div>
      )}
    </div>
  )
}

function MacroBar({ label, value, target, cls }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 150) : 0
  const displayPct = Math.min(pct, 100)
  return (
    <div style={{ marginBottom: 6 }}>
      <div className="macro-label">
        <span>{label}</span>
        <span className="value">{Math.round(value)} / {Math.round(target)}</span>
      </div>
      <div className="macro-bar">
        <div className={`macro-bar-fill ${cls}`} style={{ width: `${displayPct}%` }} />
      </div>
    </div>
  )
}

/* ── Food Entry Card ── */
function FoodEntryCard({ entry, onDelete }) {
  return (
    <div className="food-entry">
      <div className="food-info">
        <div className="food-name">{entry.food_name}</div>
        <div className="food-macros">
          {entry.serving_size && <span>{entry.serving_size} · </span>}
          P: {Math.round(entry.protein_g || 0)}g · C: {Math.round(entry.carbs_g || 0)}g · F: {Math.round(entry.fat_g || 0)}g
        </div>
      </div>
      <div className="food-cals">{Math.round(entry.calories || 0)}</div>
      <button className="btn-ghost" onClick={onDelete} title="Remove"
        style={{ color: 'var(--red)', fontSize: 18, padding: 4 }}>×</button>
    </div>
  )
}

/* ── Add Food Modal ── */
function AddFoodModal({ onAdd, onClose }) {
  const [tab, setTab] = useState('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [mealType, setMealType] = useState('lunch')
  const [servingMultiplier, setServingMultiplier] = useState(1)
  const searchTimeout = useRef(null)
  const photoRef = useRef(null)

  // Manual entry state
  const [manual, setManual] = useState({
    food_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', serving_size: '',
  })

  const doSearch = async (q) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await API.searchFood(q)
      setResults(res.results || [])
    } catch { /* ignore */ }
    setSearching(false)
  }

  const handleQueryChange = (val) => {
    setQuery(val)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => doSearch(val), 400)
  }

  const handleTextRecognize = async () => {
    if (query.length < 3) return
    setSearching(true)
    try {
      const res = await API.recognizeText(query)
      setResults(res.results || [])
    } catch { toast.error('Recognition failed') }
    setSearching(false)
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSearching(true)
    setTab('search')
    try {
      const res = await API.recognizePhoto(file)
      setResults(res.results || [])
      if (res.results?.length) toast.success(`Found ${res.results.length} item(s)`)
    } catch { toast.error('Photo recognition failed') }
    setSearching(false)
  }

  const selectFood = (food) => {
    setSelected(food)
    setServingMultiplier(1)
  }

  const confirmAdd = () => {
    if (tab === 'manual') {
      if (!manual.food_name) { toast.error('Enter a food name'); return }
      onAdd({
        food_name: manual.food_name,
        serving_size: manual.serving_size || 'serving',
        calories: parseFloat(manual.calories) || 0,
        protein_g: parseFloat(manual.protein_g) || 0,
        carbs_g: parseFloat(manual.carbs_g) || 0,
        fat_g: parseFloat(manual.fat_g) || 0,
        meal_type: mealType,
        source: 'manual',
      })
      return
    }

    if (!selected) { toast.error('Select a food first'); return }
    onAdd({
      food_name: selected.food_name,
      serving_size: selected.serving_size,
      serving_grams: (selected.serving_grams || 100) * servingMultiplier,
      calories: (selected.calories || 0) * servingMultiplier,
      protein_g: (selected.protein_g || 0) * servingMultiplier,
      carbs_g: (selected.carbs_g || 0) * servingMultiplier,
      fat_g: (selected.fat_g || 0) * servingMultiplier,
      fiber_g: (selected.fiber_g || 0) * servingMultiplier,
      meal_type: mealType,
      source: selected.source || 'manual',
      source_id: selected.source_id || '',
    })
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Add Food</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Meal type selector */}
        <div className="tabs" style={{ marginBottom: 12 }}>
          {MEAL_TYPES.map(m => (
            <button key={m} className={`tab ${mealType === m ? 'active' : ''}`}
              onClick={() => setMealType(m)}>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Input method tabs */}
        <div className="tabs">
          <button className={`tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>Search</button>
          <button className={`tab ${tab === 'describe' ? 'active' : ''}`} onClick={() => setTab('describe')}>Describe</button>
          <button className={`tab ${tab === 'photo' ? 'active' : ''}`} onClick={() => setTab('photo')}>Photo</button>
          <button className={`tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>Manual</button>
        </div>

        {tab === 'search' && (
          <div style={{ marginTop: 12 }}>
            <div className="search-box">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="search" placeholder="Search foods (e.g. chicken breast, banana)"
                value={query} onChange={e => handleQueryChange(e.target.value)} autoFocus />
            </div>
            {searching && <div className="spinner" style={{ padding: 16 }} />}
            {!searching && results.length > 0 && !selected && (
              <div style={{ marginTop: 8 }}>
                {results.map((r, i) => (
                  <div key={i} className="search-result" onClick={() => selectFood(r)}>
                    <div className="sr-name">{r.food_name}</div>
                    <div className="sr-meta">
                      {Math.round(r.calories)} kcal · P: {Math.round(r.protein_g)}g · C: {Math.round(r.carbs_g)}g · F: {Math.round(r.fat_g)}g
                      {r.source && <span style={{ opacity: 0.5 }}> · {r.source}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'describe' && (
          <div style={{ marginTop: 12 }}>
            <textarea placeholder="Describe what you ate, e.g. 'Two eggs with toast and peanut butter'"
              value={query} onChange={e => setQuery(e.target.value)}
              rows={3} style={{ width: '100%', resize: 'vertical' }} />
            <button className="btn btn-secondary btn-full mt-8" onClick={handleTextRecognize}
              disabled={searching || query.length < 3}>
              {searching ? 'Analyzing...' : 'Recognize Food'}
            </button>
            {results.length > 0 && !selected && (
              <div style={{ marginTop: 8 }}>
                {results.map((r, i) => (
                  <div key={i} className="search-result" onClick={() => selectFood(r)}>
                    <div className="sr-name">{r.food_name}</div>
                    <div className="sr-meta">
                      {Math.round(r.calories)} kcal · P: {Math.round(r.protein_g)}g · C: {Math.round(r.carbs_g)}g · F: {Math.round(r.fat_g)}g
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'photo' && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <input type="file" accept="image/*" capture="environment" ref={photoRef}
              style={{ display: 'none' }} onChange={handlePhotoUpload} />
            <button className="btn btn-secondary btn-full" onClick={() => photoRef.current?.click()}>
              {searching ? 'Analyzing photo...' : '📷 Take Photo or Upload'}
            </button>
            <p className="text-xs text-dim mt-8">
              Take a photo of your meal and AI will estimate the macros
            </p>
            {results.length > 0 && !selected && (
              <div style={{ marginTop: 8, textAlign: 'left' }}>
                {results.map((r, i) => (
                  <div key={i} className="search-result" onClick={() => selectFood(r)}>
                    <div className="sr-name">{r.food_name}</div>
                    <div className="sr-meta">
                      {Math.round(r.calories)} kcal · P: {Math.round(r.protein_g)}g · C: {Math.round(r.carbs_g)}g · F: {Math.round(r.fat_g)}g
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'manual' && (
          <div style={{ marginTop: 12 }}>
            <div className="input-group">
              <label>Food name</label>
              <input value={manual.food_name} onChange={e => setManual(p => ({ ...p, food_name: e.target.value }))}
                placeholder="e.g. Grilled chicken" />
            </div>
            <div className="input-group">
              <label>Serving size</label>
              <input value={manual.serving_size} onChange={e => setManual(p => ({ ...p, serving_size: e.target.value }))}
                placeholder="e.g. 150g, 1 cup" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="input-group">
                <label>Calories</label>
                <input type="number" value={manual.calories} onChange={e => setManual(p => ({ ...p, calories: e.target.value }))} placeholder="0" />
              </div>
              <div className="input-group">
                <label>Protein (g)</label>
                <input type="number" value={manual.protein_g} onChange={e => setManual(p => ({ ...p, protein_g: e.target.value }))} placeholder="0" />
              </div>
              <div className="input-group">
                <label>Carbs (g)</label>
                <input type="number" value={manual.carbs_g} onChange={e => setManual(p => ({ ...p, carbs_g: e.target.value }))} placeholder="0" />
              </div>
              <div className="input-group">
                <label>Fat (g)</label>
                <input type="number" value={manual.fat_g} onChange={e => setManual(p => ({ ...p, fat_g: e.target.value }))} placeholder="0" />
              </div>
            </div>
          </div>
        )}

        {/* Selected food preview */}
        {selected && tab !== 'manual' && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="flex justify-between items-center mb-8">
              <div>
                <div className="fw-600">{selected.food_name}</div>
                <div className="text-xs text-dim">{selected.serving_size} per serving</div>
              </div>
              <button className="btn-ghost text-xs" onClick={() => setSelected(null)}>Change</button>
            </div>
            <div className="input-group">
              <label>Servings</label>
              <input type="number" value={servingMultiplier} min={0.25} step={0.25}
                onChange={e => setServingMultiplier(parseFloat(e.target.value) || 1)} />
            </div>
            <div className="text-sm" style={{ marginTop: 4 }}>
              <span style={{ color: 'var(--accent2)' }}>{Math.round((selected.calories || 0) * servingMultiplier)} kcal</span>
              {' · '}P: {Math.round((selected.protein_g || 0) * servingMultiplier)}g
              {' · '}C: {Math.round((selected.carbs_g || 0) * servingMultiplier)}g
              {' · '}F: {Math.round((selected.fat_g || 0) * servingMultiplier)}g
            </div>
          </div>
        )}

        {/* Confirm button */}
        <button className="btn btn-primary btn-full mt-16" onClick={confirmAdd}>
          Add to {MEAL_LABELS[mealType]}
        </button>
      </div>
    </div>
  )
}
