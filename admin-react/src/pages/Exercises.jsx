import React, { useState, useEffect } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import { Icon } from '../components/Icons'
import HelpTip from '../components/HelpTip'

export default function Exercises() {
  const toast = useToast()
  const [data, setData] = useState({})
  const [search, setSearch] = useState('')
  const [openGroups, setOpenGroups] = useState(new Set())
  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState({ group: '', name: '', equipment: '' })
  const [moveModal, setMoveModal] = useState(null) // {name, fromGroup, equipment}

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

  async function moveExercise(name, fromGroup, equipment, toGroup) {
    if (toGroup === fromGroup) { setMoveModal(null); return }
    try {
      // Add to new group, then delete from old
      await API.addExercise(toGroup, { name, equipment })
      await API.deleteExercise(fromGroup, name)
      toast(`Moved "${name}" to ${toGroup}`)
      setMoveModal(null)
      load()
    } catch { toast('Move failed', 'error') }
  }

  // Auto-open groups when searching
  useEffect(() => {
    if (search) setOpenGroups(new Set(groups))
  }, [search])

  // Sort groups so Custom appears last
  const sortedGroups = [...groups].sort((a, b) => {
    if (a === 'Custom') return 1
    if (b === 'Custom') return -1
    return a.localeCompare(b)
  })

  return (
    <div>
      <div className="page-title"><Icon name="exercises" size={22} style={{ color: 'var(--accent2)' }} /> Exercise Library</div>

      {/* Context banner */}
      <div className="info-banner">
        <div className="info-banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>
        <div>
          <div className="info-banner-title">Used by the AI Program Builder</div>
          <div className="info-banner-text">
            This library ({totalExercises} exercises across {groups.length} muscle groups) is sent to Claude when generating programs.
            Adding exercises here makes them available for AI-generated programs. Exercises added by athletes appear in <strong>Custom</strong> — use the move button to recategorize them.
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input type="search" className="search-input" placeholder="Search exercises..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({ group: groups[0] || '', name: '', equipment: '' }); setAddModal(true) }}>+ Add Exercise</button>
      </div>

      {sortedGroups.map(group => {
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

        const isCustom = group === 'Custom'

        return (
          <div key={group} className="muscle-group" style={isCustom ? { borderColor: 'rgba(167,139,250,0.25)' } : undefined}>
            <div className="muscle-group-header" onClick={() => toggleGroup(group)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="drill-toggle drill-toggle-sm">{openGroups.has(group) ? '−' : '+'}</span>
                <span>{group}</span>
                {isCustom && (
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 6,
                    background: 'rgba(167,139,250,0.15)', color: 'var(--accent2)',
                    fontFamily: "'Space Mono', monospace", fontWeight: 600,
                  }}>ATHLETE-ADDED</span>
                )}
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
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" title="Move to another muscle group"
                            style={{ fontSize: 12, padding: '4px 6px' }}
                            onClick={() => setMoveModal({ name: ex.name, fromGroup: group, equipment: equip })}>
                            Move
                          </button>
                          <button className="btn-icon" style={{ fontSize: 14 }} onClick={() => remove(group, ex.name)}><Icon name="delete" size={14} /></button>
                        </div>
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

      {moveModal && (
        <Modal title={`Move "${moveModal.name}"`} onClose={() => setMoveModal(null)} actions={[
          { label: 'Cancel', cls: 'btn-secondary', onClick: () => setMoveModal(null) },
        ]}>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>
            Currently in <strong style={{ color: 'var(--accent2)' }}>{moveModal.fromGroup}</strong>. Select a new muscle group:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups.filter(g => g !== moveModal.fromGroup).map(g => (
              <button key={g} className="btn btn-secondary" style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                onClick={() => moveExercise(moveModal.name, moveModal.fromGroup, moveModal.equipment, g)}>
                {g}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
