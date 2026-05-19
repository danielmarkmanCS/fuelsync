import { useEffect, useRef, useState } from 'react';
import { googleSignIn, setSyncToken } from '../api/syncClient';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const BLUE = '#0038A8';
const TEXT = '#0A1628';
const MUTED = '#6878A0';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const IS_NATIVE = Capacitor.isNativePlatform();

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
  onSkip: () => void;
}

export default function GoogleAuthScreen({ onSignedIn, onSkip }: Props) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (IS_NATIVE) return;
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

  async function handleNativeSignIn() {
    setLoading(true);
    setError('');
    try {
      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser.authentication.idToken;
      const { token, user } = await googleSignIn(idToken);
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
        ) : IS_NATIVE ? (
          <button
            onClick={handleNativeSignIn}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12,
              background: '#fff', border: '1.5px solid #dadce0', color: TEXT,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Sign in with Google
          </button>
        ) : (
          <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center' }} />
        )}

        <button
          onClick={onSkip}
          style={{
            marginTop: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: MUTED, fontSize: 12, fontWeight: 600, textDecoration: 'underline',
          }}
        >
          Continue without account
        </button>

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
