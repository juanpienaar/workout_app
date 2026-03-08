/* Exercise → Muscle group mappings for heatmap */

export const EXERCISE_MUSCLES = {
  // Chest
  'Barbell Bench Press': { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  'Incline Barbell Bench Press': { primary: ['chest', 'front_delts'], secondary: ['triceps'] },
  'Decline Barbell Bench Press': { primary: ['chest'], secondary: ['triceps'] },
  'Dumbbell Bench Press': { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  'Incline Dumbbell Press': { primary: ['chest', 'front_delts'], secondary: ['triceps'] },
  'Decline Dumbbell Press': { primary: ['chest'], secondary: ['triceps'] },
  'Dumbbell Fly': { primary: ['chest'], secondary: [] },
  'Incline Dumbbell Fly': { primary: ['chest'], secondary: ['front_delts'] },
  'Cable Crossover': { primary: ['chest'], secondary: [] },
  'Cable Fly (Low to High)': { primary: ['chest', 'front_delts'], secondary: [] },
  'Cable Fly (High to Low)': { primary: ['chest'], secondary: [] },
  'Chest Press Machine': { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  'Push Up': { primary: ['chest'], secondary: ['front_delts', 'triceps', 'core'] },
  'Dips (Chest Focus)': { primary: ['chest'], secondary: ['triceps', 'front_delts'] },
  'Close Grip Bench Press': { primary: ['triceps', 'chest'], secondary: [] },
  'Dumbbell Pullover': { primary: ['chest', 'lats'], secondary: [] },

  // Back
  'Barbell Row': { primary: ['upper_back', 'lats'], secondary: ['biceps', 'rear_delts'] },
  'Pendlay Row': { primary: ['upper_back', 'lats'], secondary: ['biceps'] },
  'T-Bar Row': { primary: ['upper_back', 'lats'], secondary: ['biceps'] },
  'Lat Pulldown': { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  'Seated Cable Row': { primary: ['upper_back', 'lats'], secondary: ['biceps'] },
  'Dumbbell Row': { primary: ['upper_back', 'lats'], secondary: ['biceps'] },
  'Pull Up': { primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  'Chin Up': { primary: ['lats', 'biceps'], secondary: ['upper_back'] },
  'Straight Arm Pulldown': { primary: ['lats'], secondary: [] },
  'Cable Face Pull': { primary: ['rear_delts', 'upper_back'], secondary: ['traps'] },
  'Barbell Shrug': { primary: ['traps'], secondary: [] },
  'Low Row Machine': { primary: ['upper_back', 'lats'], secondary: ['biceps'] },
  'Rack Pull': { primary: ['upper_back', 'traps'], secondary: ['lower_back', 'glutes'] },

  // Shoulders
  'Overhead Press': { primary: ['front_delts', 'side_delts'], secondary: ['triceps', 'traps'] },
  'Dumbbell Shoulder Press': { primary: ['front_delts', 'side_delts'], secondary: ['triceps'] },
  'Lateral Raise': { primary: ['side_delts'], secondary: [] },
  'Cable Lateral Raise': { primary: ['side_delts'], secondary: [] },
  'Front Raise': { primary: ['front_delts'], secondary: [] },
  'Reverse Fly': { primary: ['rear_delts'], secondary: ['upper_back'] },
  'Arnold Press': { primary: ['front_delts', 'side_delts'], secondary: ['triceps'] },
  'Upright Row': { primary: ['side_delts', 'traps'], secondary: ['biceps'] },
  'Rear Delt Fly Machine': { primary: ['rear_delts'], secondary: ['upper_back'] },

  // Legs
  'Barbell Back Squat': { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core', 'lower_back'] },
  'Front Squat': { primary: ['quads'], secondary: ['glutes', 'core'] },
  'Leg Press': { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  'Romanian Deadlift': { primary: ['hamstrings', 'glutes'], secondary: ['lower_back'] },
  'Deadlift': { primary: ['hamstrings', 'glutes', 'lower_back'], secondary: ['quads', 'traps', 'upper_back'] },
  'Walking Lunges': { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  'Bulgarian Split Squat': { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  'Leg Extension': { primary: ['quads'], secondary: [] },
  'Leg Curl': { primary: ['hamstrings'], secondary: [] },
  'Hip Thrust': { primary: ['glutes'], secondary: ['hamstrings'] },
  'Calf Raise': { primary: ['calves'], secondary: [] },
  'Seated Calf Raise': { primary: ['calves'], secondary: [] },
  'Hack Squat': { primary: ['quads'], secondary: ['glutes'] },
  'Goblet Squat': { primary: ['quads', 'glutes'], secondary: ['core'] },
  'Step Ups': { primary: ['quads', 'glutes'], secondary: [] },
  'Glute Bridge': { primary: ['glutes'], secondary: ['hamstrings'] },

  // Arms
  'Barbell Curl': { primary: ['biceps'], secondary: ['forearms'] },
  'Dumbbell Curl': { primary: ['biceps'], secondary: ['forearms'] },
  'Hammer Curl': { primary: ['biceps', 'forearms'], secondary: [] },
  'Preacher Curl': { primary: ['biceps'], secondary: [] },
  'Cable Curl': { primary: ['biceps'], secondary: [] },
  'Tricep Pushdown': { primary: ['triceps'], secondary: [] },
  'Overhead Tricep Extension': { primary: ['triceps'], secondary: [] },
  'Skull Crusher': { primary: ['triceps'], secondary: [] },
  'Dips (Tricep Focus)': { primary: ['triceps'], secondary: ['chest'] },
  'Cable Tricep Kickback': { primary: ['triceps'], secondary: [] },

  // Core
  'Plank': { primary: ['core'], secondary: ['obliques'] },
  'Hanging Leg Raise': { primary: ['core'], secondary: ['obliques'] },
  'Cable Crunch': { primary: ['core'], secondary: [] },
  'Russian Twist': { primary: ['obliques', 'core'], secondary: [] },
  'Ab Wheel Rollout': { primary: ['core'], secondary: ['lats'] },
  'Dead Bug': { primary: ['core'], secondary: [] },
  'Pallof Press': { primary: ['core', 'obliques'], secondary: [] },
}

export const ALL_MUSCLES = [
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'traps',
  'upper_back', 'lats', 'lower_back', 'biceps', 'triceps', 'forearms',
  'core', 'obliques', 'quads', 'hamstrings', 'glutes', 'calves',
]

export const MODEL_COSTS = {
  haiku: { name: 'Haiku', desc: 'Fast & cheap', input: 0.80, output: 4.00, model: 'claude-haiku-4-5-20251001' },
  sonnet: { name: 'Sonnet', desc: 'Balanced', input: 3.00, output: 15.00, model: 'claude-sonnet-4-5-20250929' },
  opus: { name: 'Opus', desc: 'Highest quality', input: 15.00, output: 75.00, model: 'claude-opus-4-6' },
}

export const PROGRAM_TYPES = [
  { id: 'strength', icon: '💪', label: 'Strength' },
  { id: 'crossfit', icon: '🏋️', label: 'CrossFit' },
  { id: 'hyrox', icon: '🏃', label: 'HYROX' },
  { id: 'running', icon: '👟', label: 'Running' },
  { id: 'cycling', icon: '🚴', label: 'Cycling' },
  { id: 'swimming', icon: '🏊', label: 'Swimming' },
]
