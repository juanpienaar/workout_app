import React, { useState, useCallback, createContext, useContext } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now()
    const duration = type === 'error' ? 10000 : 4000
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2000, maxWidth: 420 }}>
        {toasts.map(t => (
          <div key={t.id} onClick={() => dismiss(t.id)} className={`toast ${t.type}`} style={{
            background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: 10, padding: '12px 20px', fontSize: 14, marginBottom: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            borderLeft: `4px solid ${t.type === 'error' ? '#dc2626' : 'var(--green)'}`,
            animation: 'slideUp 0.3s ease',
            cursor: 'pointer',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ flex: 1, wordBreak: 'break-word' }}>{t.msg}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>&times;</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
