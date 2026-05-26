# FuelSync — Hybrid Athlete Nutrition & Training PWA
**Current stack:** React 18 + Vite + TypeScript · Capacitor (Android APK) · Zustand · Dexie (IndexedDB) · PWA

---

## Architecture (Local-first, no backend required)

| Layer | Location | Notes |
|-------|----------|-------|
| Web app | `apps/web/src/` | Vite SPA, served by nginx in Docker |
| Android APK | `apps/web/android/` | Capacitor wrapper around the web app |
| Local DB | Dexie (IndexedDB) | All food/supplement/weight data stored on-device |
| Sync (optional) | Cloudflare Workers D1 | `apps/web/src/api/syncClient.ts` |
| Docker deploy | `/mnt/data/projects/mmswebsite/` | `docker compose build foodaniel && docker compose up -d foodaniel` |

---

## Screens & Navigation (`App.tsx`)

6-tab bottom nav: **HOME · DIARY · TRENDS · SUPPS · PROFILE · SETTINGS**

| Tab | Screen | Key purpose |
|-----|--------|-------------|
| home | `HomeScreen.tsx` | MFP-style dashboard — date nav, calorie equation, per-meal sections |
| food | `FoodScreen.tsx` | Food logging (AI Smart + Manual), barcode scan, recipes |
| history | `HistoryScreen.tsx` | Progress charts, run history, weight trends |
| supplements | `SupplementsScreen.tsx` | Daily supplement checklist (M/A/E day-period) |
| profile | `ProfileSetupScreen.tsx` | Body stats, calorie goal, activity level, custom targets |
| settings | `SettingsScreen.tsx` | Dark/Light theme toggle, profile shortcuts |

---

## Design System — Dual Theme (Light/Dark)

### Theme Store
`src/store/themeStore.ts` — Zustand + persist (`fs_theme` localStorage key)
```ts
const { isDark, toggleTheme } = useThemeStore();
```

### CSS Variables (`src/index.css`)
All components use `var(--bg)`, `var(--surf)`, `var(--edge)`, `var(--text)`, `var(--muted)`, `var(--accent)`.

**Dark (default — Volt/Lando):**
```
--bg:#050505  --surf:#111111  --edge:#2A2A2A  --text:#FFFFFF  --accent:#DFFF00
```
**Light (MFP Classic):**
```
--bg:#F8F9FA  --surf:#FFFFFF  --edge:#E0E0E0  --text:#111111  --accent:#0066EE
```

Theme is applied via `body[data-theme="light"]` CSS override block.
`App.tsx` sets `document.body.setAttribute('data-theme', isDark ? 'dark' : 'light')` on every change.

### Typography (preserved from original)
```
Font: Outfit (body), Barlow Condensed (headings/numbers)
.nrc-hero / .hero  → Barlow Condensed 900, tight tracking
.nrc-label / .label → 10px 700 uppercase, 1.5px spacing
.nrc-press / .press → scale(0.96) on :active
```

### Macro colors (static, both themes)
```
--prot: #FF6B35  --carb: #38BDF8  --fat: #A78BFA  --red: #FF4444
```

---

## HomeScreen — MFP Layout

### Sections (top → bottom)
1. **Top bar** — `< Date >` navigation arrows + gear icon → Settings; training type badge
2. **Calorie Dashboard** — `Goal − Food + Exercise = Remaining` equation grid + centered SVG ring + progress bar
3. **Macro Row** — 3 cards: Carbs / Fat / Protein (consumed/target + fill bar)
4. **Food Diary** — Per-meal section cards (Breakfast · Pre-WO · Lunch · Post-WO · Dinner · Snacks)
   - Each shows logged items (name + P/C/F + calories)
   - `+ ADD FOOD` button pre-selects meal type in FoodScreen via `setPendingMealType(meal)`
5. **Training Selector** (today only) — Rest / Strength / Cardio / Hybrid + NEAT modifier
6. **Supplements** (today only) — Checklist with M/A/E day-period stamps
7. **Strava Card** (today only)
8. **Weekly Load** (today only) — km / sessions / recovery%

Past-day navigation hides today-only sections and shows "Back to Today" CTA.

---

## Store Map

| Store | File | Key state |
|-------|------|-----------|
| Auth | `store/authStore.ts` | `user`, `pinVerified` |
| App | `store/appStore.ts` | `activeTab` (AppTab), `pendingMealType` |
| Theme | `store/themeStore.ts` | `isDark` (persisted) |
| Nutrition | `store/nutritionStore.ts` | `todayLog`, `targets`, `weeklyLoad`, `weather` |

---

## Food Logging (critical path)

```
FoodScreen.tsx
  ├── AI Smart mode  → POST /food/describe (Gemini) → auto-fills form
  ├── Manual mode    → name + weight + macros + AI assist (POST /food/estimate)
  ├── Barcode scan   → openFoodFacts API
  └── addLog()       → Dexie local insert + optional D1 sync queue
```

`pendingMealType` in appStore pre-selects meal when navigating from Home → Food tab.
`playFoodLogSound()` plays C5→E5→G5 chord on success.

**Validation rules:**
- Calories must match P×4+C×4+F×9 within ±12%
- Total macros ≤ food weight × 1.1
- No single macro > 95% of food weight

---

## Auth — Google Sign-In

**Web:** Google GSI script (`accounts.google.com/gsi/client`) → `handleCredential` → `googleSignIn(token)` → D1 Worker
**Android:** `@codetrix-studio/capacitor-google-auth` → native Google Sign-In → same flow

`VITE_GOOGLE_CLIENT_ID` must be set in `.env`.

After sign-in, profile merges D1 cloud data with local IndexedDB profile.

---

## APK Build

```bash
cd apps/web
node_modules/.bin/vite build          # 1. Build web assets
npx cap sync android                   # 2. Sync to Android project
cd android && ./gradlew assembleDebug  # 3. Build APK
# APK output: android/app/build/outputs/apk/debug/app-debug.apk
cp android/app/build/outputs/apk/debug/app-debug.apk /mnt/data/FuelSync/fuelsync.apk
```

---

## Deploy (Docker / Web)

```bash
cd /mnt/data/projects/mmswebsite
docker compose build foodaniel && docker compose up -d foodaniel
```

Live at: **foodaniel.danielmms.site**
