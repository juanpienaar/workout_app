import React, { useState, useRef } from 'react'
import { API } from '../api'
import { useToast } from '../components/Toast'

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
      <div className="page-title"><span className="icon">📥</span> Import CSV</div>
      <div className="card">
        <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>Upload a program CSV file. It will replace the current program.csv and rebuild program.json.</p>
        <p style={{ color: 'var(--text-dim)', marginBottom: 16, fontSize: 13 }}>Required columns: Program, Week, Day, Order, Exercise, Sets, Reps, Tempo, Rest, RPE, Instruction</p>

        <div
          className={`drop-zone ${dragOver ? 'dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]) }}
        >
          <p style={{ fontSize: 32, marginBottom: 8 }}>📄</p>
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
