# FuelSync — Complete Technical & Product Overview

**Updated:** 2026-05-26  
**Author:** Daniel Markman  
**Live URL:** foodaniel.danielmms.site

---

## 1. What Is FuelSync?

FuelSync is a **local-first Progressive Web App (PWA)** for athlete nutrition and training tracking. All user data lives in the browser's IndexedDB — no account, no password, no cloud server required. The app works fully offline.

The target user is a **hybrid athlete** — someone who does both running and strength training and needs intelligent macro cycling to match their daily training type.

---

## 2. Architecture

### Current (Local-first PWA)
- **Frontend:** Static PWA deployed to **GitHub Pages** via GitHub Actions (primary target)
- **Data:** **IndexedDB** (Dexie.js) — food logs, profile, PIN state, weight logs, all local
- **AI:** **Cloudflare Worker** (`fuelsync-ai`) proxies Gemini API — hides the API key
- **Strava:** **Cloudflare Worker** (`fuelsync-strava`) handles OAuth callback, token refresh, stats proxy
- **Auth:** **4-digit PIN** (PBKDF2-hashed). 15 wrong attempts = full data wipe
- **Deploy (primary):** Push to `master` → GitHub Actions → GitHub Pages
- **Deploy (secondary):** `docker compose build foodaniel && docker compose up -d foodaniel`
- **Domain:** CNAME `foodaniel.danielmms.site` → `danielmarkmanCS.github.io`

### Workers
| Worker | File | Purpose |
|--------|------|---------|
| `fuelsync-ai` | `workers/ai/index.ts` | Gemini proxy (describe food, estimate macros, image analysis, meal suggestions) |
| `fuelsync-strava` | `workers/strava/index.ts` | Strava OAuth callback + token refresh + stats proxy |

The AI worker implements a **model cascade**: tries `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.0-flash-lite` → `gemini-2.5-flash-lite`, skipping on 429/404 errors. Supports up to 3 API keys for rate-limit balancing.

---

## 3. Data Storage (IndexedDB via Dexie.js)

**File:** `apps/web/src/lib/db.ts`

| Table | Contents |
|-------|----------|
| `profile` | User body stats, display name, activity level, goal mode, calorie target, Strava tokens |
| `food_logs` | Every food logged — name, calories, protein, carbs, fat, weight, meal type, date, micronutrients, soft-delete flag |
| `pin_state` | Hashed PIN, attempt count, lockout timestamp, security question |
| `weight_logs` | Body weight history over time |

All CRUD goes through `apps/web/src/api/localFood.ts` which wraps Dexie queries.

---

## 4. Authentication — PIN System

**Files:** `apps/web/src/lib/pin.ts`, `apps/web/src/screens/PinScreen.tsx`, `apps/web/src/screens/AuthScreen.tsx`

- On first launch: user completes **2-step onboarding** (body stats → PIN creation)
- On return: PIN entry screen gate before app loads
- PIN is **PBKDF2-SHA256 hashed** with random 16-byte salt (100,000 iterations) — never stored plain
- **15 wrong attempts** triggers a complete local data wipe (`db.delete()`)
- Auth state in Zustand store (`authStore.ts`) — `pinVerified` boolean in sessionStorage (cleared on tab close)

---

## 5. Screens

**Navigation:** 6-tab bottom nav: HOME · DIARY · TRENDS · SUPPS · PROFILE · SETTINGS

### HomeScreen (`apps/web/src/screens/HomeScreen.tsx`)
MFP-style main dashboard with date navigation (past days browsable). Shows:
- **Top bar** — date navigation arrows + gear icon → Settings; training type badge
- **Calorie Dashboard** — `Goal − Food + Exercise = Remaining` equation grid + centered SVG progress ring
- **Macro Row** — 3 cards: Carbs / Fat / Protein (consumed/target with fill bar)
- **Today's Training** — Rest / Strength / Cardio / Hybrid selector + NEAT modifier (today only)
- **Food Diary** — per-meal section cards (Breakfast · Pre-WO · Lunch · Post-WO · Dinner · Snacks)
  - Items displayed paragraph-style, no inner scroll
  - Colorful macro chips per item: Protein=`#38BDF8`, Carbs=`#22C55E`, Fat=`#F59E0B`
  - Meal total row at bottom of each section
  - `+ ADD FOOD` button pre-selects meal type in FoodScreen
- **Supplements** — daily checklist with M/A/E day-period timestamps; one-time daily congrats popup (today only)
- **Strava Card** — recent run stats (today only)
- **Weekly Load** — km / sessions / recovery% (today only)

Past-day view hides today-only sections and shows "Back to Today" CTA.

### FoodScreen (`apps/web/src/screens/FoodScreen.tsx`)
Food logging hub. Modes:
1. **AI Smart** — free-text description → Gemini → auto-fills form
2. **Manual** — name + weight + macros entered directly
3. **Photo** — camera capture → base64 → Gemini vision → estimated macros
4. **Barcode scan** — Open Food Facts API product lookup

Additional features: meal suggestions, recent foods, favorites, meal templates, recipe builder, diary notes, soft delete / undo.

### HistoryScreen (`apps/web/src/screens/HistoryScreen.tsx`)
Trends and history. Shows per-day macro summary, streak counter, progress charts. Expandable day cards show individual food logs. Handles soft-deleted entries (shows them as removed with undo).

### SupplementsScreen (`apps/web/src/screens/SupplementsScreen.tsx`)
Daily supplement checklist. Supplements shown with M (Morning), A (Afternoon), E (Evening) day-period checkboxes. Tap to log taken time. All-done triggers a daily congrats popup (one-time per day, `fs_supp_congrats_YYYY-MM-DD` localStorage key).

### ProfileSetupScreen (`apps/web/src/screens/ProfileSetupScreen.tsx`)
Edit body stats: weight, height, age, gender, activity level, display name. Custom macro targets. Change/clear PIN.

### SettingsScreen (`apps/web/src/screens/SettingsScreen.tsx`)
Dark/Light theme toggle. Profile shortcuts.

### PinScreen (`apps/web/src/screens/PinScreen.tsx`)
4-digit PIN entry. Shows attempt counter, locks out after failures, full wipe after 15 total failures.

---

## 6. Nutrition Engine

**File:** `apps/mobile/src/services/nutritionEngine.ts`

### Macro Cycling Logic

| Training Type | Cal Adjustment | Macro Split (P/C/F) | Rationale |
|--------------|----------------|---------------------|-----------|
| Rest | −15% | 30/20/50 | High fat, glycogen depletion, fat adaptation |
| Strength | +5% | 38/35/27 | High protein for MPS |
| Cardio | +10% | 25/55/20 | High carbs for aerobic fuel |
| Hybrid | +8% | 32/43/25 | Balanced, slight carb emphasis |

### Validation Rules
Before a food log is accepted:
- Calories must match `P×4 + C×4 + F×9` within **±12%**
- Total macros (P+C+F) must be ≤ `food weight × 1.1`
- No single macro > 95% of the food's weight

### Recovery Score Formula
```
runLoad = Σ(km × 1.5 × paceMultiplier)
strengthLoad = sessions × 15
score = max(5, 100 − min(100, (runLoad + strengthLoad) / activityMultiplier))
```

---

## 7. AI Features

All AI calls go to the `fuelsync-ai` Cloudflare Worker which proxies Gemini.

| Feature | Endpoint | Description |
|---------|----------|-------------|
| Food description → macros | `POST /describe` | Free text → JSON macros |
| Weight-based estimate | `POST /estimate` | Food name + weight → macro estimate |
| Image analysis | `POST /analyze` | Base64 photo → macro estimate |
| Meal suggestion | `POST /suggest` | Context (time/training) → suggested meal |

Multi-key rotation (up to 3 Gemini API keys) + model cascade for maximum uptime.

---

## 8. Strava Integration

OAuth2 via Cloudflare Worker. Tokens stored in IndexedDB `profile` table. Worker proxies: recent activities, weekly stats, athlete profile. Auto-refresh when expired.

---

## 9. Design System

FuelSync uses a dual-theme (Dark/Light) design system via CSS custom properties.

### Dark Theme (default)
| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#0D1117` | Page background |
| `--surf` | `#161B22` | Cards |
| `--surf2` | `#1C2128` | Nested cards |
| `--edge` | `#21262D` | Card borders |
| `--text` | `#F0F3F6` | Primary text |
| `--muted` | `#8B949E` | Labels, secondary |
| `--accent` | `#2F81F7` | Primary CTA, progress |
| `--prot` | `#38BDF8` | Protein (blue) |
| `--carb` | `#22C55E` | Carbs (green) |
| `--fat` | `#F59E0B` | Fat (amber) |
| `--red` | `#EF4444` | Danger, over-target |

### Light Theme
| Token | Value |
|-------|-------|
| `--bg` | `#E4E7EB` |
| `--surf` | `#F2F4F6` |
| `--accent` | `#0066EE` |
| Everything else | inherits dark macro colors |

Applied via `body[data-theme="light"]` CSS block. Toggled by `themeStore.ts`.

**Font:** Outfit (body, 400–700) + Barlow Condensed (hero numbers, 800)  
**Interactions:** `.nrc-press` = `scale(0.96)` on `:active`  
**Animations:** `slideUp`, `fadeIn`, `pulse`, `shimmer`, `ringPop`, `barFillAni`

---

## 10. PWA & Mobile

- **VitePWA plugin** generates service worker + manifest (`registerType: 'autoUpdate'`)
- **Capacitor** wraps the PWA as a native Android app (`apps/web/android/`)
- APK build: `vite build` → `cap sync android` → `./gradlew assembleRelease` → `fuelsync-release.apk`
- Sound on food log: Web Audio API C5→E5→G5 chord (`apps/web/src/utils/sounds.ts`)

---

## 11. State Management

**Zustand stores:**

| Store | File | Manages |
|-------|------|---------|
| `authStore` | `store/authStore.ts` | `pinVerified`, user profile object |
| `appStore` | `store/appStore.ts` | `activeTab`, `pendingMealType` |
| `themeStore` | `store/themeStore.ts` | `isDark` (persisted to `fs_theme`) |
| `nutritionStore` | `store/nutritionStore.ts` | `todayLog`, `targets`, `weeklyLoad`, `weather` |

**Custom hook:** `hooks/useNutrition.ts` — orchestrates `logDay`, macro targets, weekly load, weather, Strava refresh.

---

## 12. Key Libraries

| Library | Purpose |
|---------|---------|
| React 18 + Vite | UI framework + bundler |
| TypeScript | Type safety throughout |
| Zustand | Lightweight state management |
| Dexie.js | IndexedDB ORM |
| Capacitor | Native Android wrapper |
| VitePWA (Workbox) | Service worker + PWA manifest |
| Cloudflare Workers | AI + Strava serverless proxy |

---

## 13. Deployment

### Frontend (GitHub Pages — primary)
```bash
git push origin master
# GitHub Action: builds → deploys → live at danielmarkmanCS.github.io
# DNS: CNAME foodaniel.danielmms.site → danielmarkmanCS.github.io
```
Required GitHub secrets: `VITE_AI_WORKER_URL`, `VITE_STRAVA_WORKER_URL`, `VITE_OPENWEATHER_KEY`, `VITE_GOOGLE_CLIENT_ID`

### Docker (secondary — home server)
```bash
cd /mnt/data/projects/mmswebsite
docker compose build foodaniel && docker compose up -d foodaniel
```
After Docker deploy: update `nginx.conf` compat redirects with new bundle hash → rebuild.

### Workers (Cloudflare)
```bash
cd workers/ai    && npx wrangler deploy
cd workers/strava && npx wrangler deploy
```

---

## 14. File Map

```
/mnt/data/FuelSync/
├── apps/web/
│   ├── src/
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx         — MFP dashboard (largest file)
│   │   │   ├── FoodScreen.tsx         — log food: AI, photo, manual, barcode, recipes
│   │   │   ├── HistoryScreen.tsx      — trends, charts, day history
│   │   │   ├── SupplementsScreen.tsx  — supplement checklist
│   │   │   ├── ProfileSetupScreen.tsx — body stats, settings
│   │   │   ├── SettingsScreen.tsx     — theme toggle
│   │   │   ├── AuthScreen.tsx         — onboarding: profile + PIN setup
│   │   │   └── PinScreen.tsx          — PIN entry gate
│   │   ├── api/
│   │   │   ├── localFood.ts           — Dexie CRUD + Gemini Worker calls
│   │   │   ├── auth.ts                — local profile CRUD
│   │   │   ├── client.ts              — workerFetch helper
│   │   │   ├── strava.ts              — Strava via Cloudflare Worker
│   │   │   └── openFoodFacts.ts       — food search + barcode
│   │   ├── store/
│   │   │   ├── authStore.ts           — pinVerified, profile
│   │   │   ├── appStore.ts            — activeTab, pendingMealType
│   │   │   ├── themeStore.ts          — isDark (persisted)
│   │   │   └── nutritionStore.ts      — todayLog, targets, weeklyLoad
│   │   ├── lib/
│   │   │   ├── db.ts                  — Dexie schema
│   │   │   ├── pin.ts                 — PIN hash/verify/lockout/wipe
│   │   │   ├── recentFoods.ts         — recent + favorites
│   │   │   ├── mealTemplates.ts       — save/load meal templates
│   │   │   ├── recipes.ts             — recipe builder
│   │   │   └── diaryNotes.ts          — per-day notes
│   │   ├── components/
│   │   │   ├── StravaCard.tsx         — full Strava UI (CSS vars only, no hardcoded hex)
│   │   │   ├── TrainingPicker.tsx
│   │   │   └── WeatherBanner.tsx
│   │   ├── hooks/useNutrition.ts      — main data hook
│   │   └── utils/sounds.ts            — log sound: C5→E5→G5
│   ├── index.css                      — ALL design tokens + typography + animations
│   ├── capacitor.config.ts            — Capacitor native config
│   └── android/                       — generated Android project
├── workers/
│   ├── ai/index.ts                    — Gemini proxy Worker
│   └── strava/index.ts                — Strava OAuth Worker
├── apps/mobile/src/services/
│   ├── nutritionEngine.ts             — TDEE, macro cycling, recovery score
│   └── weatherService.ts              — OpenWeatherMap + danger alert
├── shared/types/index.ts              — MacroTargets, TrainingType, LoggedRun, etc.
├── nginx.conf                         — SPA fallback + /api proxy + compat redirects
└── Dockerfile                         — multi-stage: Node build → nginx static
```

---

*End of document.*
