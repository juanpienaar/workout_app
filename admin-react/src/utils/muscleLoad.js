import { EXERCISE_MUSCLES, ALL_MUSCLES } from './constants'

/**
 * Calculate muscle load from a program structure.
 * Returns { muscle_name: load_value } for all muscles.
 */
export function calculateMuscleLoad(program) {
  const loads = {}
  ALL_MUSCLES.forEach(m => loads[m] = 0)

  const weeks = program.weeks || []
  for (const week of weeks) {
    for (const day of (week.days || [])) {
      if (day.isRest) continue
      for (const group of (day.exerciseGroups || [])) {
        for (const ex of (group.exercises || [])) {
          const mapping = findMuscleMapping(ex.name)
          if (!mapping) continue
          const sets = parseInt(ex.sets) || 0
          const rpe = parseFloat(ex.rpe) || 7
          const effort = sets * (rpe / 10)
          mapping.primary.forEach(m => { if (loads[m] !== undefined) loads[m] += effort })
          mapping.secondary.forEach(m => { if (loads[m] !== undefined) loads[m] += effort * 0.4 })
        }
      }
    }
  }
  return loads
}

function findMuscleMapping(exerciseName) {
  // Direct match
  if (EXERCISE_MUSCLES[exerciseName]) return EXERCISE_MUSCLES[exerciseName]
  // Fuzzy match — check if the exercise name contains a known exercise
  const lower = exerciseName.toLowerCase()
  for (const [name, mapping] of Object.entries(EXERCISE_MUSCLES)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return mapping
    }
  }
  // Fallback: try to infer from common keywords
  if (lower.includes('squat') || lower.includes('lunge')) return { primary: ['quads', 'glutes'], secondary: ['hamstrings'] }
  if (lower.includes('press') && lower.includes('bench')) return { primary: ['chest'], secondary: ['triceps', 'front_delts'] }
  if (lower.includes('press') && (lower.includes('shoulder') || lower.includes('overhead'))) return { primary: ['front_delts', 'side_delts'], secondary: ['triceps'] }
  if (lower.includes('curl') && !lower.includes('leg')) return { primary: ['biceps'], secondary: ['forearms'] }
  if (lower.includes('row')) return { primary: ['upper_back', 'lats'], secondary: ['biceps'] }
  if (lower.includes('pull')) return { primary: ['lats'], secondary: ['biceps'] }
  if (lower.includes('deadlift') || lower.includes('rdl')) return { primary: ['hamstrings', 'glutes'], secondary: ['lower_back'] }
  if (lower.includes('fly') || lower.includes('crossover')) return { primary: ['chest'], secondary: [] }
  if (lower.includes('raise') && lower.includes('lateral')) return { primary: ['side_delts'], secondary: [] }
  if (lower.includes('calf')) return { primary: ['calves'], secondary: [] }
  if (lower.includes('plank') || lower.includes('crunch') || lower.includes('ab')) return { primary: ['core'], secondary: [] }
  return null
}

/**
 * Color gradient: blue (low) → yellow (mid) → red (high)
 */
export function loadToColor(load, maxLoad) {
  if (maxLoad === 0 || load === 0) return '#2a2a3a'
  const ratio = Math.min(load / maxLoad, 1)
  if (ratio < 0.5) {
    const t = ratio * 2
    const r = Math.round(40 + t * 215)
    const g = Math.round(80 + t * 140)
    const b = Math.round(220 - t * 180)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (ratio - 0.5) * 2
    const r = 255
    const g = Math.round(220 - t * 200)
    const b = Math.round(40 - t * 40)
    return `rgb(${r},${g},${b})`
  }
}
