# FuelSync — Hybrid Athlete Nutrition OS

> Local-first nutrition & training PWA for hybrid athletes.  
> Tracks macros, food logs, weight, supplements, Strava runs, and weather — fully offline, optionally synced via Cloudflare.

**Live app:** [danielmarkman.github.io/FuelSync](https://danielmarkman.github.io/FuelSync) · **Docker:** [foodaniel.danielmms.site](https://foodaniel.danielmms.site)

---

## Stack at a Glance

| Layer | Technology | Why |
|-------|-----------|-----|
| UI | React 18 + TypeScript + Vite | Fast HMR, strict types, small bundles |
| PWA | vite-plugin-pwa + Workbox | Installable, offline-capable, auto-update |
| Android APK | Capacitor | Native shell around the same Vite build |
| Local storage | Dexie.js (IndexedDB) | True persistence; works offline without a server |
| State | Zustand + `persist` | Minimal boilerplate; localStorage/sessionStorage sync |
| Cloud sync | Cloudflare Workers + D1 | Edge SQLite; free tier handles personal use |
| AI | Google Gemini via CF Worker | Food estimation, barcode assist, meal suggestions |
| Strava | Cloudflare Worker proxy | Hides client secret; token refresh handled server-side |
| Styling | CSS custom properties | One source of truth for dark/light + 5 accent colors |

---

## Project Structure

```
FuelSync/
├── apps/web/                   ← The entire app (Vite + React)
│   ├── src/
│   │   ├── App.tsx             ← Boot logic, auth gate, tab nav, theme wiring
│   │   ├── index.css           ← Design system (CSS vars, animations, typography)
│   │   ├── main.tsx            ← React entry point
│   │   │
│   │   ├── screens/            ← Full-page views (one per tab)
│   │   │   ├── HomeScreen.tsx         — Calorie ring, macros, training picker, water, diary
│   │   │   ├── FoodScreen.tsx         — AI smart mode, manual log, barcode, templates, recipes
│   │   │   ├── HistoryScreen.tsx      — Weekly chart, weight trend, macro averages, food directory
│   │   │   ├── SupplementsScreen.tsx  — Supplement checklist with timing groups
│   │   │   ├── SettingsScreen.tsx     — Theme, accent color, units toggle
│   │   │   ├── ProfileSetupScreen.tsx — Body stats, custom targets, Google sync, Strava
│   │   │   ├── GoogleAuthScreen.tsx   — Google Sign-In + token paste pairing
│   │   │   ├── PinScreen.tsx          — PIN entry with lockout
│   │   │   └── AuthScreen.tsx         — First-run onboarding
│   │   │
│   │   ├── components/         ← Shared UI components
│   │   │   ├── MacroBar.tsx           — Horizontal progress bar
│   │   │   ├── RingProgress.tsx       — SVG calorie ring
│   │   │   ├── StravaCard.tsx         — Strava OAuth + run share card
│   │   │   ├── TrainingPicker.tsx     — Rest/Strength/Cardio/Hybrid selector
│   │   │   └── WeatherBanner.tsx      — Heat/cold/rain alerts
│   │   │
│   │   ├── api/                ← Data access layer
│   │   │   ├── localFood.ts           — Food CRUD + D1 sync + offline queue (core)
│   │   │   ├── syncClient.ts          — D1 Worker HTTP calls (auth, profile, supplements)
│   │   │   ├── auth.ts                — Local profile CRUD via Dexie
│   │   │   ├── strava.ts              — Strava token store + stats fetch
│   │   │   ├── openFoodFacts.ts       — Barcode lookup (OFF) + text search (USDA)
│   │   │   └── client.ts              — workerPost/workerGet helpers
│   │   │
│   │   ├── store/              ← Zustand stores
│   │   │   ├── authStore.ts           — user, pinVerified
│   │   │   ├── nutritionStore.ts      — todayLog, weeklyLoad, targets (persisted)
│   │   │   ├── themeStore.ts          — isDark, accentKey, units (persisted)
│   │   │   └── appStore.ts            — activeTab
│   │   │
│   │   ├── hooks/
│   │   │   ├── useNutrition.ts        — Main orchestrator: training state, macros, weather
│   │   │   └── useEffectiveTargets.ts — Applies custom targets + goal adjustments
│   │   │
│   │   ├── services/           ← Business logic (pure, no UI)
│   │   │   ├── nutritionEngine.ts     — computeMacros, checkLegFatigueGate, updateWeeklyLoad
│   │   │   └── weatherService.ts      — fetchWeather, evaluateEnvironment
│   │   │
│   │   ├── lib/                ← Utilities & local data helpers
│   │   │   ├── db.ts                  — Dexie schema (7 tables, version 6)
│   │   │   ├── pin.ts                 — PBKDF2-SHA256 PIN hash/verify/lockout/wipe
│   │   │   ├── recentFoods.ts         — Recent + favorite foods (localStorage)
│   │   │   ├── mealTemplates.ts       — Saved meal templates
│   │   │   ├── recipes.ts             — Multi-ingredient recipes
│   │   │   ├── mealCalTargets.ts      — Per-meal calorie targets
│   │   │   └── customTargets.ts       — User override for macro targets
│   │   │
│   │   └── utils/
│   │       ├── sounds.ts              — Web Audio API: C5→E5→G5 chord on food log
│   │       └── runShareCard.ts        — Canvas share card for Strava runs
│   │
│   ├── android/                ← Capacitor Android project (auto-generated)
│   ├── public/                 ← Static assets (icons, CNAME)
│   ├── capacitor.config.ts
│   ├── vite.config.ts
│   └── index.html
│
├── workers/                    ← Cloudflare Workers (deployed independently)
│   ├── sync/index.ts           — Auth, profile, food logs, supplements, weight, pairing
│   ├── ai/index.ts             — Gemini proxy: estimate, describe, analyze, steps, suggest
│   └── strava/index.ts         — Strava OAuth callback, token refresh, stats
│
├── shared/
│   └── types/index.ts          ← Shared TypeScript types (MacroTargets, TrainingType, etc.)
│
├── .github/workflows/deploy.yml ← Auto-deploys to GitHub Pages on push to master
├── Dockerfile                   ← Multi-stage: Vite build → nginx static (for Docker deploy)
├── nginx.conf                   ← SPA fallback
└── fuelsync.apk                 ← Latest Android APK
```

---

## Key Features

### 🍽️ Food Logging (3 modes)
1. **AI Smart** — describe in plain text → Gemini fills the form
2. **Manual** — name + weight + macros, with optional AI estimate
3. **Barcode** — scan product barcode → Open Food Facts lookup

Plus: recent foods, favorites, meal templates, multi-ingredient recipes.

### 🏋️ Macro Cycling
Training type drives macro targets:
| Type | Focus |
|------|-------|
| Rest | High fat, low carb |
| Strength | High protein |
| Cardio | High carb |
| Hybrid | Balanced |

Engine: Mifflin-St Jeor BMR → TDEE (activity multiplier) → NEAT weather adjustment.

### 📊 History & Analytics
- Weekly calorie chart
- Weight trend (kg or lbs)
- 7-day macro averages vs targets
- Full food directory with search

### 💊 Supplements
Timed checklist: Morning / Pre-workout / Post-workout / Evening. Synced to cloud.

### 🔒 PIN Security
PBKDF2-SHA256 (100k iterations). 3 wrong = 30s lockout. 15 cumulative wrong = full data wipe.

### ☁️ Cloud Sync (optional)
Google Sign-In or token pairing. Profile, food logs, weight, supplements all sync to Cloudflare D1.

**Sync rules:**
- Profile: D1 always wins on pull; push only when user clicks Save
- Food logs: local-first merge; soft-delete with tombstone propagation across devices

---

## Screens Overview

| Screen | Tab | What it does |
|--------|-----|-------------|
| HomeScreen | 🏠 Home | Calorie ring, macro bars, training picker, water tracker, today's food diary, supplements quick-view |
| FoodScreen | 🍎 Food | Add food (AI/manual/barcode), log list, templates, recipes, per-meal calorie targets |
| HistoryScreen | 📈 History | Weekly chart, weight trend, macro averages, day-by-day breakdown, food search |
| SupplementsScreen | 💊 Supps | Add/edit supplements, daily check-in by timing |
| SettingsScreen | ⚙️ Settings | Dark/light mode, 5 accent colors, metric/imperial toggle |
| ProfileSetupScreen | 👤 Profile | Body stats, goal mode, custom targets, Google sync, device pairing, Strava connect |

---

## Cloudflare Workers

| Worker | URL | Purpose |
|--------|-----|---------|
| `fuelsync-sync` | `fuelsync-sync.danielmarkman.workers.dev` | All data sync (D1 database) |
| `fuelsync-ai` | `fuelsync-ai.danielmarkman.workers.dev` | Gemini AI proxy |
| `fuelsync-strava` | `fuelsync-strava.danielmarkman.workers.dev` | Strava OAuth + stats |

### D1 Database Tables
```sql
users           — id, email, display_name, google_id, daily_goal
user_profile    — weight_kg, height_cm, age, gender, activity_level, strava tokens
food_logs       — id (sync_id), user_id, food_name, calories, protein, carbs, fat,
                  weight_grams, meal_type, logged_at, deleted_at
weight_logs     — id, user_id, weight_kg, date, sync_id
supplements     — id, user_id, name, dose, unit, timing, active, sync_id
supplement_logs — id, user_id, supplement_id, date, taken, sync_id
training_state  — user_id, date, state_json (todayLog + weeklyLoad blob)
pairing_codes   — code, session_token, expires_at
```

---

## Deploy

### GitHub Pages (auto)
```bash
git push origin master
# → .github/workflows/deploy.yml builds with Vite + secrets → deploys
```

### Docker (home server)
```bash
cd /mnt/data/projects/mmswebsite
docker compose build foodaniel && docker compose up -d foodaniel
```

### Cloudflare Workers
```bash
cd /mnt/data/FuelSync/workers/sync   # or /ai or /strava
npx wrangler deploy
```

### Android APK
```bash
cd /mnt/data/FuelSync/apps/web
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/fuelsync-debug.apk /mnt/data/FuelSync/fuelsync.apk
```

---

## Design System

CSS custom properties for full theming:

```css
/* Surfaces */
--bg        /* page background */
--surf      /* card background */
--surf2     /* nested card */
--edge      /* card borders */

/* Text */
--text      /* primary */
--muted     /* secondary labels */
--muted2    /* tertiary */

/* Accent (changes per user choice) */
--accent        /* primary accent */
--accent2       /* same as accent (alias) */
--accent-muted  /* accent at low opacity */
```

**5 accent colors:** Ocean `#2F81F7` · Forest `#22C55E` · Galaxy `#A78BFA` · Ember `#F97316` · Crimson `#EF4444`

**Typography:** Inter 400–900 · tight letter-spacing · no italic

**Key classes:**
- `.nrc-hero` — Inter 900, letter-spacing -2px (big numbers)
- `.nrc-label` — Inter 700, 9px, 3px tracking, uppercase
- `.nrc-press` — scale(0.96) on `:active`
- `.nrc-a1–a6` — staggered slide-up entrance animations

---

## Environment Variables

### `apps/web/.env.local` (dev)
```env
VITE_AI_WORKER_URL=https://fuelsync-ai.danielmarkman.workers.dev
VITE_STRAVA_WORKER_URL=https://fuelsync-strava.danielmarkman.workers.dev
VITE_SYNC_WORKER_URL=https://fuelsync-sync.danielmarkman.workers.dev
VITE_OPENWEATHER_KEY=...
VITE_GOOGLE_CLIENT_ID=...
```

### `apps/web/.env.production` (Docker build)
Same keys, same values (Cloudflare Workers are the same in both envs).

### GitHub Secrets (for Pages deploy)
Same 5 variables, set in repo Settings → Secrets.

---

## Local Dev

```bash
cd apps/web
npm install
npm run dev          # → http://localhost:5173
```

Workers dev:
```bash
cd workers/sync
npx wrangler dev     # → http://localhost:8787
```

---

## Adding Something New

| What | Where to touch |
|------|---------------|
| New screen | `src/screens/`, add tab in `appStore.ts`, wire in `App.tsx` |
| New D1 table | `workers/sync/schema.sql` + `workers/sync/index.ts` routes + `src/api/syncClient.ts` |
| New local table | `src/lib/db.ts` — increment version, add `this.version(N).stores({})` |
| New Gemini feature | `workers/ai/index.ts` + new route in `src/api/localFood.ts` or new util |
| New Zustand store | `src/store/newStore.ts` + import in relevant screens |
| New accent color | `src/store/themeStore.ts` → `ACCENT_COLORS` map + `AccentKey` type |
| New CSS var | `src/index.css` in `:root {}` and `body[data-theme="light"] {}` |
