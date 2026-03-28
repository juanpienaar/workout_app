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
function TargetsTab() {
  const [athletes, setAthletes] = useState([])
  const [selected, setSelected] = useState('')
  const [current, setCurrent] = useState(null)
  const [form, setForm] = useState({ daily_calories: '', daily_protein_g: '', daily_carbs_g: '', daily_fat_g: '', daily_fiber_g: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    authFetch('/api/nutrition/coach/overview').then(r => r.json()).then(d => {
      setAthletes(d.athletes || [])
    })
  }, [])

  const loadTargets = async (username) => {
    setSelected(username)
    setMessage('')
    try {
      const res = await authFetch(`/api/nutrition/targets?username=${encodeURIComponent(username)}`).then(r => r.json())
      const t = res.targets
      setCurrent(t)
      if (t) {
        setForm({
          daily_calories: t.daily_calories || '',
          daily_protein_g: t.daily_protein_g || '',
          daily_carbs_g: t.daily_carbs_g || '',
          daily_fat_g: t.daily_fat_g || '',
          daily_fiber_g: t.daily_fiber_g || '',
          notes: t.notes || '',
        })
      } else {
        setForm({ daily_calories: '', daily_protein_g: '', daily_carbs_g: '', daily_fat_g: '', daily_fiber_g: '', notes: '' })
      }
    } catch { /* ignore */ }
  }

  const applyPreset = (preset) => {
    // Common macro splits based on an estimated 2000 cal baseline
    const presets = {
      cutting: { daily_calories: 1800, daily_protein_g: 180, daily_carbs_g: 150, daily_fat_g: 60, notes: 'Cutting phase' },
      maintenance: { daily_calories: 2200, daily_protein_g: 160, daily_carbs_g: 220, daily_fat_g: 75, notes: 'Maintenance phase' },
      bulking: { daily_calories: 2800, daily_protein_g: 200, daily_carbs_g: 300, daily_fat_g: 90, notes: 'Bulking phase' },
    }
    setForm(p => ({ ...p, ...presets[preset], daily_fiber_g: p.daily_fiber_g }))
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setMessage('')
    try {
      const res = await authFetch('/api/nutrition/targets', {
        method: 'POST',
        body: JSON.stringify({
          username: selected,
          targets: {
            daily_calories: parseFloat(form.daily_calories) || 0,
            daily_protein_g: parseFloat(form.daily_protein_g) || 0,
            daily_carbs_g: parseFloat(form.daily_carbs_g) || 0,
            daily_fat_g: parseFloat(form.daily_fat_g) || 0,
            daily_fiber_g: form.daily_fiber_g ? parseFloat(form.daily_fiber_g) : null,
            notes: form.notes,
          },
        }),
      }).then(r => r.json())
      if (res.ok) {
        setMessage('Targets saved!')
        setCurrent(res.targets)
      } else {
        setMessage('Error: ' + (res.detail || 'failed'))
      }
    } catch (e) {
      setMessage('Error: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 4 }}>
          Select athlete
        </label>
        <select value={selected} onChange={e => loadTargets(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }}>
          <option value="">Choose athlete...</option>
          {athletes.map(a => <option key={a.username} value={a.username}>{a.username}</option>)}
        </select>
      </div>

      {selected && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['cutting', 'maintenance', 'bulking'].map(p => (
              <button key={p} onClick={() => applyPreset(p)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--glass-border)',
                  background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 500, textTransform: 'capitalize',
                }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['daily_calories', 'Calories (kcal)'],
              ['daily_protein_g', 'Protein (g)'],
              ['daily_carbs_g', 'Carbs (g)'],
              ['daily_fat_g', 'Fat (g)'],
              ['daily_fiber_g', 'Fiber (g, optional)'],
            ].map(([key, label]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</label>
                <input type="number" value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 4 }}>Notes</label>
            <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="e.g. Cutting phase, increase protein"
              style={{ width: '100%', padding: '10px 12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }} />
          </div>

          <button onClick={handleSave} disabled={saving}
            style={{
              marginTop: 16, padding: '10px 24px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #7c6ef0, #9333ea)', color: 'white',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
            }}>
            {saving ? 'Saving...' : 'Save Targets'}
          </button>

          {message && (
            <div style={{ marginTop: 12, fontSize: 13, color: message.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
              {message}
            </div>
          )}

          {current && (
            <div style={{ marginTop: 20, padding: 14, background: 'var(--surface)', borderRadius: 10, fontSize: 12, color: 'var(--text-dim)' }}>
              Current targets set by {current.set_by} on {new Date(current.set_at).toLocaleDateString()}
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
