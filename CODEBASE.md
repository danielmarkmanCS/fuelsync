# FuelSync — Complete Codebase Guide

> Hybrid athlete nutrition + training PWA. Tracks macros, cycles nutrition by training type, integrates with Strava, checks weather, and uses AI (Gemini) for food estimation. 100% local-first — no backend server required.

**Last updated:** 2026-05-26

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [File Map](#3-file-map)
4. [Data Storage — IndexedDB (Dexie)](#4-data-storage--indexeddb-dexie)
5. [Shared Types](#5-shared-types)
6. [Frontend Entry Points](#6-frontend-entry-points)
7. [Screens](#7-screens)
8. [Components](#8-components)
9. [Stores (Zustand)](#9-stores-zustand)
10. [Hooks](#10-hooks)
11. [API Layer](#11-api-layer)
12. [Utilities](#12-utilities)
13. [Business Logic — Nutrition Engine](#13-business-logic--nutrition-engine)
14. [Business Logic — Weather Service](#14-business-logic--weather-service)
15. [Security — PIN System](#15-security--pin-system)
16. [Cloudflare Worker — AI (Gemini)](#16-cloudflare-worker--ai-gemini)
17. [Cloudflare Worker — Strava OAuth](#17-cloudflare-worker--strava-oauth)
18. [Infrastructure — Docker + Nginx](#18-infrastructure--docker--nginx)
19. [Design System](#19-design-system)
20. [Key Business Rules](#20-key-business-rules)
21. [Known Pitfalls](#21-known-pitfalls)

---

## 1. Architecture Overview

```
Browser (PWA)
│
├── IndexedDB (Dexie)          ← ALL data stored locally, no login required
│   ├── profile                ← user body stats, Strava tokens
│   ├── food_logs              ← every meal entry + micronutrients
│   ├── pin_state              ← hashed PIN + lockout state
│   └── weight_logs            ← body weight history
│
├── Cloudflare Worker: fuelsync-ai
│   └── Gemini API             ← food estimation, meal suggestion, image analysis
│
└── Cloudflare Worker: fuelsync-strava
    └── Strava API             ← OAuth, activity fetch, token refresh

Deploy targets:
├── GitHub Pages (primary)     ← git push → auto Action → static site
└── Docker home server         ← docker compose build/up foodaniel
    └── nginx serves dist/     ← Cloudflare Tunnel exposes to internet
```

**Key design principle:** 100% local-first. No user account, no JWT, no backend for data. Everything in IndexedDB. The Cloudflare Workers are the only external dependencies.

**Two deploy targets — never mix them up:**
- GitHub Pages: `git push master` → GitHub Action → live in ~2 minutes
- Docker: `docker compose build foodaniel && docker compose up -d foodaniel` → live immediately; also update `nginx.conf` compat redirects with new bundle hash

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| UI Framework | **React 18** + TypeScript | Component model, hooks |
| Build Tool | **Vite** | Fast HMR, content-hashed output |
| PWA | **VitePWA** (Workbox) | Offline support, `autoUpdate` SW |
| Local DB | **Dexie.js** (IndexedDB wrapper) | Typed, promise-based local DB |
| State | **Zustand** | 4 stores: auth, app, theme, nutrition |
| AI | **Google Gemini** | Proxied via Cloudflare Worker |
| Edge Functions | **Cloudflare Workers** | Serverless, global, no cold start |
| Styling | Inline styles + `index.css` CSS vars | Dual dark/light theme |
| Font | **Outfit** (body) + **Barlow Condensed** (heroes) | Google Fonts |
| Mobile | **Capacitor** | Android APK from the same codebase |
| Running API | **Strava API v3** | OAuth activities + athlete stats |
| Weather API | **OpenWeatherMap** | Current conditions by GPS |
| Hosting | **GitHub Pages** (primary) + **Docker nginx** (secondary) | |

---

## 3. File Map

```
FuelSync/
├── Dockerfile                         ← multi-stage: Node build → nginx
├── nginx.conf                         ← SPA routing + /api proxy + compat redirects
├── CODEBASE.md                        ← this file
│
├── apps/
│   ├── web/
│   │   ├── vite.config.ts             ← build config, PWA manifest, path aliases
│   │   ├── index.css                  ← ALL design tokens, animations, typography
│   │   ├── src/
│   │   │   ├── main.tsx               ← React entry, mounts <App/>
│   │   │   ├── App.tsx                ← root shell: auth gate, tab nav, Strava OAuth
│   │   │   ├── screens/
│   │   │   │   ├── HomeScreen.tsx     ← MFP dashboard (largest file)
│   │   │   │   ├── FoodScreen.tsx     ← food log (AI, photo, manual, barcode, suggest)
│   │   │   │   ├── HistoryScreen.tsx  ← trends, charts, day-by-day history
│   │   │   │   ├── SupplementsScreen.tsx ← supplement checklist M/A/E day-period
│   │   │   │   ├── ProfileSetupScreen.tsx ← body stats, PIN, custom targets
│   │   │   │   ├── SettingsScreen.tsx ← theme toggle
│   │   │   │   ├── AuthScreen.tsx     ← first-time onboarding (profile + PIN)
│   │   │   │   └── PinScreen.tsx      ← PIN lock / unlock
│   │   │   ├── components/
│   │   │   │   ├── StravaCard.tsx     ← runs list + share card (CSS vars only)
│   │   │   │   ├── TrainingPicker.tsx ← rest/strength/cardio/hybrid selector
│   │   │   │   └── WeatherBanner.tsx  ← conditions + training alert
│   │   │   ├── store/
│   │   │   │   ├── authStore.ts       ← pinVerified, user profile
│   │   │   │   ├── appStore.ts        ← activeTab, pendingMealType
│   │   │   │   ├── themeStore.ts      ← isDark (persisted to fs_theme)
│   │   │   │   └── nutritionStore.ts  ← todayLog, targets, weeklyLoad, weather
│   │   │   ├── hooks/
│   │   │   │   └── useNutrition.ts    ← logDay, refreshWeather, getMacroBreakdown
│   │   │   ├── api/
│   │   │   │   ├── client.ts          ← workerPost/workerGet → Cloudflare Workers
│   │   │   │   ├── auth.ts            ← getProfile/createProfile/updateProfile (IndexedDB)
│   │   │   │   ├── localFood.ts       ← food CRUD + AI calls
│   │   │   │   ├── strava.ts          ← connect/disconnect/stats/refresh
│   │   │   │   └── openFoodFacts.ts   ← food search + barcode lookup
│   │   │   ├── lib/
│   │   │   │   ├── db.ts              ← Dexie schema + table interfaces
│   │   │   │   ├── pin.ts             ← PBKDF2 hash, verify, lockout, wipe
│   │   │   │   ├── recentFoods.ts     ← recent + favorites
│   │   │   │   ├── mealTemplates.ts   ← save/load meal templates
│   │   │   │   ├── recipes.ts         ← recipe builder
│   │   │   │   ├── diaryNotes.ts      ← per-day diary notes
│   │   │   │   ├── mealCalTargets.ts  ← per-meal calorie budgets
│   │   │   │   └── customTargets.ts   ← custom macro overrides
│   │   │   └── utils/
│   │   │       ├── sounds.ts          ← Web Audio API success sound (C5→E5→G5)
│   │   │       └── runShareCard.ts    ← Canvas-rendered run share card (1080×1350)
│   │   ├── capacitor.config.ts        ← Capacitor native config
│   │   └── android/                   ← generated Android project
│   │
│   └── mobile/src/
│       └── services/
│           ├── nutritionEngine.ts     ← TDEE, macro cycling, recovery score
│           └── weatherService.ts      ← OpenWeatherMap + danger alert logic
│
├── shared/types/
│   └── index.ts                       ← all TypeScript interfaces
│
└── workers/
    ├── ai/
    │   ├── index.ts                   ← Worker: /estimate /describe /suggest /analyze
    │   └── wrangler.toml
    └── strava/
        ├── index.ts                   ← Worker: /auth-url /callback /refresh /stats
        └── wrangler.toml
```

---

## 4. Data Storage — IndexedDB (Dexie)

**File:** `apps/web/src/lib/db.ts`

### Tables

#### `profile` — user body stats (single row)
```typescript
interface LocalProfile {
  id?: number;
  displayName: string;
  weightKg: number;
  heightCm: number;
  age: number;
  gender: 'male' | 'female';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
  dailyGoal: number;
  stravaAccessToken?: string;
  stravaRefreshToken?: string;
  stravaExpiresAt?: number;      // Unix timestamp
  stravaAthleteName?: string;
  stravaAthletePic?: string;
}
```

#### `food_logs` — every meal logged
```typescript
interface LocalFoodLog {
  id?: number;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight_grams: number | null;
  meal_type: string;             // 'breakfast' | 'pre_workout' | 'lunch' | etc.
  image_url: string | null;
  logged_at: string;             // ISO datetime
  date: string;                  // YYYY-MM-DD (indexed)
  removed?: boolean;             // soft-delete flag
  sync_id?: string;              // UUID for cross-device dedup
  // Micronutrients (optional):
  fiber?: number; cholesterol?: number; sodium?: number;
  vitaminC?: number; vitaminD?: number; calcium?: number; iron?: number;
}
```

#### `pin_state` — PIN lock
```typescript
interface PinState {
  id?: number;
  hash: string;                  // PBKDF2 hex
  salt: string;                  // random 16-byte salt as hex
  attempts: number;
  lockedUntil: number | null;
  totalAttempts: number;         // resets on correct PIN
  securityQuestion?: string;
  securityAnswerHash?: string;
  securityAnswerSalt?: string;
  securityAnswerAttempts?: number;
}
```

#### `weight_logs` — body weight history
```typescript
interface WeightLog { id?: number; weightKg: number; date: string; }
```

### Database Class
```typescript
class FuelSyncDB extends Dexie {
  profile:     Table<LocalProfile, number>
  food_logs:   Table<LocalFoodLog, number>
  pin_state:   Table<PinState, number>
  weight_logs: Table<WeightLog, number>
}
export const db = new FuelSyncDB(); // singleton
```

---

## 5. Shared Types

**File:** `shared/types/index.ts`

| Type | Description |
|------|-------------|
| `TrainingType` | `'rest' \| 'strength' \| 'cardio' \| 'hybrid'` |
| `IntensityLevel` | `'low' \| 'moderate' \| 'high'` |
| `UserProfile` | Body stats: weightKg, heightCm, age, sex, activityLevel, goals |
| `DailyLog` | Training context: date, trainingType, plannedWorkoutTime, intensity |
| `MacroTargets` | `{ calories, proteinG, carbsG, fatG, carbTimingWindow? }` |
| `MacroBreakdown` | Full engine result: TDEE + targets + rationale |
| `WeatherConditions` | `{ tempC, humidity, uvIndex, description, city, timestamp }` |
| `EnvironmentAlert` | `{ level, message, suggestedPivot?, extraHydrationMl? }` |
| `WeeklyLoad` | totalRunKm, totalStrengthSets, legFatigueScore, recoveryScore, loggedRuns[] |
| `LoggedRun` | `{ km, name, source: 'strava' \| 'manual' }` |

---

## 6. Frontend Entry Points

### `apps/web/src/main.tsx`
Mounts `<App/>` inside React StrictMode into `#root`.

### `apps/web/src/App.tsx`
Root component. Controls the entire app lifecycle.

**Startup flow:**
1. Loading spinner
2. `getProfile()` from IndexedDB
3. If profile → check `hasPin()` → show `<PinScreen/>` if needed
4. If no profile → show `<AuthScreen/>` (first-time setup)
5. After auth + PIN verified → main 6-tab navigation

**Theme management:**
Reads from `themeStore`, sets `document.body.setAttribute('data-theme', ...)` on every change.

**Strava OAuth:**
Detects `?strava_access_token=...` URL params after Worker redirect → saves to IndexedDB → clears URL.

**Tab navigation:** HOME / DIARY / TRENDS / SUPPS / PROFILE / SETTINGS — fixed bottom nav.

### `apps/web/vite.config.ts`
- Path aliases: `@shared` → `../../shared`, `@mobile` → `../mobile/src`
- VitePWA: `autoUpdate` SW, AI/Strava Worker URLs are `NetworkOnly` (never cached)
- PWA manifest: "FuelSync", standalone, portrait

---

## 7. Screens

### `HomeScreen.tsx` — MFP Dashboard

The main dashboard. Date-navigable (past days) with a single scrollable column.

**Sections (top → bottom):**

1. **Top bar** — `< Date >` arrows + training badge + gear → Settings

2. **Calorie Dashboard** — MFP-style equation:
   `Goal − Food + Exercise = Remaining` displayed as a 4-column grid. SVG progress ring in center. Progress bar below.

3. **Macro Row** — 3 cards: Carbs / Fat / Protein. Each shows `consumed / target` with a fill bar.

4. **Today's Training** (today only) — `<TrainingPicker/>` for Rest/Strength/Cardio/Hybrid + NEAT modifier.

5. **Food Diary** — Per-meal accordion sections:
   - Meals: Breakfast · Pre-Workout · Lunch · Post-Workout · Dinner · Snacks
   - Items displayed paragraph-style (no inner scroll, flows into page scroll)
   - Each item: name wraps + colored macro chips below (P=#38BDF8 C=#22C55E F=#F59E0B)
   - Meal total row at bottom with border-top
   - `+ ADD FOOD` button → sets `pendingMealType` in appStore → switches to DIARY tab

6. **Supplements** (today only) — from `SupplementBlock` sub-component. Checklist with M/A/E day-period. Congrats popup when all taken. **IMPORTANT:** All hooks must be declared BEFORE the `supplements.length === 0` early return.

7. **Strava Card** — `<StravaCard/>` (today only)

8. **Weekly Load** (today only)

Past-day navigation: shows "Back to Today" CTA; hides training/supplements/Strava/weekly blocks.

---

### `FoodScreen.tsx` — Food Log

Most complex screen. Four logging modes in a bottom sheet.

**Food list (main view):**
- Entries grouped by meal type
- Blue FAB (+) to open sheet
- Undo toast for deletes (5-second window)

**Modes (tabs: AI / Photo / Manual / Suggest):**

#### AI Mode
Free text → `estimateByDescription()` → Gemini `/describe` → fills Manual form.

#### Photo Mode
Camera `<input type="file" capture="environment">` → base64 → `analyzeByImage()` → fills form.

#### Manual Mode
Direct entry: name, weight (g or qty toggle), P/C/F.
- `patch()` central updater: rescales macros proportionally when weight changes in g mode
- Calorie auto-calc: `P×4 + C×4 + F×9` live
- Validation (`validateEntry()`): checks ±12% calorie match, total macros ≤ weight×1.1, no macro >95%
- `MealChips`: breakfast/pre_workout/lunch/post_workout/dinner/snack selector

#### Suggest Mode
Context (time + size) → `suggestMeal()` → Gemini `/suggest` → shows meal name + ingredient list → log all at once.

---

### `HistoryScreen.tsx` — Trends

Browse past days. Per-day macro summary cards (expandable). Streak counter. Progress charts.

**Dual-variable pattern** (avoids template-literal CSS var bug):
```js
const barColor    = pct >= 110 ? RED : pct >= 85 ? GREEN : ORANGE;      // direct color:
const barColorHex = pct >= 110 ? RED : pct >= 85 ? GREEN : ORANGE_HEX;  // template literals
background: `linear-gradient(135deg, ${barColorHex}18 0%, var(--surf) 50%)`,
```

---

### `SupplementsScreen.tsx` — Supplements

Daily supplement checklist. M/A/E day-period checkboxes (Morning/Afternoon/Evening). Tap to log taken time. Daily congrats popup when all taken (once per day, `fs_supp_congrats_YYYY-MM-DD` key).

No strikethrough on taken supplements — just color transition.

---

### `ProfileSetupScreen.tsx` — Profile & Stats

Edit body stats, display name, activity level, daily calorie goal. Change/clear PIN. Custom macro targets.

---

### `SettingsScreen.tsx` — Settings

Dark/Light theme toggle via `themeStore`. Profile shortcuts.

---

### `AuthScreen.tsx` — First-time Onboarding

Shown when no profile in IndexedDB. Collects display name, weight, height, age, gender, activity level, calorie goal. Prompts PIN setup after profile creation.

---

### `PinScreen.tsx` — PIN Lock

4-digit numpad. Tracks attempts, applies tiered lockouts, wipes DB after 15 total failures. "Forgot PIN?" → security question flow.

---

## 8. Components

### `StravaCard.tsx`
Full Strava UI: loading / not-connected / connected states. Connected view: athlete name, weekly km, run list, disconnect button.

**`RunRow`:** distance, name, date, pace, HR. Log button (`addRunKm()`). Share button → Canvas 1080×1350 image → Web Share API.

**Theme compliance:** All colors use CSS vars (`var(--surf)`, `var(--surf2)`, `var(--edge)`, `var(--text)`, `var(--muted)`). BLUE for run/pace = `#2F81F7` (hardcoded since it's a brand color, not a theme token). `borderRadius: 8` throughout.

### `TrainingPicker.tsx`
Four mode buttons: Rest, Strength, Cardio, Hybrid. `onSelect(type)` triggers `logDay()` in HomeScreen.

### `WeatherBanner.tsx`
Current conditions with color-coded alert level (none/caution/danger). Shows temp, humidity, UV, alert message, hydration recommendation.

---

## 9. Stores (Zustand)

### `authStore.ts`
```typescript
interface AuthState {
  user: BackendUser | null;
  pinVerified: boolean;          // sessionStorage key 'fuelsync_pin_verified'
  setUser(u): void
  setPinVerified(v): void
  logout(): void
}
```

### `appStore.ts`
```typescript
interface AppState {
  activeTab: AppTab;
  pendingMealType: string | null;   // pre-selects meal type when navigating Home → Diary
  setActiveTab(tab): void
  setPendingMealType(meal): void
}
```

### `themeStore.ts`
```typescript
interface ThemeState {
  isDark: boolean;                  // persisted to localStorage key 'fs_theme'
  toggleTheme(): void
}
```

### `nutritionStore.ts`
Persisted to `localStorage` key `fuelsync-nutrition-v2`. Only `weeklyLoad` and `todayLog` persist; everything else recomputed on mount.

```typescript
interface NutritionState {
  todayLog: DailyLog | null
  targets: MacroTargets | null
  weeklyLoad: WeeklyLoad
  weather: WeatherConditions | null
  environmentAlert: EnvironmentAlert | null
  // Actions:
  setTargets(targets): void
  setTodayLog(log): void
  setWeather(weather, alert): void
  addRunKm(km, name, source): void
  removeRunKm(km, name): void
  renameRun(idx, newName): void
  resetWeeklyRuns(): void
  logWorkoutComplete(km, sets): void
  resetDay(): void
  resetAll(): void
}
```

---

## 10. Hooks

### `useNutrition.ts`
The main hook. Used by all screens.

| Value | Description |
|-------|-------------|
| `profile` | `UserProfile` from authStore (null if body stats incomplete) |
| `todayLog` | From nutritionStore |
| `targets` | From nutritionStore (computed macros) |
| `weeklyLoad` | From nutritionStore |
| `weather` | From nutritionStore |
| `environmentAlert` | From nutritionStore |
| `logDay(type, time?)` | Picks training type, computes macros, saves targets, checks leg fatigue gate |
| `refreshWeather()` | GPS → OpenWeatherMap → evaluates alert → saves to store |
| `getMacroBreakdown()` | Returns full `MacroBreakdown` including carb timing window |
| `logWorkoutComplete(km, sets)` | Updates weekly load |

---

## 11. API Layer

### `client.ts` — Worker HTTP Client
```typescript
workerPost<T>(worker, path, body): Promise<T>   // POST with JSON body
workerGet<T>(worker, path):        Promise<T>   // GET request
```
`AI_WORKER` and `STRAVA_WORKER` from Vite env vars.

### `auth.ts` — Profile CRUD
```typescript
getProfile(): Promise<BackendUser | null>
createProfile(data): Promise<BackendUser>
updateProfile(data): Promise<BackendUser>
clearProfile(): Promise<void>
```

### `localFood.ts` — Food Log CRUD + AI
```typescript
getLogs(date: string): Promise<FoodLog[]>
getAllLogs(): Promise<FoodLog[]>
addLog(entry): Promise<FoodLog>
deleteLog(id: string): Promise<void>
softDeleteLog(id): Promise<void>
unremoveLog(id): Promise<void>
estimateByWeight(name, grams): Promise<AIEstimate>
estimateByDescription(desc): Promise<AIEstimate>
suggestMeal(context, size): Promise<AIEstimate>
analyzeByImage(file): Promise<AIEstimate>
```

### `strava.ts` — Strava Integration
```typescript
getStravaAuthUrl(): Promise<{ url: string }>
connectStrava(tokens): Promise<{...}>
getStravaStats(): Promise<StravaData>
disconnectStrava(): Promise<{ connected: false }>
```
Token refresh logic: checks `stravaExpiresAt` before every call; calls Worker `/refresh` if expired; saves new tokens to IndexedDB.

---

## 12. Utilities

### `sounds.ts`
```typescript
playFoodLogSound(): void   // C5 → E5 → G5 ascending arpeggio, Web Audio API, ~0.5s
```

### `runShareCard.ts`
```typescript
generateRunCard(run, photo?): HTMLCanvasElement   // 1080×1350px canvas
shareRunCard(run, photoFile?): Promise<void>      // generates + shares (Web Share API) or downloads
```
Canvas: top 58% = photo zone, bottom 42% = dark panel with stats.

---

## 13. Business Logic — Nutrition Engine

**File:** `apps/mobile/src/services/nutritionEngine.ts`

Pure functions, no side effects.

### `calcBMR(profile)` → number
Mifflin-St Jeor: `10×weight + 6.25×height − 5×age + (5 male / −161 female)`

### `calcTDEE(profile)` → number
`BMR × activityMultiplier` (sedentary=1.2, light=1.375, moderate=1.55, very_active=1.725, extra_active=1.9)

### `computeMacros(profile, log, weeklyLoad)` → MacroBreakdown

| Type | Cal adj | P/C/F split |
|------|---------|-------------|
| rest | ×0.85 | 30/20/50 |
| strength | ×1.05 | 38/35/27 |
| cardio | ×1.10 | 25/55/20 |
| hybrid | ×1.08 | 32/43/25 |

If `recoveryScore < 40`: additional −5% calories.

### `buildCarbTimingWindow(plannedWorkoutTime, totalCarbsG, type)`
±2h around workout. Cardio = 60% daily carbs in window; other = 50%.

### `checkLegFatigueGate(load, log)` → { blocked, message? }
Blocked if `legFatigueScore >= 70` and cardio day.

### `updateWeeklyLoad(current, log, { addKm, addSets })` → WeeklyLoad
- Cardio: up to +20 fatigue points (proportional to km)
- Strength: +1.2 per set
- Rest: −15 fatigue points

---

## 14. Business Logic — Weather Service

**File:** `apps/mobile/src/services/weatherService.ts`

### `fetchWeather(lat, lon, apiKey)` → WeatherConditions
OpenWeatherMap `/data/2.5/weather` with metric units.

### `evaluateEnvironment(weather, plannedType)` → EnvironmentAlert
Thresholds: danger temp ≥36°C, high temp ≥30°C, danger humidity ≥90%, high UV ≥8.

---

## 15. Security — PIN System

**File:** `apps/web/src/lib/pin.ts`

PBKDF2-SHA256, 100,000 iterations, 16-byte random salt per PIN (Web Crypto API).

| Function | Description |
|----------|-------------|
| `setupPin(pin)` | Hash + store PIN |
| `hasPin()` | Check if PIN set |
| `verifyPin(pin)` | Hash + compare; track attempts |
| `resetPin(newPin)` | Update hash/salt, reset counters |
| `clearPin()` | Remove PIN completely |
| `setupSecurityQuestion(q, a)` | Hash answer, store with question |
| `verifySecurityAnswer(answer)` | Same lockout flow |

**Lockout tiers:**

| Total wrong attempts | Lockout |
|----------------------|---------|
| 3 | 30 seconds |
| 6 | 5 minutes |
| 10 | 30 minutes |
| **15** | **Full database wipe** |

---

## 16. Cloudflare Worker — AI (Gemini)

**File:** `workers/ai/index.ts`  
**Model cascade:** `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.0-flash-lite` → `gemini-2.5-flash-lite`

### Endpoints

| Endpoint | Input | Description |
|----------|-------|-------------|
| `POST /estimate` | `{ food_name, weight_grams }` | Macro estimate for known food at weight |
| `POST /describe` | `{ description }` | Free-text meal → macros |
| `POST /suggest` | `{ context, size }` | Suggest a meal for athlete context |
| `POST /analyze` | `{ base64, mimeType }` | Food photo → macro estimate |

**Response schema (MACRO_SCHEMA):**
```json
{
  "food_name": "string",
  "estimated_weight_grams": number,
  "calories": number, "protein": number, "carbs": number, "fat": number,
  "confidence": "high|medium|low",
  "ingredients": [{ "name", "amount", "calories", "protein", "carbs", "fat" }]
}
```

CORS: allows the app URL + `http://localhost*`. Handles OPTIONS preflight.

**Deploy:**
```bash
cd workers/ai && npx wrangler deploy
```

---

## 17. Cloudflare Worker — Strava OAuth

**File:** `workers/strava/index.ts`

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /auth-url` | Returns Strava OAuth URL |
| `GET /callback` | Exchanges code for tokens, redirects to app with tokens in URL params |
| `POST /refresh` | Input: `{ refresh_token }` → new access token |
| `POST /stats` | Input: `{ access_token }` → runs, weekly km, athlete profile |

App.tsx detects token params in URL after callback, saves to IndexedDB, clears URL.

**Deploy:**
```bash
cd workers/strava && npx wrangler deploy
```

---

## 18. Infrastructure — Docker + Nginx

### `Dockerfile` — Multi-stage Build
**Stage 1:** Node 20 Alpine → `npm ci` → `npm run build` → `apps/web/dist/`  
**Stage 2:** nginx Alpine → copies `dist/` + `nginx.conf` → exposes port 80

### `nginx.conf`
```
/api/     → proxy to foodaniel-backend:3000/ (legacy, not used by PWA)
/uploads/ → proxy to foodaniel-backend:3000/uploads/
/assets/  → 1 year cache, immutable (content-hashed by Vite)
/         → try_files $uri $uri/ /index.html (SPA fallback, no-cache)
```

**Compat redirects:** After each build, old bundle hash → new bundle hash:
```nginx
location = /assets/index-<old>.js { rewrite ^ /assets/index-<new>.js last; }
```
This handles Cloudflare caching stale HTML that references the previous bundle.

### Deploy flow
```bash
cd /mnt/data/projects/mmswebsite
docker compose build foodaniel && docker compose up -d foodaniel
# Add old hash to nginx.conf compat redirects, then rebuild
```

---

## 19. Design System

**File:** `apps/web/src/index.css`

### CSS Variables — Dark Theme (default)
```css
--bg:     #0D1117    /* page background */
--surf:   #161B22    /* cards */
--surf2:  #1C2128    /* nested cards */
--edge:   #21262D    /* borders */
--edge2:  #30363D    /* stronger borders */
--text:   #F0F3F6    /* primary text */
--muted:  #8B949E    /* labels */
--muted2: #6E7681    /* secondary muted */
--accent: #2F81F7    /* primary CTA */
--accent2:#1971E8    /* hover */
--prot:   #38BDF8    /* protein — blue */
--carb:   #22C55E    /* carbs — green */
--fat:    #F59E0B    /* fat — amber */
--red:    #EF4444    /* danger */
```

### CSS Variables — Light Theme (`body[data-theme="light"]`)
```css
--bg:     #E4E7EB
--surf:   #F2F4F6
--surf2:  #E9ECF0
--edge:   #D0D4DA
--text:   #1A1F26
--muted:  #586069
--accent: #0066EE
--accent2:#0055CC
/* Macro colors unchanged in light theme */
```

### Typography
| Class | Style |
|-------|-------|
| `.nrc-hero` / `.hero` | Barlow Condensed 800, −1px letter-spacing |
| `.nrc-label` / `.label` | Outfit 600, 11px, 1.2px tracking, uppercase, `var(--muted)` |
| `.t-title` | 17px 700 |
| `.t-headline` | 15px 600 |
| `.t-body` | 14px 400 |
| `.t-label` | 11px 600, uppercase, 1.2px tracking |
| `.t-caption` | 12px 400, `var(--muted)` |

### Interactions
```css
.nrc-press / .press → scale(0.96) on :active
```

### Animations
```css
@keyframes slideUp    /* entrance: 0.25s ease */
@keyframes fadeIn
@keyframes pulse      /* 50% opacity toggle */
@keyframes shimmer    /* loading skeleton */
@keyframes ringPop    /* scale 0.94 → 1 */
@keyframes barFillAni /* width 0 → target */

.a { animation: slideUp 0.25s var(--ease) both; }
```

---

## 20. Key Business Rules

### Macro Validation (`validateEntry()`)
1. `P×4 + C×4 + F×9` within **±12%** of stated calories
2. `P + C + F` ≤ `weight_grams × 1.1`
3. No single macro > `weight_grams × 0.95`

### Calorie Auto-Calculation
As user types P/C/F: `calories = P×4 + C×4 + F×9` updates live.

### Proportional Macro Scaling
When weight changes in g mode and `basePerGram` is set from a prior AI estimate, macros scale proportionally.

### Carb Timing Window
Only when training type ≠ rest AND workout time set. Cardio = 60% carbs ±2h around workout; others = 50%.

### Leg Fatigue Gate
Triggers for cardio when `legFatigueScore >= 70`. User can override via confirm dialog.

### Strava Token Auto-Refresh
`refreshIfNeeded()` checks expiry before every API call. If expired → Worker `/refresh` → saves new tokens to IndexedDB. Client secret never touches browser.

### Recovery Score
- Rest/low intensity: +10
- Moderate: −5
- High: −15
- When below 40: macro engine reduces calories by additional 5%

---

## 21. Known Pitfalls

### Template-literal + CSS var hex-opacity
```js
// BROKEN: produces 'var(--accent)08' — invalid CSS
const C = 'var(--accent)';
background: `${C}08`

// CORRECT: keep two constants
const ORANGE     = 'var(--accent)';      // for direct color: props
const ORANGE_HEX = '#2F81F7';            // for template literals
background: `${ORANGE_HEX}08`           // ✓ valid hex + opacity suffix
```

### React Hooks ordering
Any `useEffect` AFTER an early `return` creates a conditional hook call → "Rendered fewer hooks than expected" crash → blank screen. **All hooks must come before any early return.**

### Inner scroll trapping touch events (mobile)
A child element with `overflowY: 'auto'` captures the touch scroll event on mobile, preventing the page from scrolling past it. Avoid inner scroll containers unless essential. The food diary uses paragraph layout with natural page scroll.

### StravaCard light mode compatibility
All colors must use CSS vars, not hardcoded dark hex values. When adding colors to StravaCard, always use `var(--surf)`, `var(--text)`, `var(--muted)`, `var(--edge)` etc.

### nginx compat redirects after Docker deploy
Each Vite build changes the content-hash of the JS bundle filename. If Cloudflare caches the old HTML, users get a 404 for the old JS file. Solution: add the old hash as a redirect in `nginx.conf` before rebuilding.
