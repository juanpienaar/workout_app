# NumNum Workout PWA - Style Guide

## Design System: Obsidian Flow

### Color Palette
```
--bg: #080810          (background)
--card: #12121e        (card surfaces)
--card-border: rgba(255,255,255,0.08)
--accent: #7c6ef0      (primary purple)
--accent-dim: #6558d4   (darker purple)
--nn-warm: #a78bfa      (lavender)
--nn-gold: #2dd4bf      (teal)
--text: #f0f0f8        (primary text)
--text-dim: #9b97b0    (secondary text)
--text-muted: #5c5775  (tertiary text)
--green: #34d399       (protein / success)
--yellow: #fbbf24      (carbs / warning)
--input-bg: #0e0e1a    (input fields)
--surface: #1a1a2e     (elevated surfaces)
```

Semantic colors:
- Protein: `var(--green)` (#34d399)
- Carbs: `var(--yellow)` (#fbbf24)
- Fat: `#f87171` (red-400)
- Delete/Skip: `#E8475F`
- Superset: `#60a5fa` (blue)
- Circuit: `#c084fc` (purple)

### Typography
- Font: `Sora` (weights: 300-700)
- Mono: `Space Mono` (for numbers/data)
- Title: 22px, weight 700
- Card name: 17px, weight 700
- Body: 14-15px, weight 500
- Meta/labels: 10-12px, weight 600, uppercase, letter-spacing 0.5-1.5px
- All text uses `var(--text)`, `var(--text-dim)`, or `var(--text-muted)`

### Card Pattern
All content cards follow this pattern:
```css
background: var(--card);
border: 1px solid rgba(124,110,240,0.25);  /* subtle purple border */
border-radius: 14px;
padding: 16px;
margin-bottom: 8px;
```

### Collapse/Expand Pattern
Exercise-style collapsible items:
```css
.collapse-header {
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; padding: 12px 14px;
  background: var(--card);
  border: 1px solid rgba(124,110,240,0.25);
  border-radius: 12px; margin-bottom: 6px;
  transition: background 0.15s;
}
.collapse-header:hover { background: rgba(124,110,240,0.04); }
.collapse-body { display: none; }
.collapse-body.open { display: block; }
```

### Input Fields
```css
background: var(--input-bg);
border: 1px solid var(--card-border);
border-radius: 8px;
color: var(--text);
font-size: 15px;
padding: 10px;
```

### Buttons
Primary action:
```css
background: linear-gradient(135deg, #7c6ef0, #a78bfa);
color: #fff; border: none; border-radius: 10px;
padding: 10px 16px; font-weight: 600;
```

Secondary/ghost:
```css
background: var(--card);
border: 1px solid var(--card-border);
color: var(--text-dim); border-radius: 10px;
```

Danger:
```css
border: 1px solid rgba(232,71,95,0.3);
background: rgba(232,71,95,0.08);
color: #E8475F;
```

### Icons
**NEVER use emojis.** Always use inline SVG icons:
- Size: 16x16 or 20x20
- Stroke: `currentColor` or `var(--accent)` or `var(--text-dim)`
- StrokeWidth: 1.5 or 2
- Fill: none (outline style)
- LineCap/LineJoin: round

Common SVG icon patterns:
```html
<!-- Plus/Add -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>

<!-- Delete/Trash -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>

<!-- Chevron Down -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>

<!-- Chevron Up -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>

<!-- Close/X -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

<!-- Search -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

<!-- Camera -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>

<!-- Barcode -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/></svg>

<!-- Edit/Pencil -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

<!-- Clock -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>

<!-- Star/Favourite -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>

<!-- Star filled (favourite active) -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--yellow)" stroke="var(--yellow)" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>

<!-- Arrow Up -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>

<!-- Arrow Down -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>

<!-- Nutrition/Apple -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2C9 2 7 4 7 4s-5 2-5 8c0 7 5 10 5 10h10s5-3 5-10c0-6-5-8-5-8s-2-2-5-2z"/><path d="M12 2v5"/></svg>
```

### Stats Display
Follow the exercise stats pattern:
```css
.stat-card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 10px 14px;
  text-align: center;
}
.stat-value { font-size: 18px; font-weight: 700; }
.stat-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
```

### Grid Layouts
Set rows: `grid-template-columns: 40px 1fr 1fr 44px 24px`
Meta items: `grid-template-columns: repeat(auto-fit, minmax(70px, 1fr))`
Stats: flex with `gap: 12px`

### Progress Bars
```css
.progress-bar {
  height: 3px;
  background: var(--card-border);
  border-radius: 2px;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--nn-warm));
  border-radius: 2px;
  transition: width 0.3s;
}
```

### Macro Bars (for nutrition)
```css
.macro-bar {
  height: 4px;
  background: var(--card-border);
  border-radius: 2px;
}
.macro-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}
/* Use inline style for color: var(--green), var(--yellow), #f87171 */
```

### Animation Patterns
- Transitions: `all 0.15s` or `all 0.2s ease`
- Active state: `transform: scale(0.98); opacity: 0.9;`
- Hover cards: `background: rgba(124,110,240,0.04)`

### Key Rules
1. **NEVER use emojis** - always inline SVG icons
2. **Nutrition should mirror exercise** - same card borders, same collapse pattern, same stats layout
3. **Purple accent** for primary actions, teal for secondary, red for danger
4. **Uppercase labels** with letter-spacing for all metadata
5. **Dark backgrounds** - never bright whites or light grays
6. **Rounded everything** - minimum border-radius: 8px
7. **Subtle borders** - use `rgba(124,110,240,0.25)` for card borders, not solid colors
