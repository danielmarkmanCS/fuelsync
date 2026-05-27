# FuelSync — Hybrid Athlete Nutrition & Training PWA
**Stack:** React 18 + Vite + TypeScript · Capacitor (Android APK) · Zustand · Dexie (IndexedDB) · PWA

---

## Architecture (Local-first, no backend required)

| Layer | Location | Notes |
|-------|----------|-------|
| Web app | `apps/web/src/` | Vite SPA, served by nginx in Docker |
| Android APK | `apps/web/android/` | Capacitor wrapper around the web app |
| Local DB | Dexie (IndexedDB) | All food/supplement/weight data stored on-device |
| AI proxy | Cloudflare Worker `fuelsync-ai` | Proxies Gemini — hides API key from browser |
| Strava proxy | Cloudflare Worker `fuelsync-strava` | OAuth callback, token refresh, stats proxy |
| Docker deploy | `/mnt/data/projects/mmswebsite/` | `docker compose build foodaniel && docker compose up -d foodaniel` |
| GitHub Pages | Auto via `git push master` | Primary deploy target; Docker is secondary |

> **CRITICAL — Two deploy targets:**
> - **GitHub Pages** → `git push` → GitHub Action builds & deploys automatically
> - **Docker** → `docker compose build foodaniel && docker compose up -d foodaniel` (home server)
> Never mix them up. Most UI changes go to GitHub Pages.

---

## Screens & Navigation (`App.tsx`)

6-tab bottom nav: **HOME · DIARY · TRENDS · SUPPS · PROFILE · SETTINGS**

| Tab | Screen | Key purpose |
|-----|--------|-------------|
| home | `HomeScreen.tsx` | MFP-style dashboard — date nav, calorie equation, per-meal food diary, training, supplements, Strava |
| food | `FoodScreen.tsx` | Food logging (AI Smart + Manual + barcode scan + photo) |
| history | `HistoryScreen.tsx` | Progress charts, run history, weight trends, day-by-day macro history |
| supplements | `SupplementsScreen.tsx` | Daily supplement checklist with M/A/E day-period timestamps |
| profile | `ProfileSetupScreen.tsx` | Body stats, calorie goal, activity level, custom targets |
| settings | `SettingsScreen.tsx` | Dark/Light theme toggle, profile shortcuts |

---

## Design System — Dual Theme (Light/Dark)

### Theme Store
`src/store/themeStore.ts` — Zustand + persist (`fs_theme` localStorage key)
```ts
const { isDark, toggleTheme } = useThemeStore();
```
Applied in `App.tsx`: `document.body.setAttribute('data-theme', isDark ? 'dark' : 'light')`

### CSS Variables (`src/index.css`)
All components use `var(--bg)`, `var(--surf)`, `var(--surf2)`, `var(--edge)`, `var(--text)`, `var(--muted)`, `var(--accent)`.

**Dark (default — GitHub-inspired slate):**
```
--bg:#0D1117   --surf:#161B22   --surf2:#1C2128  --edge:#21262D  --edge2:#30363D
--text:#F0F3F6  --muted:#8B949E  --muted2:#6E7681
--accent:#2F81F7  --accent2:#1971E8  --accent-muted:rgba(47,129,247,0.12)
```

**Light (MFP Classic):**
```
--bg:#E4E7EB   --surf:#F2F4F6   --surf2:#E9ECF0  --edge:#D0D4DA  --edge2:#BCC1C8
--text:#1A1F26  --muted:#586069  --muted2:#8C96A0
--accent:#0066EE  --accent2:#0055CC  --accent-muted:rgba(0,102,238,0.09)
```

### Typography
```
Font: Outfit (body, 400–700), Barlow Condensed (hero numbers/headings, 800)
.nrc-hero / .hero  → Barlow Condensed 800, −1px letter-spacing, line-height 1
.nrc-label / .label → Outfit 600, 11px, 1.2px tracking, uppercase, var(--muted)
.nrc-press / .press → scale(0.96) on :active
.t-title    → 17px 700
.t-headline → 15px 600
.t-body     → 14px 400
.t-label    → 11px 600, uppercase, 1.2px tracking, var(--muted)
.t-caption  → 12px 400, var(--muted)
```

### Macro colors (static, both themes)
```
--prot: #38BDF8   (blue  — protein)
--carb: #22C55E   (green — carbs)
--fat:  #F59E0B   (amber — fat)
--red:  #EF4444
--green:#22C55E
```

### Shadows
```
Dark:  --shadow-sm: none  --shadow-md: 0 1px 3px rgba(0,0,0,0.4)  --shadow-lg: 0 4px 16px rgba(0,0,0,0.5)
Light: --shadow-sm: 0 1px 2px rgba(0,0,0,0.06)  --shadow-md: 0 1px 4px rgba(0,0,0,0.08),0 0 0 1px var(--edge)
```

### Geometry
```
--r-xs:4px  --r-sm:6px  --r-md:8px
```

---

## HomeScreen — MFP Layout

### Sections (top → bottom)
1. **Top bar** — `< Date >` navigation arrows + gear icon → Settings; training type badge
2. **Calorie Dashboard** — `Goal − Food + Exercise = Remaining` equation grid + centered SVG ring + progress bar
3. **Macro Row** — 3 cards: Carbs / Fat / Protein (consumed/target + fill bar)
4. **Today's Training** (today only) — Rest / Strength / Cardio / Hybrid selector + NEAT modifier
5. **Food Diary** — Per-meal section cards (Breakfast · Pre-WO · Lunch · Post-WO · Dinner · Snacks)
   - Items displayed paragraph-style (no inner scroll, flows naturally)
   - Colorful macro chips per item: P=#38BDF8 C=#22C55E F=#F59E0B
   - Meal total row at bottom of each section
   - `+ ADD FOOD` button pre-selects meal type in FoodScreen via `setPendingMealType(meal)`
6. **Supplements** (today only) — Checklist with M/A/E day-period stamps; congrats popup when all taken
7. **Strava Card** (today only)
8. **Weekly Load** (today only)

Past-day navigation hides today-only sections and shows "Back to Today" CTA.

---

## Store Map

| Store | File | Key state |
|-------|------|-----------|
| Auth | `store/authStore.ts` | `user`, `pinVerified` |
| App | `store/appStore.ts` | `activeTab` (AppTab), `pendingMealType` |
| Theme | `store/themeStore.ts` | `isDark` (persisted to `fs_theme`) |
| Nutrition | `store/nutritionStore.ts` | `todayLog`, `targets`, `weeklyLoad`, `weather` |

---

## Food Logging (critical path)

```
FoodScreen.tsx
  ├── AI Smart mode  → Cloudflare Worker /describe (Gemini) → auto-fills form
  ├── Manual mode    → name + weight + macros + optional AI assist
  ├── Photo mode     → camera → base64 → Worker /analyze → fills form
  ├── Barcode scan   → Open Food Facts API → fills form
  └── addLog()       → Dexie local insert + optional D1 sync queue
```

`pendingMealType` in appStore pre-selects meal when navigating from Home → Food tab.
`playFoodLogSound()` plays C5→E5→G5 chord on success.

**Validation rules:**
- Calories must match P×4+C×4+F×9 within ±12%
- Total macros ≤ food weight × 1.1
- No single macro > 95% of food weight

---

## Auth — PIN System

- First launch: 2-step onboarding (body stats → PIN creation)
- Return visits: PIN entry gate before app loads
- PIN hashed with PBKDF2-SHA256 (100,000 iterations), salt stored in IndexedDB
- 15 wrong attempts → full database wipe (`db.delete()`)
- `pinVerified` flag in authStore (sessionStorage — cleared on tab close, not page refresh)

---

## APK Build

```bash
cd apps/web
npx vite build                      # 1. Build web assets
npx cap sync android                # 2. Sync to Android project
cd android && ./gradlew assembleRelease  # 3. Build signed APK
# APK output: android/app/build/outputs/apk/release/
cp android/app/build/outputs/apk/release/app-release.apk /mnt/data/FuelSync/fuelsync-release.apk
```

---

## Deploy

### GitHub Pages (primary — public app)
```bash
git add -A && git commit -m "..." && git push
# GitHub Action runs automatically → builds → deploys to danielmarkmanCS.github.io
# DNS: foodaniel.danielmms.site CNAME → danielmarkmanCS.github.io
```

### Docker (secondary — home server mirror)
```bash
cd /mnt/data/projects/mmswebsite
docker compose build foodaniel && docker compose up -d foodaniel
```
Live at: **foodaniel.danielmms.site**

### Cloudflare Workers
```bash
cd workers/ai    && npx wrangler deploy
cd workers/strava && npx wrangler deploy
```

---

## nginx.conf — Compat Redirects

Each Vite build produces a new content-hash filename. Cloudflare may cache stale HTML referencing old hashes. The nginx compat redirect block maps old filenames → current bundle:

```nginx
location = /assets/index-<old-hash>.js { rewrite ^ /assets/index-<current>.js last; }
```

After each Docker deploy, add the previous bundle's hash to the redirect list in `nginx.conf`.

---

## Key Files

```
apps/web/src/
├── App.tsx                    ← root shell, auth gate, tab nav, Strava OAuth
├── index.css                  ← ALL CSS vars, typography, animations
├── screens/
│   ├── HomeScreen.tsx         ← MFP dashboard (biggest, most complex file)
│   ├── FoodScreen.tsx         ← food logging (AI, photo, manual, barcode, recipes)
│   ├── HistoryScreen.tsx      ← trends, charts, day history
│   ├── SupplementsScreen.tsx  ← supplement checklist
│   ├── ProfileSetupScreen.tsx ← body stats, settings
│   ├── SettingsScreen.tsx     ← theme toggle
│   ├── AuthScreen.tsx         ← onboarding: profile + PIN setup
│   └── PinScreen.tsx          ← PIN entry gate
├── components/
│   ├── StravaCard.tsx         ← uses CSS vars throughout (no hardcoded dark hex)
│   ├── TrainingPicker.tsx
│   └── WeatherBanner.tsx
├── store/
│   ├── authStore.ts
│   ├── appStore.ts
│   ├── themeStore.ts
│   └── nutritionStore.ts
├── api/
│   ├── localFood.ts           ← Dexie CRUD + Gemini Worker calls
│   ├── auth.ts                ← profile CRUD (IndexedDB)
│   ├── client.ts              ← workerFetch helper
│   └── strava.ts              ← Strava via Cloudflare Worker
├── lib/
│   ├── db.ts                  ← Dexie schema (profile, food_logs, pin_state, weight_logs, ...)
│   └── pin.ts                 ← PBKDF2 hash/verify/lockout/wipe
├── hooks/useNutrition.ts      ← main data hook
└── utils/sounds.ts            ← playFoodLogSound() — C5→E5→G5 chord
```

---

## Known Patterns & Pitfalls

### Template-literal hex-opacity bug
`const ORANGE = 'var(--accent)'` then `` `${ORANGE}08` `` → produces `var(--accent)08` which is **invalid CSS**.
Fix: Add a hex constant `const ORANGE_HEX = '#2F81F7'` for use in template literals; keep `ORANGE` for direct `color:` props.

### React Hooks ordering
Any `useEffect` placed AFTER an early `return` is a hooks violation. React throws "Rendered fewer hooks than expected" at runtime → blank screen. **Always put all hooks before any conditional return.**

### Inner scroll trapping touch events
Giving a sub-element `overflowY: 'auto'` on mobile captures touch scroll — user can't scroll the page past it. Avoid inner scroll containers unless absolutely necessary. Food diary uses paragraph layout with natural page scroll.

### StravaCard — no hardcoded dark hex
All colors use CSS vars: `var(--surf)`, `var(--surf2)`, `var(--edge)`, `var(--text)`, `var(--muted)`. Both themes work correctly.

### Supplement congrats popup
Key: `fs_supp_congrats_YYYY-MM-DD` in localStorage. Shown once per day when all supplements are taken.
Hooks must be declared before the `if (supplements.length === 0) return` guard.
