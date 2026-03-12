import React, { useState, useRef } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'
import { Icon } from '../components/Icons'
import HelpTip from '../components/HelpTip'

export default function ImportCSV() {
  const toast = useToast()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  async function upload(file) {
    if (!file || !file.name.endsWith('.csv')) { toast('Must be a .csv file', 'error'); return }
    setLoading(true); setResult(null)
    try {
      const d = await API.importCSV(file)
      setResult({ ok: true, output: d.output || 'Done' })
      toast('CSV imported & built')
    } catch (e) {
      setResult({ ok: false, error: e.message || 'Upload failed' })
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="page-title"><Icon name="import" size={22} style={{ color: 'var(--accent2)' }} /> Import CSV</div>
      <div className="card">
        <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>Upload a program CSV file. It will replace the current program.csv and rebuild program.json. <HelpTip text="This overwrites all existing programs built from CSV. Programs created via the AI Builder are stored separately and won't be affected." /></p>
        <p style={{ color: 'var(--text-dim)', marginBottom: 16, fontSize: 13 }}>Required columns: Program, Week, Day, Order, Exercise, Sets, Reps, Tempo, Rest, RPE, Instruction <HelpTip text="Each row is one exercise. Week and Day are numbers (1, 2, 3...). Order sets the sequence within a day (A1, A2, B1...). Tempo is eccentric-pause-concentric (e.g. 3-1-2). RPE is 1-10 effort scale." /></p>

        <div
          className={`drop-zone ${dragOver ? 'dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]) }}
        >
          <Icon name="import" size={32} style={{ marginBottom: 8, display: 'block' }} />
          <p>{loading ? 'Uploading and building...' : 'Drop CSV file here or click to browse'}</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => upload(e.target.files[0])} />

        {result && (
          <div style={{ marginTop: 16 }}>
            {result.ok
              ? <>
                  <div style={{ color: 'var(--green)', marginBottom: 8 }}>✓ Import successful!</div>
                  <pre style={{ background: 'var(--input-bg)', padding: 12, borderRadius: 8, fontSize: 12, color: 'var(--text-dim)', overflowX: 'auto' }}>{result.output}</pre>
                </>
              : <div style={{ color: '#dc2626' }}>Import failed: {result.error}</div>
            }
          </div>
        )}
      </div>
    </div>
  )
}
