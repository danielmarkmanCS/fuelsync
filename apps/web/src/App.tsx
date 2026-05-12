import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { getMe } from './api/auth';
import { connectStrava } from './api/strava';
import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import FoodScreen from './screens/FoodScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';

type Tab = 'home' | 'food' | 'profile';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'home',    label: 'HOME' },
  { id: 'food',    label: 'FUEL' },
  { id: 'profile', label: 'YOU' },
];

const NAV_H = 64;

export default function App() {
  const { user, hasToken, setUser, logout } = useAuthStore();
  const [activeTab,        setActiveTab]        = useState<Tab>('home');
  const [booting,          setBooting]          = useState(true);
  const [stravaConnecting, setStravaConnecting] = useState(false);

  useEffect(() => {
    if (!hasToken) { setBooting(false); return; }
    getMe().then(setUser).catch(() => logout()).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const scope = params.get('scope');
    if (!code || !scope?.includes('activity')) return;
    window.history.replaceState({}, '', window.location.pathname);
    setStravaConnecting(true);
    connectStrava(code).catch(() => {}).finally(() => { setStravaConnecting(false); setActiveTab('home'); });
  }, [user]);

  if (booting || stravaConnecting) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0C0C0C',
      }}>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>
          FUEL<span style={{ color: '#FF1C1C' }}>SYNC</span>
        </div>
        <div style={{ width: 32, height: 2, background: '#FF1C1C', marginTop: 14, borderRadius: 1 }} />
        <div style={{
          color: '#C0C0C0', fontSize: 10, letterSpacing: 4,
          marginTop: 14, fontWeight: 600, textTransform: 'uppercase',
        }}>
          {stravaConnecting ? 'Syncing Activities' : 'Initializing'}
        </div>
      </div>
    );
  }

  if (!hasToken || !user) return <AuthScreen />;

  return (
    <div style={{
      position: 'relative', height: '100dvh',
      maxWidth: 480, margin: '0 auto',
      background: '#0C0C0C', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, bottom: NAV_H, overflow: 'hidden' }}>
        {activeTab === 'home'    && <HomeScreen />}
        {activeTab === 'food'    && <FoodScreen />}
        {activeTab === 'profile' && <ProfileSetupScreen />}
      </div>

      <nav style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: NAV_H,
        background: '#0C0C0C',
        borderTop: '1px solid #222',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 50,
      }}>
        {TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="nrc-press"
              style={{
                flex: 1, position: 'relative',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 6, background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 24, height: 2, background: '#FF1C1C', borderRadius: 1,
                }} />
              )}
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 2,
                color: active ? '#fff' : '#3A3A3A',
                transition: 'color 0.2s',
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
