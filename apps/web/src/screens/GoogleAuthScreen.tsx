import { useEffect, useRef, useState } from 'react';
import { googleSignIn, setSyncToken, getMe, redeemPairingCode } from '../api/syncClient';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const IS_NATIVE = Capacitor.isNativePlatform();

declare global {
  interface Window {
    google?: {
      accounts: { id: {
        initialize: (cfg: object) => void;
        renderButton: (el: HTMLElement, cfg: object) => void;
        prompt: () => void;
      }};
    };
  }
}

interface Props {
  onSignedIn: (user: { displayName: string; email: string; picture: string; weightKg: number | null; heightCm: number | null; age: number | null; gender: string | null; activityLevel: string; dailyGoal: number }) => void;
  onSkip: () => void;
}

export default function GoogleAuthScreen({ onSignedIn, onSkip }: Props) {
  const btnRef  = useRef<HTMLDivElement>(null);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [pasteToken,     setPasteToken]     = useState('');
  const [tokenError,     setTokenError]     = useState('');
  const [pairCode,       setPairCode]       = useState('');
  const [pairError,      setPairError]      = useState('');
  const [showPairInput,  setShowPairInput]  = useState(false);

  useEffect(() => {
    // Handle redirect-based OAuth return (id_token in URL hash)
    const hash = window.location.hash;
    if (hash.includes('id_token=')) {
      const params = new URLSearchParams(hash.slice(1));
      const idToken = params.get('id_token');
      if (idToken) {
        window.history.replaceState(null, '', window.location.pathname);
        handleCredential({ credential: idToken });
        return;
      }
    }

    if (IS_NATIVE || !CLIENT_ID) return;
    const scriptId = 'google-gsi';
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId; s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true; s.onload = initGoogle;
      document.head.appendChild(s);
    } else if (window.google) {
      initGoogle();
    }
  }, []);

  function initGoogle() {
    if (!window.google || !CLIENT_ID) return;
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: false,
    });
    // One Tap — works best on Chrome Android; silently ignored on Safari
    window.google.accounts.id.prompt();
    // Rendered button — fallback for all browsers
    if (btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline', size: 'large', width: 280,
        text: 'signin_with', shape: 'rectangular',
      });
    }
  }

  async function handleCredential(response: { credential: string }) {
    setLoading(true); setError('');
    try {
      const { token: t, user } = await googleSignIn(response.credential);
      setSyncToken(t);
      onSignedIn({
        displayName: user.display_name || user.name,
        email: user.email, picture: user.picture,
        weightKg: user.weight_kg ?? null, heightCm: user.height_cm ?? null,
        age: user.age ?? null, gender: (user.gender as string | null) ?? null,
        activityLevel: user.activity_level ?? 'moderate', dailyGoal: user.daily_goal ?? 2000,
      });
    } catch { setError('Sign-in failed. Please try again.'); }
    finally { setLoading(false); }
  }

  async function handleNativeSignIn() {
    setLoading(true); setError('');
    try {
      await GoogleAuth.initialize({ clientId: CLIENT_ID, scopes: ['profile', 'email'], grantOfflineAccess: true });
      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser?.authentication?.idToken;
      if (!idToken) throw new Error('No ID token returned');
      const { token: t, user } = await googleSignIn(idToken);
      setSyncToken(t);
      onSignedIn({
        displayName: user.display_name || user.name,
        email: user.email, picture: user.picture,
        weightKg: user.weight_kg ?? null, heightCm: user.height_cm ?? null,
        age: user.age ?? null, gender: (user.gender as string | null) ?? null,
        activityLevel: user.activity_level ?? 'moderate', dailyGoal: user.daily_goal ?? 2000,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      setError(`Sign-in failed: ${msg}`);
    } finally { setLoading(false); }
  }

  async function handlePairCode() {
    const code = pairCode.trim().toUpperCase();
    if (code.length < 6) return;
    setLoading(true); setPairError('');
    try {
      const { token: t, user } = await redeemPairingCode(code);
      setSyncToken(t);
      onSignedIn({
        displayName: user.display_name || user.name,
        email: user.email, picture: user.picture,
        weightKg: user.weight_kg ?? null, heightCm: user.height_cm ?? null,
        age: user.age ?? null, gender: (user.gender as string | null) ?? null,
        activityLevel: user.activity_level ?? 'moderate', dailyGoal: user.daily_goal ?? 2000,
      });
    } catch (e: unknown) {
      setPairError(e instanceof Error ? e.message : 'Invalid or expired code');
    } finally { setLoading(false); }
  }

  async function handlePasteToken() {
    const t = pasteToken.trim();
    if (!t) return;
    setLoading(true); setTokenError('');
    try {
      setSyncToken(t);
      const user = await getMe();
      if (!user) throw new Error('Invalid token');
      onSignedIn({
        displayName: user.display_name || user.name,
        email: user.email, picture: user.picture,
        weightKg: user.weight_kg ?? null, heightCm: user.height_cm ?? null,
        age: user.age ?? null, gender: (user.gender as string | null) ?? null,
        activityLevel: user.activity_level ?? 'moderate', dailyGoal: user.daily_goal ?? 2000,
      });
    } catch {
      setSyncToken('');
      setTokenError('Token invalid or expired. Copy it again from your phone.');
    } finally { setLoading(false); }
  }

  const T = { bg: '#F5F7F5', surf: '#FFFFFF', surf2: '#F0F2F0', edge: 'rgba(0,0,0,0.08)', text: '#1A1A1A', muted: '#757575', accent: '#0091EA', red: '#E53935' };

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: T.bg, padding: '0 24px',
    }}>
      {/* Logo */}
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1, color: T.text, marginBottom: 4 }}>
        Fuel<span style={{ color: T.accent }}>Sync</span>
      </div>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 40 }}>Track. Train. Fuel.</div>

      <div style={{
        background: T.surf, borderRadius: 16, padding: '28px 24px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
        border: `1px solid ${T.edge}`,
        width: '100%', maxWidth: 340, textAlign: 'center',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>Welcome</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24, lineHeight: 1.6 }}>
          Sign in to sync your data across all devices.
        </div>

        {loading ? (
          <div style={{ color: T.muted, fontSize: 13, padding: '12px 0' }}>Signing in…</div>
        ) : IS_NATIVE ? (
          <button onClick={handleNativeSignIn} style={{
            width: '100%', padding: '13px 0', borderRadius: 10,
            background: T.surf, border: '1.5px solid #dadce0', color: T.text,
            fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            <GoogleLogo />
            Sign in with Google
          </button>
        ) : CLIENT_ID ? (
          <div>
            {/* Google's rendered iframe button — popup mode, no redirect URI needed */}
            <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, minHeight: 44 }} />
            <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginBottom: 4 }}>
              On Safari or iPhone? Use the pairing code below instead.
            </div>
          </div>
        ) : (
          <div style={{ color: T.red, fontSize: 12, marginBottom: 16, fontWeight: 600 }}>
            Google Sign-In unavailable in this browser.
          </div>
        )}

        {/* Pairing code — primary path for phone linking */}
        {!showPairInput ? (
          <button onClick={() => { setShowPairInput(true); setShowTokenInput(false); }} style={{ marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 10, border: `1.5px solid ${T.accent}`, background: T.accent + '14', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            📱 Enter device pairing code
          </button>
        ) : (
          <div style={{ marginTop: 12, width: '100%' }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, textAlign: 'center' }}>
              On your other device → Profile → Link New Device
            </div>
            <input
              type="text" value={pairCode}
              onChange={e => setPairCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handlePairCode()}
              placeholder="6-CHAR CODE"
              maxLength={6}
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 12px', borderRadius: 8, border: `1.5px solid ${T.accent}44`, background: T.surf2, color: T.text, fontSize: 22, fontWeight: 900, outline: 'none', fontFamily: 'monospace', textAlign: 'center', letterSpacing: 6, marginBottom: 8 }}
            />
            <button onClick={handlePairCode} disabled={loading || pairCode.length < 6} style={{
              width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
              background: pairCode.length === 6 ? T.accent : T.surf2,
              color: pairCode.length === 6 ? '#fff' : T.muted,
              fontSize: 13, fontWeight: 700, cursor: pairCode.length === 6 ? 'pointer' : 'not-allowed',
            }}>
              {loading ? 'Verifying…' : 'Link Device'}
            </button>
            {pairError && <div style={{ color: T.red, fontSize: 11, marginTop: 6, textAlign: 'center' }}>{pairError}</div>}
          </div>
        )}

        {!showTokenInput ? (
          <button onClick={() => { setShowTokenInput(true); setShowPairInput(false); }} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 11, fontWeight: 600 }}>
            Have a raw token? Paste it here
          </button>
        ) : (
          <div style={{ marginTop: 12, width: '100%' }}>
            <input
              type="text" value={pasteToken}
              onChange={e => setPasteToken(e.target.value)}
              placeholder="Paste sync token…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.edge}`, background: T.surf2, color: T.text, fontSize: 12, outline: 'none', fontFamily: 'monospace', marginBottom: 8 }}
            />
            <button onClick={handlePasteToken} disabled={loading || !pasteToken.trim()} style={{
              width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
              background: pasteToken.trim() ? T.accent : T.surf2,
              color: pasteToken.trim() ? '#fff' : T.muted,
              fontSize: 13, fontWeight: 700, cursor: pasteToken.trim() ? 'pointer' : 'not-allowed',
            }}>
              {loading ? 'Verifying…' : 'Use Token'}
            </button>
            {tokenError && <div style={{ color: T.red, fontSize: 11, marginTop: 6 }}>{tokenError}</div>}
          </div>
        )}

        <button onClick={onSkip} style={{ marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}>
          Continue without account
        </button>

        {error && <div style={{ marginTop: 16, color: T.red, fontSize: 12, fontWeight: 600 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: T.muted, textAlign: 'center', maxWidth: 280 }}>
        Your data is stored securely and never shared.
      </div>
    </div>
  );
}
