import React from 'react'

export default function Modal({ title, children, actions, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal">
        <h3>{title}</h3>
        <div>{children}</div>
        {actions && (
          <div className="modal-actions">
            {actions.map((a, i) => (
              <button key={i} className={`btn ${a.cls || 'btn-secondary'}`} onClick={a.onClick}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
