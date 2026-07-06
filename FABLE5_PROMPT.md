# FuelSync — Fable 5 Design Brief
App URL: foodaniel.danielmms.site
Platform: Mobile PWA (iOS + Android) · Dark mode primary · 390px viewport

════════════════════════════════════════════════════════
IDENTITY
════════════════════════════════════════════════════════

FuelSync is a hybrid athlete's command center. Not a diet app.
It should feel like the intersection of a Garmin Connect companion,
a Bloomberg terminal, and a luxury watch face — all forged in
obsidian and electric light.

Personality: Obsidian. Precision. Electric. Alive. Confident.

The user is Daniel — an athlete who trains hard and eats with intent.
Every screen should make him feel like he's in control of a machine
built specifically for him.

════════════════════════════════════════════════════════
COLOR SYSTEM
════════════════════════════════════════════════════════

Background layers (deepest → lightest):
  #07080F  ← --bg:    deep space black, blue-shifted
  #0D0E1C  ← --surf:  primary card surface
  #131527  ← --surf2: nested elements, inputs
  #1A1D32  ← --surf3: hover states, selected rows

Text:
  #EEF0FF  ← primary text (never pure white)
  #8B8FA8  ← secondary / labels
  #4B4F6A  ← muted / timestamps

Accent (Ocean default — 5 themes exist):
  #9D7EFF  ← --accent (violet-electric)
  Generate: --accent-dim (70%), --accent-muted (12%), --accent-glow

Macro colors (sacred — never change):
  Protein  #38BDF8  ← sky blue
  Carbs    #4ADE80  ← emerald
  Fat      #FBBF24  ← amber
  Over     #F87171  ← soft red

Glows (DARK MODE ONLY — no solid shadows anywhere):
  --glow-accent: 0 0 24px rgba(157,126,255,0.25)
  --glow-prot:   0 0 18px rgba(56,189,248,0.20)
  --glow-carb:   0 0 18px rgba(74,222,128,0.20)
  --glow-fat:    0 0 18px rgba(251,191,36,0.20)

Cards use INNER glow only: inset 0 1px 0 rgba(255,255,255,0.05)
Border color: rgba(255,255,255,0.07) — barely visible, never decorative.

════════════════════════════════════════════════════════
TYPOGRAPHY
════════════════════════════════════════════════════════

Font: SF Pro Display → Inter → system-ui

Scale:
  10px / 500 / +0.5px tracking  → timestamps, units (UPPERCASE)
  11px / 600 / +0.3px           → section labels (UPPERCASE)
  13px / 400                    → body copy
  15px / 500                    → list items, inputs
  17px / 700 / -0.3px           → screen titles
  22px / 700 / -0.5px           → section heroes
  34px / 800 / -1px             → calorie summary number
  56px / 900 / -2px             → ring hero number

ALL numbers use font-variant-numeric: tabular-nums — they must
never shift layout as they animate.

════════════════════════════════════════════════════════
MOTION LANGUAGE
════════════════════════════════════════════════════════

Three easing curves — use nothing else:
  --spring:  cubic-bezier(0.34, 1.56, 0.64, 1)   ← bounce/overshoot
  --ease:    cubic-bezier(0.4, 0, 0.2, 1)         ← smooth material
  --snappy:  cubic-bezier(0.25, 0.46, 0.45, 0.94) ← quick out

Durations:
  80–120ms   ← press response (never slow a tap)
  200–280ms  ← entrance animations, stagger 25ms per item
  400–600ms  ← bar fills, count-up numbers, chart draw
  380–420ms  ← bottom sheets, modals
  NEVER exceed 600ms — athletes wait for nothing

The app breathes. Every number change animates. Every tap responds
with scale(0.97) snap back via --spring. Every milestone pulses.

════════════════════════════════════════════════════════
SCREEN 1 — HOME
════════════════════════════════════════════════════════

The daily command center. One glance = full picture.

HEADER:
  - "Good morning, Daniel" in 22px/700, left-aligned
  - Date: "Monday, Jul 7" as a frosted pill chip —
    blur(8px) background, --edge2 border, 11px/600 text
  - Settings icon top-right (ghost, no background)

CALORIE RING (hero):
  - Centered, 220px diameter
  - Track: rgba(255,255,255,0.06) stroke, strokeWidth=13
  - Fill: gradient arc from --accent to --accent-dim
    with a glowing cap (strokeLinecap="round")
  - Ring emits drop-shadow: var(--glow-accent)
  - Center: calorie number in 56px/900, --accent colored
  - Below number: "KCAL LEFT" in 10px/600/+0.5px, --muted
  - Below ring: two chips — "🔥 2,847 consumed" and
    "⚡ 547 remaining" in frosted pill design
  - On 100%: ring transitions green, pulses once with ringPop

MACRO ROW (card below ring):
  - card style: --surf, 20px radius, inner glow, edge border
  - 3 columns: Protein · Carbs · Fat
  - Each column: number (22px/700, macro-colored) + unit label
  - Thin 6px bar under each: gradient fill + glow box-shadow
  - Bars animate 0→actual width on entry, 600ms --ease
  - Tap opens macro breakdown sheet

TRAINING CHIP ROW:
  - Horizontal scroll of 4 mode chips: Rest · Cardio · Lift · Hybrid
  - Active: --accent-muted bg, 2px --accent border, accent icon + label
  - Inactive: --surf2 bg, --muted2 icon
  - Compact — 40px height, 12px radius, 11px UPPERCASE labels

FOOD LOG (today's diary):
  - Section header: "TODAY'S LOG" label left + meal calorie total right
  - Meal groups: BREAKFAST · LUNCH · DINNER · SNACKS (collapsible)
  - Each food row: 64px height
    Left: 40×40 category icon tile (colored, 12px radius)
    Middle: food name (15px/500) + macro dots (colored circles 6px + values)
    Right: calorie count (15px/700) + time (10px, muted)
  - Swipe-left: reveal red trash icon
  - Stagger entrance: each row slides up 8px + fades, 25ms apart

QUICK-ADD FAB:
  - Bottom-right, 56×56px, 18px radius (squircle)
  - Background: --accent with --glow-accent shadow
  - "+" icon, white, 24px
  - On press: scale(0.92) snap → spring back
  - After food added: FAB emits expanding ring (fabRing animation)

════════════════════════════════════════════════════════
SCREEN 2 — FOOD LOG
════════════════════════════════════════════════════════

Logging should feel like texting a personal chef. Zero friction.

TOP: AI INPUT BAR
  - Full-width translucent pill: blur(16px), --surf border
  - Placeholder: "Describe what you ate..." in --muted
  - Left: sparkle icon (--accent colored)
  - Right: mic icon (glows --accent-dim when listening)
  - On focus: pill expands vertically, border glows --accent

SEGMENTED CONTROL:
  - 5 segments: AI · Manual · Barcode · Templates · Recipes
  - Active segment: --accent-muted bg, --accent text
  - Slider transitions horizontally with --ease 200ms

RECENT FOODS (horizontal scroll):
  - Pill chips with food name + calorie count
  - Tapping one instantly adds it — ring updates with count-up
  - Chips have a subtle icon matching food category

LOG LIST:
  - Same row design as HomeScreen diary
  - Empty state: large centered illustration + "Nothing logged yet"
    text that feels poetic, not sterile

════════════════════════════════════════════════════════
SCREEN 3 — HISTORY
════════════════════════════════════════════════════════

Make progress feel epic. Data should inspire, not report.

WEEKLY CHART (full-bleed hero):
  - Filled area chart, no card border — the chart IS the screen
  - Gradient fill: --accent at the line → transparent at baseline
  - Line: 2px, --accent, glowing
  - Dots at each day: 8px circles, filled --accent, pop on appear
  - Today's dot: larger (12px), pulsing glow
  - Chart draws itself left-to-right on enter: 600ms --ease
  - Target line: dashed white at 10% opacity, labeled "GOAL"
  - Highest day gets a ⭐ badge above its dot

PERIOD SELECTOR:
  - Below chart: "7D · 14D · 30D · 90D" pill toggle
  - Selecting new period: chart re-draws with crossfade

MACRO AVERAGES ROW:
  - 3 cards side by side, each showing:
    Average amount in 22px/700 (macro-colored)
    Macro name in 10px label below
    Tiny trend arrow (↑↓) colored green/red

WEIGHT TREND:
  - Line chart with dot per entry
  - Animate draw on enter
  - Latest weight: large number in hero style above chart

DAY LIST:
  - Each row: date chip left, calorie bar fills to right
  - Bar color: green if under goal, --accent if at goal, red if over
  - Animate bar widths on scroll-into-view

════════════════════════════════════════════════════════
SCREEN 4 — SUPPLEMENTS
════════════════════════════════════════════════════════

A morning ritual. Fast, satisfying, done.

PROGRESS BAR:
  - Top of screen: "X of Y taken" in 17px/700
  - Thin 4px bar below, --accent fill, animated on check

GROUPS (MORNING · PRE-WORKOUT · POST · EVENING):
  - Group header: 11px UPPERCASE label + full-width --edge separator
  - Completed group collapses with smooth height animation (300ms --ease)

CHECK ROWS (72px height):
  - Left: custom 26px circle checkbox
    Unchecked: --edge2 border
    Checked: --accent fill + white checkmark
    Animation: scale(0.8)→scale(1.15)→scale(1.0) over 300ms --spring
  - Middle: supplement name (15px/500) + dose (13px, --muted)
  - Right: time chip (11px pill, --surf2)
  - Checked row: name fades to --muted, subtle strikethrough

COMPLETION STATE:
  - When all checked: full-screen celebration moment
    "All done, Daniel. 🔥" in large text with a particle burst
    Then transitions back to collapsed checked state

════════════════════════════════════════════════════════
SCREEN 5 — SETTINGS
════════════════════════════════════════════════════════

Feels like Raycast or Linear's preference panel — premium, precise.

PROFILE SECTION:
  - Large avatar circle (80px), name below in 22px/700
  - Goal summary as a subtitle chip

GROUPED LISTS (Raycast-style):
  - Section headers: 11px UPPERCASE, --muted, no background
  - Rows: 52px height, label left, control right
  - Row separator: --edge hairline

THEME TOGGLE:
  - Sun/Moon animated toggle: icon rotates + fades on switch
  - 300ms --spring transition for the entire screen background

ACCENT COLOR PICKER:
  - 5 colored circles (36px each), horizontal row
  - Selected: 3px accent-colored ring border + scale(1.15)
  - Unselected: scale(1.0), dimmed
  - On select: accent transitions globally with crossfade

UNIT TOGGLE (Metric / Imperial):
  - Segmented pill control, 52px height, --surf2 background
  - Active segment slides with --ease 200ms

════════════════════════════════════════════════════════
COMPONENT RULES (APPLY EVERYWHERE)
════════════════════════════════════════════════════════

Cards:
  background: --surf
  border-radius: 20px
  border: 1px solid rgba(255,255,255,0.07)
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05)
  Active press: scale(0.985), 80ms

Bottom Sheets (NO modal dialogs — ever):
  border-radius: 28px 28px 0 0
  Handle: 40×4px pill, --edge2, 12px from top
  Entry: --spring 420ms
  Backdrop: rgba(0,0,0,0.65) + blur(4px)

Buttons Primary:
  height: 52px, border-radius: 14px
  background: --accent
  box-shadow: 0 4px 16px var(--accent-glow)
  font: 15px/600

Buttons Secondary:
  height: 44px, border-radius: 14px
  background: --accent-muted
  color: --accent

Tab Bar:
  height: 64px + safe area inset
  background: --surf + backdrop-filter: blur(20px) saturate(180%)
  top border: 1px --edge
  Active: icon + label in --accent, 40×4px pill indicator above icon (glows)
  Inactive: icon in --muted2 only (no label)
  Pill indicator slides horizontally between tabs

════════════════════════════════════════════════════════
EMOTIONAL BEATS — DESIGN FOR THESE MOMENTS
════════════════════════════════════════════════════════

1. FIRST OPEN: Ring animates in with ringPop, macro bars sweep in
   staggered 25ms apart. Greeting feels personal and warm.

2. LOGGING FOOD: AI confirmation is instant + magical. Ring counts
   up. Brief green flash if still under target.

3. MACRO GOAL HIT: Bar fills to 100%, pulses once in macro color.
   Small celebration chip appears: "Protein goal hit! 💪"

4. SUPPLEMENT CHECKED: Satisfying scale pop. Row gently fades.

5. WEEKLY BEST: Chart draws, highest bar gets ⭐ badge that
   drops in from above with --spring.

6. ALL SUPPLEMENTS DONE: Full-screen moment. Brief, then collapses.

════════════════════════════════════════════════════════
ABSOLUTE RULES — NEVER BREAK THESE
════════════════════════════════════════════════════════

✗ No solid shadows in dark mode — only glows or nothing
✗ No text below 10px
✗ No borders used decoratively
✗ No pure white text (#FFFFFF) — use #EEF0FF
✗ No static state changes — everything animates
✗ No padding under 16px in any container
✗ No modal dialogs — always bottom sheets
✗ No page-level skeleton loaders — shimmer on components only
✗ No icon without a label on first encounter
✗ No cramped list rows — minimum 52px height
✗ No flat, colorless data — numbers are always contextually colored

════════════════════════════════════════════════════════
THE TEST
════════════════════════════════════════════════════════

Show this to someone who doesn't know what FuelSync is.
In 3 seconds they should say: "This looks insane."
In 10 seconds they should understand exactly what the app does.
In 30 seconds they should want to use it.

That's the bar. Build to it.
