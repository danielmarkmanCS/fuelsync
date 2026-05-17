import { useEffect, useRef, useState } from 'react';
import { googleSignIn, setSyncToken } from '../api/syncClient';

const BLUE = '#0038A8';
const TEXT = '#0A1628';
const MUTED = '#6878A0';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: object) => void;
          renderButton: (el: HTMLElement, cfg: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface Props {
  onSignedIn: (user: { displayName: string; email: string; picture: string; weightKg: number | null; heightCm: number | null; age: number | null; gender: string | null; activityLevel: string; dailyGoal: number }) => void;
}

export default function GoogleAuthScreen({ onSignedIn }: Props) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const scriptId = 'google-gsi';
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = initGoogle;
      document.head.appendChild(s);
    } else if (window.google) {
      initGoogle();
    }
  }, []);

  function initGoogle() {
    if (!window.google || !btnRef.current) return;
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleCredential,
    });
    window.google.accounts.id.renderButton(btnRef.current, {
      theme: 'outline',
      size: 'large',
      width: 280,
      text: 'signin_with',
      shape: 'rectangular',
    });
  }

  async function handleCredential(response: { credential: string }) {
    setLoading(true);
    setError('');
    try {
      const { token, user } = await googleSignIn(response.credential);
      setSyncToken(token);
      onSignedIn({
        displayName: user.display_name || user.name,
        email: user.email,
        picture: user.picture,
        weightKg: user.weight_kg ?? null,
        heightCm: user.height_cm ?? null,
        age: user.age ?? null,
        gender: (user.gender as string | null) ?? null,
        activityLevel: user.activity_level ?? 'moderate',
        dailyGoal: user.daily_goal ?? 2000,
      });
    } catch {
      setError('Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #EEF4FF 0%, #DDEAFF 100%)',
      padding: '0 24px',
    }}>
      <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -4, lineHeight: 1, color: TEXT, marginBottom: 2 }}>FUEL</div>
      <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -4, lineHeight: 1, color: BLUE, marginBottom: 40 }}>SYNC</div>

      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px 28px',
        boxShadow: '0 8px 40px rgba(0,56,168,0.10)',
        width: '100%', maxWidth: 340, textAlign: 'center',
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 8 }}>Welcome</div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 28, lineHeight: 1.6 }}>
          Sign in with Google to sync your nutrition data across all your devices.
        </div>

        {loading ? (
          <div style={{ color: MUTED, fontSize: 13, padding: '12px 0' }}>Signing in…</div>
        ) : (
          <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center' }} />
        )}

        {error && (
          <div style={{ marginTop: 16, color: '#c0392b', fontSize: 12, fontWeight: 600 }}>{error}</div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: MUTED, textAlign: 'center', maxWidth: 280 }}>
        Your data is stored securely and never shared.
      </div>
    </div>
  );
}
