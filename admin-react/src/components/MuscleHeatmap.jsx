import React, { useState } from 'react'
import { loadToColor, calculateMuscleLoad } from '../utils/muscleLoad'
import { ALL_MUSCLES } from '../utils/constants'

const MUSCLE_LABELS = {
  chest: 'Chest', front_delts: 'Front Delts', side_delts: 'Side Delts', rear_delts: 'Rear Delts',
  traps: 'Traps', upper_back: 'Upper Back', lats: 'Lats', lower_back: 'Lower Back',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  core: 'Core', obliques: 'Obliques', quads: 'Quads', hamstrings: 'Hamstrings',
  glutes: 'Glutes', calves: 'Calves',
}

// Simplified SVG body shapes (front and back view)
const FRONT_MUSCLES = {
  traps: <ellipse cx="100" cy="45" rx="30" ry="8" />,
  front_delts: <><ellipse cx="62" cy="62" rx="12" ry="14" /><ellipse cx="138" cy="62" rx="12" ry="14" /></>,
  side_delts: <><ellipse cx="52" cy="58" rx="8" ry="10" /><ellipse cx="148" cy="58" rx="8" ry="10" /></>,
  chest: <><ellipse cx="82" cy="82" rx="20" ry="14" /><ellipse cx="118" cy="82" rx="20" ry="14" /></>,
  biceps: <><ellipse cx="55" cy="100" rx="8" ry="18" /><ellipse cx="145" cy="100" rx="8" ry="18" /></>,
  forearms: <><ellipse cx="50" cy="135" rx="6" ry="16" /><ellipse cx="150" cy="135" rx="6" ry="16" /></>,
  core: <rect x="85" y="100" width="30" height="35" rx="4" />,
  obliques: <><rect x="72" y="105" width="12" height="25" rx="3" /><rect x="116" y="105" width="12" height="25" rx="3" /></>,
  quads: <><ellipse cx="82" cy="170" rx="14" ry="28" /><ellipse cx="118" cy="170" rx="14" ry="28" /></>,
  calves: <><ellipse cx="80" cy="225" rx="8" ry="20" /><ellipse cx="120" cy="225" rx="8" ry="20" /></>,
}

const BACK_MUSCLES = {
  traps: <polygon points="85,35 100,28 115,35 115,50 100,55 85,50" />,
  rear_delts: <><ellipse cx="62" cy="60" rx="10" ry="10" /><ellipse cx="138" cy="60" rx="10" ry="10" /></>,
  upper_back: <rect x="78" y="55" width="44" height="20" rx="4" />,
  lats: <><polygon points="72,75 78,60 85,95 72,95" /><polygon points="128,75 122,60 115,95 128,95" /></>,
  triceps: <><ellipse cx="55" cy="95" rx="8" ry="18" /><ellipse cx="145" cy="95" rx="8" ry="18" /></>,
  lower_back: <rect x="88" y="100" width="24" height="20" rx="4" />,
  glutes: <><ellipse cx="85" cy="140" rx="16" ry="14" /><ellipse cx="115" cy="140" rx="16" ry="14" /></>,
  hamstrings: <><ellipse cx="82" cy="175" rx="12" ry="25" /><ellipse cx="118" cy="175" rx="12" ry="25" /></>,
  calves: <><ellipse cx="80" cy="225" rx="8" ry="20" /><ellipse cx="120" cy="225" rx="8" ry="20" /></>,
}

export default function MuscleHeatmap({ loads }) {
  const [hover, setHover] = useState(null)
  if (!loads) return null

  const maxLoad = Math.max(...Object.values(loads), 1)
  const sorted = ALL_MUSCLES
    .filter(m => loads[m] > 0)
    .sort((a, b) => loads[b] - loads[a])

  function renderBody(muscleMap, title) {
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 4 }}>{title}</div>
        <svg viewBox="0 0 200 260" className="heatmap-svg" style={{ maxWidth: 180 }}>
          {/* Body outline */}
          <ellipse cx="100" cy="20" rx="18" ry="20" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="70" y="38" width="60" height="65" rx="8" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="45" y="50" width="20" height="70" rx="6" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="135" y="50" width="20" height="70" rx="6" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="72" y="100" width="24" height="60" rx="6" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="104" y="100" width="24" height="60" rx="6" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="70" y="155" width="26" height="70" rx="6" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="104" y="155" width="26" height="70" rx="6" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="72" y="220" width="22" height="30" rx="4" fill="#1a1a2e" stroke="#2a2a4a" />
          <rect x="106" y="220" width="22" height="30" rx="4" fill="#1a1a2e" stroke="#2a2a4a" />

          {/* Muscle overlays */}
          {Object.entries(muscleMap).map(([muscle, shape]) => (
            <g
              key={muscle}
              fill={loadToColor(loads[muscle] || 0, maxLoad)}
              opacity={hover === muscle ? 1 : 0.75}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              onMouseEnter={() => setHover(muscle)}
              onMouseLeave={() => setHover(null)}
            >
              {shape}
            </g>
          ))}
        </svg>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header"><h3>Muscle Load Distribution</h3></div>
      <div className="heatmap-container">
        {renderBody(FRONT_MUSCLES, 'Front')}
        {renderBody(BACK_MUSCLES, 'Back')}
        <div className="heatmap-legend">
          {hover && (
            <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
              {MUSCLE_LABELS[hover] || hover}: {(loads[hover] || 0).toFixed(1)}
            </div>
          )}
          {sorted.slice(0, 12).map(m => (
            <div key={m} className="heatmap-legend-item"
              onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer', opacity: hover === m ? 1 : 0.7 }}>
              <div className="heatmap-legend-color" style={{ background: loadToColor(loads[m], maxLoad) }} />
              <span>{MUSCLE_LABELS[m] || m}</span>
              <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>{loads[m].toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
