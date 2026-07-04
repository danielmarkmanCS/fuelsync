# FuelSync — Master Design Prompt

> **Mission:** Redesign FuelSync to be the most visually stunning, emotionally resonant, and effortlessly usable nutrition tracking app ever built. Every pixel earns its place. Every interaction feels alive.

---

## Identity

FuelSync is a **hybrid athlete's command center** — not a diet app. It feels like the intersection of a premium fitness wearable's companion app (Garmin Connect, Whoop) and the elegance of a high-end fintech dashboard. It should feel **powerful but calm**, like holding a formula-1 steering wheel made of carbon fiber.

**Personality keywords:** Obsidian. Precision. Electric. Confident. Human.

---

## Design Principles

### 1. Depth over Flatness
Use **layered surfaces** with micro-elevation differences, not flat cards. Dark mode should feel like looking through frosted glass at a deep space interior — surfaces have subtle inner glows, not harsh borders.

### 2. Data is the Hero
Numbers — calories, macros, weight — must be the first thing the eye finds. They should be **large, bold, and contextually colored**. Supporting labels shrink into the background. The user's progress should feel visceral and motivating.

### 3. Micro-interactions are Mandatory
Every tap should respond. Every number change should animate. Every success (food logged, supplement checked, target hit) should emit a visual pulse. The app should feel like it's **breathing**.

### 4. Information Hierarchy
Three tiers only:
- **Hero tier:** The one number that matters right now (ring, today's total, weight)
- **Support tier:** Breakdowns (macro bars, supplement lists, meal rows)
- **Ambient tier:** Labels, units, timestamps — barely visible, contextually readable

### 5. Spatial Generosity
Padding is cheap. Cramped UI kills trust. Every section needs **breathing room**. Use 20–28px horizontal gutters, 16–24px vertical spacing between blocks. Cards should feel like premium tiles, not data tables.

---

## Visual System

### Color Architecture (Dark Mode)

```
Background layers (deepest → lightest):
  --bg:     #07080F   ← Near-pure black with a blue tint
  --surf:   #0D0E1C   ← Primary card surface
  --surf2:  #131527   ← Nested elements, inputs
  --surf3:  #1A1D32   ← Hover states, selected rows

Borders (use sparingly — only for separation, not decoration):
  --edge:   rgba(255,255,255,0.06)  ← Ultra-subtle separator
  --edge2:  rgba(255,255,255,0.10)  ← Interactive border

Glow (never solid shadows in dark — use glow):
  --glow-accent: 0 0 20px rgba(157,126,255,0.20)
  --glow-prot:   0 0 16px rgba(56,189,248,0.18)
  --glow-carb:   0 0 16px rgba(74,222,128,0.18)
  --glow-fat:    0 0 16px rgba(251,191,36,0.18)
```

### Color Architecture (Light Mode)

```
  --bg:    #F5F5FA   ← Warm off-white, not blinding white
  --surf:  #FFFFFF
  --surf2: #F0F0F8
  --surf3: #E8E8F0
  
  Shadows (replace glows in light):
  --shadow-card: 0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)
```

### Accent System
Keep 5 accent colors. Each must generate a full token set:
- `--accent`       → Pure accent (interactive elements, active states)
- `--accent-dim`   → 70% opacity (progress fills, secondary buttons)
- `--accent-muted` → 12% opacity (backgrounds, hover states, track fills)
- `--accent-glow`  → `0 0 20px {accent}30` (for ring, FABs, key numbers)

### Macro Colors — Context-Rich
```
Protein  → --prot: #38BDF8   (sky blue — lean, clean)
Carbs    → --carb: #4ADE80   (emerald — energy, fuel)
Fat      → --fat:  #FBBF24   (amber — warmth, density)
Over     → --red:  #F87171   (soft red — warning, not alarm)
```

### Typography

**Font stack:** `'SF Pro Display', 'Inter', system-ui, sans-serif`

Scale:
```
--text-2xs:  10px / weight 500 / tracking +0.5px  → timestamps, units
--text-xs:   11px / weight 600 / tracking +0.3px  → labels (UPPERCASE)
--text-sm:   13px / weight 400                    → body copy
--text-md:   15px / weight 500                    → list items, inputs
--text-lg:   17px / weight 600 / tracking -0.3px  → screen titles
--text-xl:   22px / weight 700 / tracking -0.5px  → section heroes
--text-2xl:  34px / weight 800 / tracking -1px    → calorie number
--text-hero: 56px / weight 900 / tracking -2px    → ring hero number
```

Number rendering: always use `font-variant-numeric: tabular-nums` — numbers must never shift layout as they animate.

---

## Component Standards

### Calorie Ring (HomeScreen hero)
- SVG ring: `strokeWidth = 10`, rounded caps (`strokeLinecap="round"`)
- Background track: `--edge2` at 60% opacity
- Fill: `--accent` with a **radial gradient sweep** from `accent` to `accent-dim`
- Center number: `--text-hero` size, weight 900, animated count-up on change
- Below number: calorie label in `--text-xs`, `--muted2` color
- Ring should have a subtle `drop-shadow` matching `--glow-accent`
- At 100%: the ring fill color transitions to `--green`, the number pulses once

### Macro Bars
- Height: `6px` (not 3px — too thin to read at a glance)
- Track: `--edge2` background
- Fill: gradient from the macro's color to a slightly lighter tint
- Label row: macro name left-aligned, `XXg / YYg` right-aligned in tabular numbers
- Percentage indicator: small number above the bar end cap (not inside the bar)
- Bars animate from left on screen enter: `width: 0 → actual` over 600ms with `--ease`

### Cards
```css
.card {
  background: var(--surf);
  border-radius: 20px;
  border: 1px solid var(--edge);
  /* Dark mode only: */
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}
.card:active {
  transform: scale(0.985);
  transition: transform 80ms ease;
}
```
Cards that display progress or macros get a **left-accent stripe** (3px, the relevant macro color) on active/today state.

### Buttons

**Primary (CTA):**
```css
background: var(--accent);
border-radius: 14px;
height: 52px;
font-size: 15px; font-weight: 600;
box-shadow: 0 4px 16px var(--accent-glow);
```

**Secondary:**
```css
background: var(--accent-muted);
color: var(--accent);
border-radius: 14px;
height: 44px;
```

**Icon button / FAB:**
- Size: 56px × 56px
- Border-radius: 18px (squircle feel, not circle)
- Background: `--accent` with glow
- On press: `scale(0.92)` snap, then spring back via `cubic-bezier(0.34, 1.56, 0.64, 1)`
- On success: emit `fabRing` animation (expanding accent ring that fades)

### Tab Bar
- Height: 64px + safe-area-inset-bottom
- Background: `var(--surf)` with `backdrop-filter: blur(20px) saturate(180%)`
- Top border: `1px solid var(--edge)`
- Active tab: icon + label in `--accent`, with a `40×4px` pill indicator above the icon
- Inactive: icon in `--muted2`, no label shown
- Transition: indicator pill slides horizontally, icon scales 1.0→1.1 on activation

### Bottom Sheets
- Background: `var(--surf)` 
- Top corners: `border-radius: 28px 28px 0 0`
- Handle bar: `40×4px` pill, `--edge2` color, centered, 12px from top
- Entry: `sheetUp` animation with spring easing (0.42s, `cubic-bezier(0.34, 1.56, 0.64, 1)`)
- Backdrop: `rgba(0,0,0,0.65)` with `backdrop-filter: blur(4px)`

### Food Log Rows
```
[Meal icon]  [Food name]           [calories]
             [protein · carbs · fat]   [time]
```
- Row height: 64px minimum
- Left: 40×40 colored icon tile (category color, rounded 12px)
- Food name: `--text-md`, weight 500
- Macros row: 3 colored dots + values in `--text-xs`
- Calories: `--text-md`, weight 700, right-aligned
- Swipe-to-delete: reveal red trash icon on left swipe

### Training Picker
4 tiles in a 2×2 grid (or horizontal scroll on small screens):
- Selected: `--accent-muted` background + `2px solid --accent` border + accent icon
- Unselected: `--surf2` background, `--muted2` icon
- Label below icon: `--text-xs` UPPERCASE
- Transition: 180ms ease on selection change

### Supplements Check Items
- Checkbox: custom — 24px circle, unchecked = `--edge2` border, checked = filled `--accent` with white checkmark
- Check animation: scale 0.8 → 1.1 → 1.0 over 300ms (satisfying pop)
- Checked row: name text fades to `--muted`, slight strikethrough (3% opacity)
- Group headers (`MORNING`, `PRE-WORKOUT`, etc.): `--text-xs` label class, full-width separator line

---

## Screen-by-Screen Direction

### HomeScreen
**Goal:** The user should feel instantly oriented — how their day is going, in one glance.

Layout (top to bottom):
1. **Status bar area** — greeting (`Good morning, Daniel`) + date chip
2. **Calorie ring** — centered, 200px diameter, hero number inside
3. **Macro row** — 3 bars (protein / carbs / fat) in a card below the ring
4. **Training picker** — compact horizontal chips below macros
5. **Water tracker** — wave icon + `X / 8 glasses`, minimal
6. **Today's diary** — list of food log rows grouped by meal
7. **Supplements quick-view** — collapsible, shows only unchecked items

Key upgrades:
- Ring background should have a very subtle radial gradient from `--surf` center to `--bg` edge
- Weather banner (if active) should slot in between status and ring with a glassmorphism pill design
- Calorie number should count up whenever a food is added

### FoodScreen
**Goal:** Logging should feel like texting — fast, smart, no friction.

- Full-width AI input at top: translucent pill, placeholder `"Describe what you ate..."` with mic icon
- Below: segmented control — `AI · Manual · Barcode · Templates · Recipes`
- Recent foods: horizontal scroll of pill chips, quick-add on tap
- Log list: same row design as HomeScreen diary
- FAB: `+ Add Food` centered at bottom, always visible, pulses subtly when input is empty

### HistoryScreen
**Goal:** Make progress feel epic. Data should inspire, not intimidate.

- Weekly chart: full-bleed, no card border — the chart IS the hero
- Use a filled area chart (not bar chart) with a gradient fill from `--accent` to transparent
- Weight trend: line chart with dots at each entry, animated on load
- Macro averages: 3 large number cards in a row
- Day-by-day list: calendar-style date chips on left, calorie bar on right

### SupplementsScreen
**Goal:** Fast check-in. Like a morning routine checklist.

- Full screen is the checklist, no chrome
- Progress indicator at top: `X of Y taken today` with a thin progress bar
- Completed group collapses with a satisfying animation

### SettingsScreen
**Goal:** Feel like a preference panel from a premium app (Raycast, Linear, Notion).

- List-style grouped settings with right-aligned controls
- Theme: animated sun/moon toggle, 300ms transition
- Accent colors: 5 colored circles, selected has a ring border + scale 1.15
- Metric/Imperial: segmented pill toggle

---

## Motion Language

All animations use one of three easing curves:
- `--spring: cubic-bezier(0.34, 1.56, 0.64, 1)` → overshoot, bouncy — for press returns, modals
- `--ease:   cubic-bezier(0.4, 0, 0.2, 1)` → smooth material — for bars, charts, transitions
- `--snappy: cubic-bezier(0.25, 0.46, 0.45, 0.94)` → quick out — for list items, fades

Duration rules:
- Micro (press response): `80–120ms`
- Entrance animations: `200–280ms` with stagger delays of `25ms` per item
- Data updates (bar fills, count-up): `400–600ms`
- Sheets / modals: `380–420ms`
- Never exceed 600ms for any UI element — users wait for nothing

**Sound:** Keep the C5→E5→G5 chord on food log success. It's a signature.

---

## Emotional Beats to Design For

1. **First open of the day** — calorie ring should animate in with `ringPop`, macros bars sweep in staggered. The greeting should feel personal.
2. **Logging food** — AI confirmation should feel instant and magical. Ring updates with count-up. A brief green flash on the ring if under target.
3. **Hitting a macro goal** — the bar fills to 100% and the bar color pulses once.
4. **Checking a supplement** — satisfying pop animation, row fades gently.
5. **Viewing weekly history** — chart animates in with a draw effect, highest day gets a star.

---

## Anti-Patterns to Eliminate

- No generic shadows in dark mode — only glows or no elevation
- No text smaller than 10px anywhere
- No borders used decoratively — only for separation
- No full-opacity white text on dark backgrounds — use `--text: #EEF0FF`
- No static, un-animated state changes
- No cramped padding (min 16px horizontal in any container)
- No unlabeled icons (at least on first encounter)
- No modal dialogs — always bottom sheets
- No page-level skeleton loaders — use shimmer on individual components
