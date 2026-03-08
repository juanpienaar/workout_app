import React, { useState, useEffect } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'

export default function Exercises() {
  const toast = useToast()
  const [data, setData] = useState({})
  const [search, setSearch] = useState('')
  const [openGroups, setOpenGroups] = useState(new Set())
  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState({ group: '', name: '', equipment: '' })

  const load = async () => {
    try { setData(await API.getExercises()) } catch { toast('Failed to load', 'error') }
  }
  useEffect(() => { load() }, [])

  const groups = Object.keys(data)
  const totalExercises = groups.reduce((sum, g) => {
    const equipTypes = data[g]
    for (const exList of Object.values(equipTypes)) sum += exList.length
    return sum
  }, 0)

  function toggleGroup(g) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  async function remove(group, name) {
    if (!confirm(`Delete "${name}" from ${group}?`)) return
    try { await API.deleteExercise(group, name); toast('Deleted'); load() }
    catch { toast('Failed', 'error') }
  }

  async function add() {
    if (!form.name) { toast('Name required', 'error'); return }
    try {
      await API.addExercise(form.group || groups[0], { name: form.name, equipment: form.equipment })
      toast('Added'); setAddModal(false); load()
    } catch { toast('Failed', 'error') }
  }

  // Auto-open groups when searching
  useEffect(() => {
    if (search) setOpenGroups(new Set(groups))
  }, [search])

  return (
    <div>
      <div className="page-title"><span className="icon">🏋️</span> Exercise Library</div>

      {/* Context banner */}
      <div className="info-banner">
        <div className="info-banner-icon">ℹ️</div>
        <div>
          <div className="info-banner-title">Used by the AI Program Builder</div>
          <div className="info-banner-text">
            This library ({totalExercises} exercises across {groups.length} muscle groups) is sent to Claude when generating programs.
            Adding exercises here makes them available for AI-generated programs. Removing them means
            Claude will be less likely to include them.
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input type="search" className="search-input" placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({ group: groups[0] || '', name: '', equipment: '' }); setAddModal(true) }}>+ Add Exercise</button>
      </div>

      {groups.map(group => {
        const equipTypes = data[group]
        let count = 0
        const matchSections = []
        for (const [equip, exList] of Object.entries(equipTypes)) {
          const filtered = search ? exList.filter(e => e.name.toLowerCase().includes(search.toLowerCase())) : exList
          if (!filtered.length) continue
          count += filtered.length
          matchSections.push({ equip, exercises: filtered })
        }
        if (search && count === 0) return null

        return (
          <div key={group} className="muscle-group">
            <div className="muscle-group-header" onClick={() => toggleGroup(group)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="drill-toggle drill-toggle-sm">{openGroups.has(group) ? '−' : '+'}</span>
                <span>{group}</span>
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{count} exercises</span>
            </div>
            {openGroups.has(group) && (
              <div className="muscle-group-body" style={{ display: 'block' }}>
                {matchSections.map(({ equip, exercises }) => (
                  <div key={equip} style={{ marginBottom: 10 }}>
                    <div className="equip-label">{equip}</div>
                    {exercises.map(ex => (
                      <div key={ex.name} className="exercise-item">
                        <span>{ex.name}</span>
                        <button className="btn-icon" style={{ fontSize: 14 }} onClick={() => remove(group, ex.name)}>🗑️</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {addModal && (
        <Modal title="Add Exercise" onClose={() => setAddModal(false)} actions={[
          { label: 'Cancel', cls: 'btn-secondary', onClick: () => setAddModal(false) },
          { label: 'Add', cls: 'btn-primary', onClick: add },
        ]}>
          <div className="form-group">
            <label>Muscle Group</label>
            <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Exercise Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Incline Cable Fly" />
          </div>
          <div className="form-group">
            <label>Equipment</label>
            <input type="text" value={form.equipment} onChange={e => setForm({ ...form, equipment: e.target.value })} placeholder="e.g. Cable, Dumbbell" />
          </div>
        </Modal>
      )}
    </div>
  )
}
