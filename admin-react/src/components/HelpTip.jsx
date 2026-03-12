import React, { useState, useRef, useEffect } from 'react'

/**
 * Contextual help tooltip. Shows a ? icon that reveals a tooltip on hover/click.
 * Usage: <HelpTip text="Explanation here" />
 * Optional: <HelpTip text="..." placement="left" /> (default: right)
 */
export default function HelpTip({ text, placement = 'bottom', style }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({})
  const ref = useRef()
  const tipRef = useRef()

  useEffect(() => {
    if (show && ref.current && tipRef.current) {
      const rect = ref.current.getBoundingClientRect()
      const tip = tipRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      let top, left

      if (placement === 'bottom') {
        top = rect.bottom + 6
        left = rect.left + rect.width / 2 - tip.width / 2
      } else if (placement === 'left') {
        top = rect.top + rect.height / 2 - tip.height / 2
        left = rect.left - tip.width - 6
      } else {
        top = rect.top + rect.height / 2 - tip.height / 2
        left = rect.right + 6
      }

      // Keep in viewport
      if (left + tip.width > vw - 12) left = vw - tip.width - 12
      if (left < 12) left = 12
      if (top + tip.height > vh - 12) top = rect.top - tip.height - 6
      if (top < 12) top = 12

      setPos({ top, left })
    }
  }, [show, placement])

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={e => { e.stopPropagation(); setShow(!show) }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 15, height: 15, borderRadius: '50%',
          background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
          color: 'var(--accent2)', fontSize: 9, fontWeight: 700,
          cursor: 'help', userSelect: 'none', flexShrink: 0,
          fontFamily: "'Space Mono', monospace",
          ...style,
        }}
      >
        ?
      </span>
      {show && (
        <div
          ref={tipRef}
          style={{
            position: 'fixed', zIndex: 9999,
            ...pos,
            maxWidth: 280, padding: '10px 14px',
            background: 'rgba(20,20,35,0.97)', border: '1px solid rgba(167,139,250,0.25)',
            borderRadius: 10, fontSize: 12, lineHeight: 1.5,
            color: 'var(--text)', backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        >
          {text}
        </div>
      )}
    </>
  )
}
