import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';
import { getProfile, createProfile, updateProfile } from './api/auth';
import type { LocalProfile } from './api/auth';
import { hasPin } from './lib/pin';
import { connectStrava } from './api/strava';
import { getSyncToken, getMe, syncProfile } from './api/syncClient';
import { clearPullCache, drainSyncQueue } from './api/localFood';
import { db } from './lib/db';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import GoogleAuthScreen from './screens/GoogleAuthScreen';
import PinScreen from './screens/PinScreen';
import HomeScreen from './screens/HomeScreen';
import FoodScreen from './screens/FoodScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import SupplementsScreen from './screens/SupplementsScreen';

type Tab = 'home' | 'food' | 'history' | 'supplements' | 'profile';
const NAV_H = 64;

const GREEN = '#6CBB3C';
const TEXT  = '#FFFFFF';
const MUTED = '#8B909A';

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

const TABS: Array<{ id: Tab; label: string; Icon: React.FC<{ active: boolean }> }> = [
  { id: 'home',        label: 'HOME',    Icon: DiaryIcon },
  { id: 'food',        label: 'DIARY',   Icon: LogIcon },
  { id: 'history',     label: 'MY WAY',  Icon: TrendsIcon },
  { id: 'supplements', label: 'SUPPS',   Icon: PillIcon },
  { id: 'profile',     label: 'PROFILE', Icon: ProfileIcon },
];

export default function App() {
  const { user, pinVerified, setUser, setPinVerified } = useAuthStore();
  const { activeTab, setActiveTab } = useAppStore();
  const profileIncomplete = !!user && (!user.weightKg || !user.heightCm || !user.age);
  const [booting,          setBooting]          = useState(true);
  const [needsPin,         setNeedsPin]         = useState(false);
  const [stravaConnecting, setStravaConnecting] = useState(false);
  const [showWeightCheckIn, setShowWeightCheckIn] = useState(false);
  const [weightInput,       setWeightInput]       = useState('');
  const [weightSaving,      setWeightSaving]      = useState(false);
  const weightChecked = useRef(false);

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
              // Fill in missing local values from D1
              const d1HasStats = syncUser.weight_kg || syncUser.height_cm || syncUser.age;
              if (d1HasStats && (!local.weightKg || !local.heightCm || !local.age)) {
                local = await updateProfile({
                  displayName: local.displayName || syncUser.display_name || undefined,
                  weightKg: local.weightKg || (syncUser.weight_kg ?? 0),
                  heightCm: local.heightCm || (syncUser.height_cm ?? 0),
                  age: local.age || (syncUser.age ?? 0),
                  gender: (local.gender || syncUser.gender as 'male' | 'female') ?? 'male',
                  activityLevel: ((local.activityLevel || syncUser.activity_level) as LocalProfile['activityLevel']) ?? 'moderate',
                  dailyGoal: local.dailyGoal || (syncUser.daily_goal ?? 2000),
                });
              }
            }
            // Push local stats to D1 so other devices stay current
            if (local.weightKg || local.heightCm) {
              syncProfile({
                display_name: local.displayName, weight_kg: local.weightKg ?? undefined,
                height_cm: local.heightCm ?? undefined, age: local.age ?? undefined,
                gender: local.gender ?? undefined, activity_level: local.activityLevel,
                daily_goal: local.dailyGoal,
              }).catch(() => {});
            }
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

  // Daily weight check-in — once per day after user is ready
  useEffect(() => {
    if (!user || !pinVerified || booting || weightChecked.current) return;
    weightChecked.current = true;
    const today = new Date().toISOString().split('T')[0];
    db.weight_logs.where('date').equals(today).count().then((count) => {
      if (count === 0) {
        setWeightInput(user.weightKg ? String(user.weightKg) : '');
        setShowWeightCheckIn(true);
      }
    }).catch(() => {});
  }, [user, pinVerified, booting]);

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
        background: 'linear-gradient(160deg, #0A0A0A 0%, #CC5500 50%, #FF8000 100%)',
        gap: 0, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '10%', right: '5%', width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,128,0,0.18)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '15%', left: '5%', width: 150, height: 150, borderRadius: '50%', background: 'rgba(245,197,24,0.12)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -5, lineHeight: 1, color: '#FFFFFF' }}>
            FUEL
          </div>
          <div style={{
            fontSize: 64, fontWeight: 900, letterSpacing: -5, lineHeight: 1,
            background: 'linear-gradient(135deg, #FF8000, #F5C518)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            SYNC
          </div>
          <div style={{ marginTop: 36, display: 'flex', gap: 7 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: i === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.25)',
                animation: `pulse 1.3s ${i * 0.22}s infinite ease-in-out`,
              }} />
            ))}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, letterSpacing: 5, marginTop: 22, fontWeight: 700, textTransform: 'uppercase' }}>
            {stravaConnecting ? 'Syncing with Strava' : 'Loading'}
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
          // Merge D1 stats into existing local profile if local is missing them
          const needsMerge = (!local.weightKg || !local.heightCm || !local.age) &&
            (u.weightKg || u.heightCm || u.age);
          if (needsMerge) {
            local = await updateProfile({
              displayName: local.displayName || u.displayName,
              weightKg: local.weightKg || (u.weightKg ?? 0),
              heightCm: local.heightCm || (u.heightCm ?? 0),
              age: local.age || (u.age ?? 0),
              gender: (local.gender || (u.gender as 'male' | 'female')) ?? 'male',
              activityLevel: ((local.activityLevel || u.activityLevel) as LocalProfile['activityLevel']) ?? 'moderate',
              dailyGoal: local.dailyGoal || (u.dailyGoal ?? 2000),
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

  const handleWeightLog = async (skip?: boolean) => {
    const kg = skip ? (user?.weightKg ?? 0) : parseFloat(weightInput);
    if (!skip && (!kg || kg < 20 || kg > 300)) return;
    setWeightSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await db.weight_logs.add({ date: today, weightKg: kg || 0, logged_at: new Date().toISOString() });
      if (!skip && kg) {
        const updated = await updateProfile({ weightKg: kg });
        setUser(updated);
        syncProfile({ weight_kg: kg }).catch(() => {});
      }
    } catch { /* ignore */ }
    finally { setWeightSaving(false); setShowWeightCheckIn(false); }
  };

  return (
    <div style={{
      position: 'relative', height: '100dvh',
      maxWidth: 480, margin: '0 auto',
      background: '#1A1C22', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, bottom: NAV_H, overflowY: 'auto' }}>
        {(activeTab === 'home' && !profileIncomplete)    && <HomeScreen />}
        {(activeTab === 'home' && profileIncomplete)     && <ProfileSetupScreen />}
        {activeTab === 'food'        && <FoodScreen />}
        {activeTab === 'history'     && <HistoryScreen />}
        {activeTab === 'supplements' && <SupplementsScreen />}
        {activeTab === 'profile'     && <ProfileSetupScreen />}
      </div>

      {/* Daily weight check-in modal */}
      {showWeightCheckIn && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px',
        }}>
          <div style={{
            background: '#242830', borderRadius: 20, padding: '28px 24px',
            width: '100%', maxWidth: 340, textAlign: 'center',
            border: '1px solid #2E3340',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚖️</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', marginBottom: 6 }}>
              Morning Check-In
            </div>
            <div style={{ fontSize: 12, color: '#8B909A', marginBottom: 24, lineHeight: 1.6 }}>
              Log today's weight to keep BMR and targets accurate.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setWeightInput(w => String(Math.max(20, parseFloat(w || '0') - 0.5)))}
                style={{ width: 40, height: 40, borderRadius: 10, background: '#2E3340', border: '1px solid #3A4050', color: '#FFFFFF', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}
              >−</button>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="number" value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  step="0.1" min="20" max="300"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '12px 36px 12px 12px',
                    borderRadius: 12, border: '1.5px solid #6CBB3C',
                    background: '#1A1C22', color: '#FFFFFF',
                    fontSize: 22, fontWeight: 700, textAlign: 'center',
                    outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B909A', fontSize: 12, fontWeight: 600 }}>kg</span>
              </div>
              <button
                onClick={() => setWeightInput(w => String(Math.min(300, parseFloat(w || '0') + 0.5)))}
                style={{ width: 40, height: 40, borderRadius: 10, background: '#2E3340', border: '1px solid #3A4050', color: '#6CBB3C', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}
              >+</button>
            </div>

            <button
              onClick={() => handleWeightLog(false)} disabled={weightSaving}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12,
                background: weightSaving ? '#2E3340' : '#6CBB3C', border: 'none',
                color: weightSaving ? '#8B909A' : '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                marginBottom: 10,
              }}
            >
              {weightSaving ? 'Saving…' : 'Log Weight'}
            </button>
            <button
              onClick={() => handleWeightLog(true)}
              style={{ background: 'none', border: 'none', color: '#8B909A', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Skip today
            </button>
          </div>
        </div>
      )}

      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: NAV_H,
        background: '#1E2028',
        borderTop: '1px solid #2E3340',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
      }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} className="nrc-press" style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
            }}>
              <div style={{
                color: active ? GREEN : MUTED,
                transition: 'color 0.18s ease',
              }}>
                <Icon active={active} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: active ? 700 : 500, letterSpacing: 0.8,
                color: active ? GREEN : MUTED, transition: 'all 0.18s ease',
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
