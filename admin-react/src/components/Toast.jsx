import React, { useState, useCallback, createContext, useContext } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2000 }}>
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`} style={{
            background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: 10, padding: '12px 20px', fontSize: 14, marginBottom: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            borderLeft: `4px solid ${t.type === 'error' ? '#dc2626' : 'var(--green)'}`,
            animation: 'slideUp 0.3s ease',
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
