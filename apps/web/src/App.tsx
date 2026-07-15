import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';
import { useThemeStore, ACCENT_COLORS } from './store/themeStore';
import { getProfile, createProfile, updateProfile } from './api/auth';
import type { LocalProfile } from './api/auth';
import { hasPin } from './lib/pin';
import { connectStrava } from './api/strava';
import { getSyncToken, getMe, syncProfile, fetchWeightLogs, fetchSupplements, fetchSupplementLogs, syncSupplement, syncSupplementLog } from './api/syncClient';
import { clearPullCache, drainSyncQueue } from './api/localFood';
import { db } from './lib/db';
import type { Supplement } from './lib/db';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import GoogleAuthScreen from './screens/GoogleAuthScreen';
import PinScreen from './screens/PinScreen';
import HomeScreen from './screens/HomeScreen';
import FoodScreen from './screens/FoodScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import SupplementsScreen from './screens/SupplementsScreen';
import SettingsScreen from './screens/SettingsScreen';
import GlowScreen from './screens/GlowScreen';
import BodyScreen from './screens/BodyScreen';
import AscendScreen from './screens/AscendScreen';
import XPPop from './components/XPPop';
import LevelUpModal from './components/LevelUpModal';
import GamifiedHeader, { HEADER_H } from './components/GamifiedHeader';
import GameScreen from './screens/GameScreen';

import { migrateXPIfNeeded } from './lib/xp';
import type { AppTab } from './store/appStore';
const NAV_H = 64;

// One-time XP schema migration (old thresholds → formula-based)
migrateXPIfNeeded();

function DiaryIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" strokeWidth="2.5" />
    </svg>
  );
}

function LogIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

function TrendsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function PillIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7" />
      <circle cx="17" cy="17" r="5" />
      <path d="M14.5 19.5l5-5" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function GlowIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"/>
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75L19 15z"/>
      <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z"/>
    </svg>
  );
}

function BodyIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 9c-2 0-3.5 1-4 2.5L6 16h3l1 5h4l1-5h3l-2-4.5C15.5 10 14 9 12 9z"/>
      <path d="M9 12.5l-1.5 2M15 12.5l1.5 2"/>
    </svg>
  );
}

function AscendIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

function GameIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  );
}

const TABS: Array<{ id: AppTab; label: string; Icon: React.FC<{ active: boolean }>; color: string }> = [
  { id: 'home',        label: 'Today',  Icon: DiaryIcon,   color: 'var(--c-today)'  },
  { id: 'food',        label: 'Log',    Icon: LogIcon,     color: 'var(--c-log)'    },
  { id: 'body',        label: 'Body',   Icon: BodyIcon,    color: 'var(--c-body)'   },
  { id: 'ascend',      label: 'Ascend', Icon: AscendIcon,  color: 'var(--c-ascend)' },
  { id: 'glow',        label: 'Glow',   Icon: GlowIcon,    color: 'var(--c-glow)'   },
  { id: 'supplements', label: 'Pills',  Icon: PillIcon,    color: 'var(--c-pills)'  },
  { id: 'game',        label: 'Game',   Icon: GameIcon,    color: 'var(--c-game)'   },
];

export default function App() {
  const { user, pinVerified, setUser, setPinVerified } = useAuthStore();
  const { activeTab, setActiveTab } = useAppStore();
  const { isDark, accentKey } = useThemeStore();
  const profileIncomplete = !!user && (!user.weightKg || !user.heightCm || !user.age);

  // Apply data-theme + accent CSS vars to body
  useEffect(() => {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  useEffect(() => {
    const a = ACCENT_COLORS[accentKey];
    const v = isDark ? a.dark : a.light;
    // Set on body (not documentElement) so it overrides the body[data-theme="light"] CSS rule
    document.body.style.setProperty('--accent',       v);
    document.body.style.setProperty('--accent2',      v);
    document.body.style.setProperty('--accent-muted', a.muted);
  }, [accentKey, isDark]);
  const [booting,          setBooting]          = useState(true);
  const [needsPin,         setNeedsPin]         = useState(false);
  const [stravaConnecting, setStravaConnecting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Handle redirect-based OAuth return (id_token in URL hash from Profile "Connect" flow)
        const hash = window.location.hash;
        if (hash.includes('id_token=')) {
          const params = new URLSearchParams(hash.slice(1));
          const idToken = params.get('id_token');
          const intent  = sessionStorage.getItem('gsi_intent');
          sessionStorage.removeItem('gsi_intent');
          sessionStorage.removeItem('gsi_nonce');
          window.history.replaceState(null, '', window.location.pathname);
          if (idToken && intent === 'connect') {
            // User connected Google from the Profile screen — sign in and push local data
            try {
              const { googleSignIn: gsi, setSyncToken: sst, syncProfile: sp, syncAddLog: sal, syncWeightLog: swl } = await import('./api/syncClient');
              const { token: t } = await gsi(idToken);
              sst(t);
              // Push local data to D1 (all food logs, weights, supplements)
              const profile = await getProfile();
              if (profile) sp({ display_name: profile.displayName, weight_kg: profile.weightKg ?? undefined, height_cm: profile.heightCm ?? undefined, age: profile.age ?? undefined, gender: profile.gender ?? undefined, activity_level: profile.activityLevel, daily_goal: profile.dailyGoal }).catch(() => {});
              const allFood = await db.food_logs.filter(l => !!l.sync_id).toArray();
              for (const log of allFood) sal({ id: log.sync_id!, food_name: log.food_name, calories: log.calories, protein: log.protein, carbs: log.carbs, fat: log.fat, weight_grams: log.weight_grams, meal_type: log.meal_type, image_url: log.image_url, ingredients: log.ingredients, logged_at: log.logged_at, date: log.date, fiber_g: log.fiber_g ?? null, cholesterol_mg: log.cholesterol_mg ?? null, sodium_mg: log.sodium_mg ?? null, vitamin_c_mg: log.vitamin_c_mg ?? null, vitamin_d_mcg: log.vitamin_d_mcg ?? null, calcium_mg: log.calcium_mg ?? null, iron_mg: log.iron_mg ?? null }).catch(() => {});
              const allWeights = await db.weight_logs.toArray();
              for (const w of allWeights) { const sid = w.sync_id ?? crypto.randomUUID(); if (!w.sync_id) await db.weight_logs.update(w.id!, { sync_id: sid }); swl({ id: sid, weight_kg: w.weightKg, date: w.date, logged_at: w.logged_at }).catch(() => {}); }
            } catch { /* ignore — will stay local-only */ }
          }
        }

        // If a sync token exists, load user from D1 and merge into local profile
        if (getSyncToken()) {
          const syncUser = await getMe();
          if (syncUser) {
            let local = await getProfile();
            if (!local) {
              local = await createProfile({
                displayName: syncUser.display_name || syncUser.name,
                weightKg: syncUser.weight_kg ?? 0,
                heightCm: syncUser.height_cm ?? 0,
                age: syncUser.age ?? 0,
                gender: (syncUser.gender as 'male' | 'female') ?? 'male',
                activityLevel: (syncUser.activity_level as LocalProfile['activityLevel']) ?? 'moderate',
                dailyGoal: syncUser.daily_goal ?? 2000,
              });
            } else {
              // D1 is the source of truth for profile — always apply cloud data to local.
              // This prevents stale local data from overwriting a newer profile on another device.
              const d1HasStats = syncUser.weight_kg || syncUser.height_cm || syncUser.age;
              if (d1HasStats) {
                local = await updateProfile({
                  // Cloud wins for numeric stats; fall back to existing local if cloud has null
                  displayName: syncUser.display_name || local.displayName || undefined,
                  weightKg:      syncUser.weight_kg      ?? local.weightKg      ?? undefined,
                  heightCm:      syncUser.height_cm      ?? local.heightCm      ?? undefined,
                  age:           syncUser.age            ?? local.age            ?? undefined,
                  gender:        ((syncUser.gender as 'male' | 'female') ?? local.gender) ?? 'male',
                  activityLevel: ((syncUser.activity_level || local.activityLevel) as LocalProfile['activityLevel']) ?? 'moderate',
                  dailyGoal:     syncUser.daily_goal     ?? local.dailyGoal,
                });
              }
              // ⚠️ Do NOT push local → D1 here. Pushing on every boot would overwrite
              // a newer profile saved on another device with this device's stale data.
              // Profile is only pushed to D1 when the user explicitly saves in ProfileSetupScreen.
            }
            // Pull weight logs from D1 and merge into local DB
            try {
              const remoteWeights = await fetchWeightLogs() as Array<{ id: string; weight_kg: number; date: string; logged_at: string }>;
              for (const rw of remoteWeights) {
                const existing = await db.weight_logs.where('date').equals(rw.date).first();
                if (!existing) {
                  await db.weight_logs.add({ sync_id: rw.id, date: rw.date, weightKg: rw.weight_kg, logged_at: rw.logged_at });
                }
              }
            } catch { /* ignore – offline or D1 unavailable */ }
            // Sync supplements: push any local ones without sync_id, then pull from D1
            try {
              type RemoteSupp = { id: string; name: string; dose: string; unit: string; timing: string; active: boolean; deleted_at: string | null };
              // Push local supplements that haven't been synced yet
              const localSupps = await db.supplements.toArray();
              for (const ls of localSupps.filter(s => !s.sync_id && s.active !== false)) {
                const syncId = crypto.randomUUID();
                await db.supplements.update(ls.id!, { sync_id: syncId });
                syncSupplement({ id: syncId, name: ls.name, dose: ls.dose, unit: ls.unit, timing: ls.timing, active: true }).catch(() => {});
              }
              // Pull remote supplements and merge
              const remoteSupps = await fetchSupplements() as RemoteSupp[];
              for (const rs of remoteSupps) {
                if (rs.deleted_at) continue;
                const existing = await db.supplements.where('sync_id').equals(rs.id).first();
                if (!existing) {
                  await db.supplements.add({ sync_id: rs.id, name: rs.name, dose: rs.dose, unit: rs.unit, timing: rs.timing as Supplement['timing'], active: !!rs.active });
                }
              }
              // Pull today's supplement logs
              const today = new Date().toISOString().split('T')[0];
              type RemoteSuppLog = { id: string; supplement_id: string; date: string; taken: boolean; logged_at: string };
              const remoteLogs = await fetchSupplementLogs(today) as RemoteSuppLog[];
              for (const rl of remoteLogs) {
                const localSupp = await db.supplements.where('sync_id').equals(rl.supplement_id).first();
                if (!localSupp?.id) continue;
                const existingLog = await db.supplement_logs.where('supplement_id').equals(localSupp.id).and(l => l.date === rl.date).first();
                if (!existingLog) {
                  await db.supplement_logs.add({ sync_id: rl.id, supplement_id: localSupp.id, date: rl.date, taken: rl.taken, logged_at: rl.logged_at });
                }
              }
            } catch { /* ignore – offline or D1 unavailable */ }
            // Restore Strava connection from D1 if tokens present
            if (syncUser.strava_access_token) {
              connectStrava({
                access_token: syncUser.strava_access_token,
                refresh_token: syncUser.strava_refresh_token ?? '',
                expires_at: syncUser.strava_expires_at ?? 0,
                athlete_name: syncUser.strava_athlete_name ?? '',
                athlete_pic: syncUser.strava_athlete_pic ?? '',
              }).catch(() => {});
            }
            setUser(local);
            const pinSet = await hasPin();
            if (pinSet) setNeedsPin(true);
            else setPinVerified(true);
            return;
          }
        }
        // Fall back to local-only profile
        const profile = await getProfile();
        if (profile) {
          setUser(profile);
          const pinSet = await hasPin();
          if (pinSet) setNeedsPin(true);
          else setPinVerified(true);
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // Clear D1 pull cache whenever the user brings the app to foreground
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) clearPullCache(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Retry any queued sync operations when the device comes back online
  useEffect(() => {
    if (!user) return;
    const handleOnline = () => drainSyncQueue().catch(() => {});
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user]);

  // Auto-sync every 2 hours in the background (food logs, weight, supplements)
  useEffect(() => {
    if (!user) return;
    const runAutoSync = () => {
      if (!getSyncToken()) return;
      drainSyncQueue().catch(() => {});
    };
    const interval = setInterval(runAutoSync, 2 * 60 * 60 * 1000); // 2 hours
    runAutoSync(); // run once on mount too
    return () => clearInterval(interval);
  }, [user]);

  // Handle fuelsync:// deep links (Strava OAuth callback on Android)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith('fuelsync://strava')) return;
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const access_token  = params.get('strava_access_token');
      const refresh_token = params.get('strava_refresh_token');
      const expires_at    = params.get('strava_expires_at');
      const athlete_name  = params.get('strava_athlete_name');
      const athlete_pic   = params.get('strava_athlete_pic') ?? '';
      if (!access_token || !refresh_token || !expires_at) return;
      setStravaConnecting(true);
      connectStrava({
        access_token, refresh_token,
        expires_at: Number(expires_at),
        athlete_name: athlete_name ?? '',
        athlete_pic,
      }).catch(() => {}).finally(() => { setStravaConnecting(false); setActiveTab('home'); });
    });
    return () => { sub.then((s) => s.remove()); };
  }, []);

  useEffect(() => {
    if (!user || !pinVerified) return;
    const params          = new URLSearchParams(window.location.search);
    const access_token    = params.get('strava_access_token');
    const refresh_token   = params.get('strava_refresh_token');
    const expires_at      = params.get('strava_expires_at');
    const athlete_name    = params.get('strava_athlete_name');
    const athlete_pic     = params.get('strava_athlete_pic') ?? '';
    if (!access_token || !refresh_token || !expires_at) return;
    window.history.replaceState({}, '', window.location.pathname);
    setStravaConnecting(true);
    connectStrava({
      access_token, refresh_token,
      expires_at: Number(expires_at),
      athlete_name: athlete_name ?? '',
      athlete_pic,
    }).catch(() => {}).finally(() => { setStravaConnecting(false); setActiveTab('home'); });
  }, [user, pinVerified]);

  if (booting || stravaConnecting) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient background orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* Brand mark — lightning bolt */}
          <div style={{ marginBottom: 20, animation: 'scaleIn 0.4s var(--spring) both' }}>
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <path d="M26 5L16 23h10L18 39L34 19H24L30 5H26z" fill="url(#bootGrad)" />
              <defs>
                <linearGradient id="bootGrad" x1="16" y1="5" x2="34" y2="39" gradientUnits="userSpaceOnUse">
                  <stop stopColor="var(--accent)" />
                  <stop offset="1" stopColor="#38BDF8" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Wordmark */}
          <div style={{
            fontSize: 32, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1,
            background: 'linear-gradient(135deg, var(--text) 0%, var(--accent) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            animation: 'fadeIn 0.4s 0.1s ease both',
          }}>
            FuelSync
          </div>

          {/* Tagline */}
          <div style={{
            fontSize: 10, color: 'var(--muted)', fontWeight: 600,
            letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 8,
            animation: 'fadeIn 0.4s 0.2s ease both',
          }}>
            {stravaConnecting ? 'Connecting Strava…' : 'Hybrid Athlete Platform'}
          </div>

          {/* Loading dots */}
          <div style={{ marginTop: 48, display: 'flex', gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--accent)',
                animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) return (
    <GoogleAuthScreen
      onSignedIn={async (u) => {
        let local = await getProfile();
        if (!local) {
          local = await createProfile({
            displayName: u.displayName,
            weightKg: u.weightKg ?? 0,
            heightCm: u.heightCm ?? 0,
            age: u.age ?? 0,
            gender: (u.gender as 'male' | 'female') ?? 'male',
            activityLevel: (u.activityLevel as 'moderate') ?? 'moderate',
            dailyGoal: u.dailyGoal ?? 2000,
          });
        } else {
          // D1 wins for profile on sign-in — apply cloud data to local.
          const d1HasStats = u.weightKg || u.heightCm || u.age;
          if (d1HasStats) {
            local = await updateProfile({
              displayName: u.displayName || local.displayName,
              weightKg:      u.weightKg      ?? local.weightKg      ?? undefined,
              heightCm:      u.heightCm      ?? local.heightCm      ?? undefined,
              age:           u.age           ?? local.age            ?? undefined,
              gender:        ((u.gender as 'male' | 'female') ?? local.gender) ?? 'male',
              activityLevel: ((u.activityLevel || local.activityLevel) as LocalProfile['activityLevel']) ?? 'moderate',
              dailyGoal:     u.dailyGoal     ?? local.dailyGoal,
            });
          }
        }
        setUser(local);
        setPinVerified(true);
        // Background: pull all data from D1 now that we have a token
        (async () => {
          try {
            const { fetchWeightLogs: fwl, fetchSupplements: fsu, fetchSupplementLogs: fsl, syncSupplement: ssu } = await import('./api/syncClient');
            const remoteWeights = await fwl() as Array<{ id: string; weight_kg: number; date: string; logged_at: string }>;
            for (const rw of remoteWeights) {
              const ex = await db.weight_logs.where('date').equals(rw.date).first();
              if (!ex) await db.weight_logs.add({ sync_id: rw.id, date: rw.date, weightKg: rw.weight_kg, logged_at: rw.logged_at });
            }
            const localSupps = await db.supplements.toArray();
            for (const ls of localSupps.filter(s => !s.sync_id && s.active !== false)) {
              const sid = crypto.randomUUID();
              await db.supplements.update(ls.id!, { sync_id: sid });
              ssu({ id: sid, name: ls.name, dose: ls.dose, unit: ls.unit, timing: ls.timing, active: true }).catch(() => {});
            }
            type RS = { id: string; name: string; dose: string; unit: string; timing: string; active: boolean; deleted_at: string | null };
            const remoteSupps = await fsu() as RS[];
            for (const rs of remoteSupps) {
              if (rs.deleted_at) continue;
              const ex = await db.supplements.where('sync_id').equals(rs.id).first();
              if (!ex) await db.supplements.add({ sync_id: rs.id, name: rs.name, dose: rs.dose, unit: rs.unit, timing: rs.timing as import('./lib/db').Supplement['timing'], active: !!rs.active });
            }
            const tod = new Date().toISOString().split('T')[0];
            type RL = { id: string; supplement_id: string; date: string; taken: boolean; logged_at: string };
            const remoteLogs = await fsl(tod) as RL[];
            for (const rl of remoteLogs) {
              const localSupp = await db.supplements.where('sync_id').equals(rl.supplement_id).first();
              if (!localSupp?.id) continue;
              const ex = await db.supplement_logs.where('supplement_id').equals(localSupp.id).and(l => l.date === rl.date).first();
              if (!ex) await db.supplement_logs.add({ sync_id: rl.id, supplement_id: localSupp.id, date: rl.date, taken: rl.taken, logged_at: rl.logged_at });
            }
            // Clear food log pull cache so today's logs load fresh
            clearPullCache();
          } catch { /* offline — will retry on next boot */ }
        })();
      }}
      onSkip={async () => {
        let local = await getProfile();
        if (!local) {
          local = await createProfile({
            displayName: 'Athlete',
            weightKg: 0, heightCm: 0, age: 0,
            gender: 'male', activityLevel: 'moderate', dailyGoal: 2000,
          });
        }
        setUser(local);
        setPinVerified(true);
      }}
    />
  );
  if (needsPin && !pinVerified) return <PinScreen />;

  return (
    <div style={{
      position: 'relative', height: '100dvh',
      maxWidth: 480, margin: '0 auto',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      <GamifiedHeader />
      <div className="main-scroll" style={{ position: 'absolute', top: `calc(env(safe-area-inset-top, 0px) + ${HEADER_H}px)`, left: 0, right: 0, bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom, 0px))`, overflowY: 'auto' }}>
        {(activeTab === 'home' && !profileIncomplete)    && <HomeScreen />}
        {(activeTab === 'home' && profileIncomplete)     && <ProfileSetupScreen />}
        {activeTab === 'food'        && <FoodScreen />}
        {activeTab === 'history'     && <HistoryScreen />}
        {activeTab === 'profile'     && <ProfileSetupScreen />}
        {activeTab === 'supplements' && <SupplementsScreen />}
        {activeTab === 'body'        && <BodyScreen />}
        {activeTab === 'ascend'      && <AscendScreen />}
        {activeTab === 'glow'        && <GlowScreen />}
        {activeTab === 'settings'    && <SettingsScreen />}
        {activeTab === 'game'        && <GameScreen />}
      </div>

      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: `calc(${NAV_H}px + env(safe-area-inset-bottom, 0px))`,
        background: 'var(--surf)',
        backdropFilter: 'blur(28px) saturate(200%)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        borderTop: '1px solid var(--edge)',
        display: 'flex',
        alignItems: 'flex-start',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
        boxShadow: '0 -1px 0 var(--edge)',
      }}>
        {TABS.map(({ id, label, Icon, color }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} className="press" style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '9px 0 5px', minWidth: 0, position: 'relative',
            }}>
              {/* Glow indicator dot under icon when active */}
              {active && (
                <div style={{
                  position: 'absolute',
                  top: 6, left: '50%', transform: 'translateX(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  background: color,
                  opacity: 0.12,
                  filter: 'blur(8px)',
                  pointerEvents: 'none',
                }} />
              )}
              {/* Top accent bar */}
              <div style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: active ? 20 : 0,
                height: 2,
                borderRadius: 99,
                background: active ? color : 'transparent',
                boxShadow: active ? `0 0 8px ${color}` : 'none',
                transition: 'width 0.28s var(--spring), box-shadow 0.28s ease',
              }} />
              <div style={{
                color: active ? color : 'var(--muted2)',
                transform: active ? 'translateY(-1px)' : 'none',
                transition: 'color 0.2s ease, transform 0.28s var(--spring)',
              }}>
                <Icon active={active} />
              </div>
              <span style={{
                fontSize: 10, fontWeight: active ? 700 : 500,
                color: active ? color : 'var(--muted2)',
                transition: 'color 0.2s ease, font-weight 0.1s',
                letterSpacing: active ? '0.2px' : '0.3px',
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <XPPop />
      <LevelUpModal />
    </div>
  );
}
