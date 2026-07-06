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

type Tab = 'home' | 'food' | 'history' | 'profile';
const NAV_H = 64;

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

const TABS: Array<{ id: Tab; label: string; Icon: React.FC<{ active: boolean }> }> = [
  { id: 'home',    label: 'TODAY',  Icon: DiaryIcon  },
  { id: 'food',    label: 'LOG',    Icon: LogIcon    },
  { id: 'history', label: 'STATS',  Icon: TrendsIcon },
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
        background: 'var(--bg)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Animated gradient orbs */}
        <div className="orb orb-1" style={{ opacity: 0.22 }} />
        <div className="orb orb-2" style={{ opacity: 0.16 }} />
        <div className="orb orb-3" style={{ opacity: 0.14 }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* Glow ring behind logo */}
          <div style={{
            position: 'absolute', width: 180, height: 180, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(157,126,255,0.20) 0%, transparent 70%)',
            filter: 'blur(20px)', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            animation: 'pulse 2.5s ease-in-out infinite',
            pointerEvents: 'none',
          }} />

          {/* Logo */}
          <div style={{ lineHeight: 1, textAlign: 'center', animation: 'ringPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div style={{
              fontFamily: 'inherit', fontSize: 76, fontWeight: 900, letterSpacing: -4, lineHeight: 1,
              background: 'linear-gradient(135deg, #EEF0FF 0%, rgba(238,240,255,0.7) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              FUEL
            </div>
            <div style={{
              fontFamily: 'inherit', fontSize: 76, fontWeight: 900, letterSpacing: -4, lineHeight: 1,
              background: 'linear-gradient(135deg, #9D7EFF 0%, #38BDF8 60%, #4ADE80 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              SYNC
            </div>
          </div>

          {/* Loading dots */}
          <div style={{ marginTop: 48, display: 'flex', gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === 0 ? '#9D7EFF' : i === 1 ? '#38BDF8' : '#4ADE80',
                animation: `pulse 1.4s ${i * 0.18}s infinite ease-in-out`,
              }} />
            ))}
          </div>

          <div style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '0.5em', marginTop: 20, fontWeight: 700, textTransform: 'uppercase', animation: 'fadeIn 0.6s 0.3s ease both' }}>
            {stravaConnecting ? 'Syncing Strava' : 'Loading'}
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
      <div style={{ position: 'absolute', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0, bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom, 0px))`, overflowY: 'auto' }}>
        {(activeTab === 'home' && !profileIncomplete)    && <HomeScreen />}
        {(activeTab === 'home' && profileIncomplete)     && <ProfileSetupScreen />}
        {activeTab === 'food'        && <FoodScreen />}
        {activeTab === 'history'     && <HistoryScreen />}
        {activeTab === 'profile'     && <ProfileSetupScreen />}
      </div>

      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: `calc(${NAV_H}px + env(safe-area-inset-bottom, 0px))`,
        background: 'var(--surf)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '1px solid var(--edge)',
        display: 'flex',
        alignItems: 'flex-start',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id as Tab)} className="press" style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0 4px',
              minWidth: 0, position: 'relative',
            }}>
              {/* Active indicator pill */}
              <div style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: active ? 36 : 0,
                height: 3,
                borderRadius: '0 0 3px 3px',
                background: 'var(--accent)',
                boxShadow: active ? 'var(--glow-accent)' : 'none',
                transition: 'width 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              }} />
              <div style={{
                color: active ? 'var(--accent)' : 'var(--muted2)',
                transition: 'color 0.18s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                transform: active ? 'scale(1.10)' : 'scale(1.0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon active={active} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: active ? 'var(--accent)' : 'var(--muted2)',
                transition: 'color 0.18s ease',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
