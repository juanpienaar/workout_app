# NumNum Workout — Implementation Plan

## Overview
Phase focused on exercise management improvements: reordering, custom exercise parity, coach weight pre-population, and completion UX.

---

## 1. Exercise Reorder (Up/Down Arrows)

**Current state:** Exercise order is fixed from the program definition. No reorder UI exists.

**What to build:**
- Add up/down arrow buttons to each exercise collapse header (beside the exercise name)
- Arrows swap the exercise with its neighbour within the same group
- Persist reordered positions in localStorage (`exercise_order_{user}_day{dayIndex}`)
- On render, apply saved order before displaying
- Arrows should be subtle (small, muted colour) so they don't clutter the UI

**Files:** `index.html` (renderDay, new `moveExercise(key, direction)` function)

---

## 2. Exercise Name Click → Normal View (Not History)

**Current state:** Clicking exercise name calls `showWeightHistory()` which opens a modal overlay.

**What to change:**
- Clicking exercise name should toggle the exercise open/closed (same as clicking the header row) — i.e. enter/exit focus mode
- Move history access to a small clock/history icon button inside the expanded exercise view
- This keeps history accessible but removes the accidental trigger when users just want to open an exercise

**Files:** `index.html` (exercise name onclick, add history icon button inside collapse body)

---

## 3. Custom Exercise: Tempo & Rest Fields

**Current state:** Custom exercise form only captures name, sets, reps. No tempo or rest fields. Rendered with hardcoded `tempo: '—', rest: ''`.

**What to change:**
- Add tempo input (text, placeholder "e.g. 3-1-2-0") and rest input (number, seconds) to the custom exercise form
- Store tempo and rest in the custom exercise localStorage object
- Render custom exercises using their actual tempo/rest values

**Files:** `index.html` (custom exercise form HTML, `addCustomExercise()`, renderDay custom section)

---

## 4. Custom Exercise Tonnage Fix

**Current state:** Custom exercises are merged into `allExGroups` before stats calculation (lines ~2061-2070), but the tonnage calculation may not pick them up reliably because of key format differences (`C1_Name` vs `1_Name`).

**What to fix:**
- Audit the tonnage calculation in both `renderDay()` and `updateDayDetailStats()` to ensure custom exercise sets with `done: true` are counted
- Ensure `collectCurrentData()` captures custom exercise set data with the same key format
- Add a test: log a custom exercise with weight, verify tonnage updates

**Files:** `index.html` (tonnage calc in renderDay, updateDayDetailStats, collectCurrentData)

---

## 5. Coach Pre-Populated Weights

**Current state:** Weight inputs are always empty. Reps are pre-populated from program data as placeholder text. No mechanism for coaches to set target weights.

**What to build:**
- **Backend:** Add a `target_weights` field to the user data model — keyed by exercise name and set number: `{"Bench Press": {"set1": 80, "set2": 85}}`
- **Admin dashboard:** In the athlete detail view, add a section where coaches can set target weights per exercise
- **Athlete app:** When rendering sets, if `target_weights` exists for that exercise, pre-fill the weight input with the target value (as actual value, not placeholder)
- **Logging rule:** The set is NOT marked as done until the athlete ticks it — the pre-filled weight is just a suggestion
- **Visual indicator:** Pre-populated weights should have a subtle coach icon or different text colour so the athlete knows it came from the coach

**Files:**
- `app/routes/admin_routes.py` (new endpoint: `PUT /api/admin/users/{username}/target-weights`)
- `app/models.py` (new `TargetWeightsRequest` model)
- `app/data.py` (load/save target weights in user data)
- `admin-react/src/pages/Users.jsx` (weight entry UI for coaches)
- `index.html` (read target weights from user data, pre-fill inputs)

---

## 6. Custom Exercise: Add from Library with Fuzzy Match

**Current state:** Custom exercise form is a free-text name input with no suggestions or matching.

**What to build:**
- When athlete types in the custom exercise name field, show a dropdown of matching exercises from `exercises.json`
- Use fuzzy/substring matching (case-insensitive, partial word match)
- If the athlete selects from the list, auto-fill sets/reps/tempo/rest from the library defaults
- If the athlete types a name not in the library:
  - Allow it (free-text still works)
  - On save, add it to `exercises.json` under a "Custom" category
  - Coach can later move it to another category from the admin dashboard

**Files:**
- `index.html` (autocomplete dropdown on custom exercise name input)
- `app/routes/admin_routes.py` (endpoint to move exercises between categories)
- `admin-react/src/pages/Exercises.jsx` (show custom category, allow recategorisation)

---

## 7. Custom Exercise Completion Bug Fix

**Current state:** Custom exercise doesn't tick as complete unless the next exercise is added. Tonnage is unstable.

**Root cause:** The custom exercise section re-renders all customs as a single group. State collection may be losing data between re-renders.

**What to fix:**
- Ensure `collectCurrentData()` is called before `renderDay()` when adding a new custom exercise (preserve existing input state)
- Fix the completion check: custom exercises should follow the same `setsCompleted === totalSets` logic as program exercises
- Each custom exercise should have an independent done state

**Files:** `index.html` (`addCustomExercise()`, `collectCurrentData()`, renderDay custom section)

---

## 8. Mark Exercise as Complete (Whole Exercise)

**Current state:** Exercises auto-show a green checkmark when all individual sets are done. No way to mark the whole exercise done in one action.

**What to build:**
- Add a "Complete All" button (checkmark icon) in the exercise header, next to the set counter
- Tapping it marks all sets as done (fills reps from placeholder if empty, toggles all `.set-check` buttons to done)
- If all sets are already done, tapping again un-completes all sets
- Auto-fill reps from placeholders when bulk-completing (same as current auto-complete behaviour)
- Exercise still auto-completes naturally when last individual set is ticked

**Files:** `index.html` (new `completeAllSets(exKey)` function, button in exercise header)

---

## 9. Add Extra Sets to Any Exercise

**Current state:** Set count is fixed from program definition. No way to add more sets.

**What to build:**
- Add a "+ Add Set" button at the bottom of each exercise's set list
- Creates a new set row with the next set number (e.g., if 3 sets exist, adds set 4)
- Extra sets stored in localStorage (`extra_sets_{user}_day{dayIndex}_{exKey}`)
- Extra sets included in tonnage calculation and completion count
- Visual indicator: extra sets have a subtle "bonus" badge or different border
- Should work for both program and custom exercises

**Files:** `index.html` (new `addExtraSet(exKey)` function, set rendering loop, collectCurrentData)

---

## 10. Custom Exercise Individual Collapse Fix

**Current state:** Opening one custom exercise opens ALL custom exercises because they share a single group container.

**Root cause:** All custom exercises are rendered inside one `.group-container` with a shared collapse mechanism. Focus mode activates the entire group.

**What to fix:**
- Render each custom exercise as its own `.group-container` (same as program exercises)
- Each gets its own collapse ID and independent focus mode behaviour
- Remove the "Custom Exercises" wrapper group — customs should be individual entries at the bottom of the exercise list
- Keep the visual "Custom" badge on each one so they're identifiable

**Files:** `index.html` (renderDay custom exercise section — restructure from single group to individual groups)

---

## Implementation Order (Recommended)

Dependencies and risk inform this order:

| Priority | Item | Reason |
|----------|------|--------|
| 1 | #10 Custom exercise individual collapse | Foundational fix — blocks other custom exercise work |
| 2 | #7 Custom exercise completion bug | Depends on #10 being fixed first |
| 3 | #4 Custom exercise tonnage fix | Depends on #10 and #7 |
| 4 | #3 Custom exercise tempo & rest | Simple form extension, no dependencies |
| 5 | #2 Exercise name click → normal view | Quick UX change, low risk |
| 6 | #8 Mark exercise as complete | Standalone feature, no dependencies |
| 7 | #9 Add extra sets | Standalone but touches set rendering |
| 8 | #1 Exercise reorder | Standalone, moderate complexity |
| 9 | #6 Add from library with fuzzy match | Needs exercises.json integration |
| 10 | #5 Coach pre-populated weights | Largest scope — backend + admin + athlete app |
