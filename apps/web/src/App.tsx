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

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'home',    label: 'HOME' },
  { id: 'food',    label: 'FUEL' },
  { id: 'profile', label: 'STATS' },
];

const NAV_H = 64;

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
          if (pinSet) {
            setNeedsPin(true);
          } else {
            setPinVerified(true);
          }
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user || !pinVerified) return;
    const params = new URLSearchParams(window.location.search);
    const access_token   = params.get('strava_access_token');
    const refresh_token  = params.get('strava_refresh_token');
    const expires_at     = params.get('strava_expires_at');
    const athlete_name   = params.get('strava_athlete_name');
    const athlete_pic    = params.get('strava_athlete_pic') ?? '';
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
        alignItems: 'center', justifyContent: 'center', background: '#0C0C0C',
      }}>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -2, lineHeight: 1, color: '#FFFFFF' }}>
          FUEL<span style={{ color: '#FF3B30' }}>SYNC</span>
        </div>
        <div style={{ width: 32, height: 2, background: '#FF3B30', marginTop: 14, borderRadius: 1 }} />
        <div style={{ color: '#999999', fontSize: 10, letterSpacing: 4, marginTop: 14, fontWeight: 600, textTransform: 'uppercase' }}>
          {stravaConnecting ? 'Syncing Activities' : 'Initializing'}
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
      background: '#0C0C0C', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, bottom: NAV_H, overflowY: 'auto' }}>
        {activeTab === 'home'    && <HomeScreen />}
        {activeTab === 'food'    && <FoodScreen />}
        {activeTab === 'profile' && <ProfileSetupScreen />}
      </div>

      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: NAV_H,
        background: '#141414', borderTop: '1px solid #2C2C2E',
        display: 'flex', paddingBottom: 'env(safe-area-inset-bottom, 0px)', zIndex: 50,
      }}>
        {TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} className="nrc-press" style={{
              flex: 1, position: 'relative', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
              {active && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 24, height: 2, background: '#FF3B30', borderRadius: 1,
                }} />
              )}
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 2,
                color: active ? '#FFFFFF' : '#48484A', transition: 'color 0.2s',
              }}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
