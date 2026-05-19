import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { getProfile, createProfile, updateProfile } from './api/auth';
import type { LocalProfile } from './api/auth';
import { hasPin } from './lib/pin';
import { connectStrava } from './api/strava';
import { getSyncToken, getMe, syncProfile } from './api/syncClient';
import { clearPullCache } from './api/localFood';
import GoogleAuthScreen from './screens/GoogleAuthScreen';
import PinScreen from './screens/PinScreen';
import HomeScreen from './screens/HomeScreen';
import FoodScreen from './screens/FoodScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';

type Tab = 'home' | 'food' | 'history' | 'profile';
const NAV_H = 68;

const BLUE  = '#0038A8';
const TEXT  = '#0A1628';
const MUTED2 = '#C0CCDF';

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z" />
      <path d="M9 21V13h6v8" />
    </svg>
  );
}

function FuelIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L4.09 12.76A1 1 0 005 14.5h6L10 22l9.91-10.76A1 1 0 0019 9.5H13.5L13 2z"
        opacity={active ? 1 : 0.5} />
    </svg>
  );
}

function HistoryIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

const TABS: Array<{ id: Tab; label: string; Icon: React.FC<{ active: boolean }> }> = [
  { id: 'home',    label: 'Home',    Icon: HomeIcon },
  { id: 'food',    label: 'Fuel',    Icon: FuelIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
  { id: 'profile', label: 'Profile', Icon: ProfileIcon },
];

export default function App() {
  const { user, pinVerified, setUser, setPinVerified } = useAuthStore();
  const [activeTab,        setActiveTab]        = useState<Tab>('home');
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

  // Clear D1 pull cache whenever the user brings the app to foreground
  // so switching back from another app/tab always gets fresh data
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) clearPullCache(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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
        background: 'linear-gradient(160deg, #080F30 0%, #1E40DC 50%, #4B6FFF 100%)',
        gap: 0, position: 'relative', overflow: 'hidden',
      }}>
        {/* Background orbs */}
        <div className="orb1" style={{ position: 'absolute', top: '10%', right: '5%', width: 200, height: 200, borderRadius: '50%', background: 'rgba(75,111,255,0.15)' }} />
        <div className="orb2" style={{ position: 'absolute', bottom: '15%', left: '5%', width: 150, height: 150, borderRadius: '50%', background: 'rgba(0,189,208,0.10)' }} />
        <div className="orb3" style={{ position: 'absolute', top: '40%', left: '35%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -5, lineHeight: 1, color: '#FFFFFF' }}>
            FUEL
          </div>
          <div style={{
            fontSize: 64, fontWeight: 900, letterSpacing: -5, lineHeight: 1,
            background: 'linear-gradient(135deg, #00BDD0, #4B6FFF)',
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
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 5, marginTop: 22, fontWeight: 700, textTransform: 'uppercase' }}>
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
      background: '#0E1117', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, bottom: NAV_H, overflowY: 'auto' }}>
        {activeTab === 'home'    && <HomeScreen />}
        {activeTab === 'food'    && <FoodScreen />}
        {activeTab === 'history' && <HistoryScreen />}
        {activeTab === 'profile' && <ProfileSetupScreen />}
      </div>

      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: NAV_H,
        background: 'rgba(18,22,32,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 -6px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
      }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} className="nrc-press" style={{
              flex: 1, position: 'relative', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
              {active && (
                <>
                  <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 36, height: 3, background: `linear-gradient(90deg, #1E40DC, #4B6FFF)`,
                    borderRadius: '0 0 3px 3px',
                    boxShadow: `0 2px 10px rgba(30,64,220,0.50)`,
                  }} />
                  <div style={{
                    position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(30,64,220,0.06)', pointerEvents: 'none',
                  }} />
                </>
              )}
              <div style={{
                color: active ? BLUE : MUTED2,
                transition: 'color 0.22s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
                transform: active ? 'scale(1.1)' : 'scale(1)',
                filter: active ? `drop-shadow(0 0 5px rgba(30,64,220,0.40))` : 'none',
                position: 'relative', zIndex: 1,
              }}>
                <Icon active={active} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: active ? 800 : 600, letterSpacing: 1.2,
                color: active ? BLUE : MUTED2, transition: 'all 0.22s',
                position: 'relative', zIndex: 1,
              }}>
                {label.toUpperCase()}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
