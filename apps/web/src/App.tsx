import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { getProfile } from './api/auth';
import { hasPin } from './lib/pin';
import { connectStrava } from './api/strava';
import AuthScreen from './screens/AuthScreen';
import PinScreen from './screens/PinScreen';
import HomeScreen from './screens/HomeScreen';
import FoodScreen from './screens/FoodScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';

type Tab = 'home' | 'food' | 'profile';
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

function StatsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3"  y="14" width="4" height="7" rx="1.5" opacity={active ? 1 : 0.5} />
      <rect x="10" y="9"  width="4" height="12" rx="1.5" />
      <rect x="17" y="4"  width="4" height="17" rx="1.5" opacity={active ? 1 : 0.5} />
    </svg>
  );
}

const TABS: Array<{ id: Tab; label: string; Icon: React.FC<{ active: boolean }> }> = [
  { id: 'home',    label: 'Home',  Icon: HomeIcon },
  { id: 'food',    label: 'Fuel',  Icon: FuelIcon },
  { id: 'profile', label: 'Stats', Icon: StatsIcon },
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
        background: 'linear-gradient(160deg, #EEF4FF 0%, #DDEAFF 100%)',
        gap: 0,
      }}>
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -4, lineHeight: 1, color: TEXT }}>
          FUEL
        </div>
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -4, lineHeight: 1, color: BLUE }}>
          SYNC
        </div>
        <div style={{ marginTop: 32, display: 'flex', gap: 6 }}>
          {[0,1,2].map((i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: i === 0 ? BLUE : 'rgba(0,56,168,0.2)',
              animation: `pulse 1.2s ${i * 0.2}s infinite ease-in-out`,
            }} />
          ))}
        </div>
        <div style={{ color: '#9EB3D0', fontSize: 10, letterSpacing: 4, marginTop: 20, fontWeight: 600, textTransform: 'uppercase' }}>
          {stravaConnecting ? 'Syncing' : 'Loading'}
        </div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;
  if (needsPin && !pinVerified) return <PinScreen />;

  return (
    <div style={{
      position: 'relative', height: '100dvh',
      maxWidth: 480, margin: '0 auto',
      background: '#EEF4FF', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, bottom: NAV_H, overflowY: 'auto' }}>
        {activeTab === 'home'    && <HomeScreen />}
        {activeTab === 'food'    && <FoodScreen />}
        {activeTab === 'profile' && <ProfileSetupScreen />}
      </div>

      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: NAV_H,
        background: 'rgba(255,255,255,0.97)',
        borderTop: '1px solid rgba(0,56,168,0.08)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 -4px 20px rgba(0,56,168,0.06)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
      }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} className="nrc-press" style={{
              flex: 1, position: 'relative', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
              {active && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 32, height: 3, background: BLUE, borderRadius: 2,
                  boxShadow: `0 0 8px ${BLUE}55`,
                }} />
              )}
              <div style={{
                color: active ? BLUE : MUTED2,
                transition: 'color 0.2s',
                filter: active ? `drop-shadow(0 0 4px ${BLUE}40)` : 'none',
              }}>
                <Icon active={active} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                color: active ? BLUE : MUTED2, transition: 'color 0.2s',
              }}>{label.toUpperCase()}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
