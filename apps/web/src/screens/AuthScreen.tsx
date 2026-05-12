import { useState, useEffect } from 'react';
import { login, register, forgotPassword, resetPassword } from '../api/auth';
import { useAuthStore } from '../store/authStore';

type View = 'login' | 'register' | 'forgot' | 'reset';

const RED = '#FF1C1C';

const inp: React.CSSProperties = {
  width: '100%',
  background: '#0C0C0C',
  border: '1px solid #2A2A2A',
  borderRadius: 10,
  color: '#fff',
  fontSize: 15,
  padding: '15px 16px',
  outline: 'none',
  marginBottom: 10,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontWeight: 500,
};

export default function AuthScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [resetToken, setResetToken] = useState('');
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('reset_token');
    if (t) { setResetToken(t); setView('reset'); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  const [view,      setView]      = useState<View>('login');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState('');

  const switchView = (v: View) => { setView(v); setError(''); setDone(''); };

  const submitAuth = async () => {
    if (!email || !password) { setError('Fill in both fields.'); return; }
    if (view === 'register' && password.length < 6) { setError('Password min 6 characters.'); return; }
    setLoading(true); setError('');
    try {
      const res = view === 'login' ? await login(email, password) : await register(email, password);
      setAuth(res.token, res.user);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  };

  const submitForgot = async () => {
    if (!email) { setError('Enter your email.'); return; }
    setLoading(true); setError('');
    try { await forgotPassword(email); setDone('Reset link sent. Check your inbox.'); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to send'); }
    finally { setLoading(false); }
  };

  const submitReset = async () => {
    if (!password) { setError('Enter a new password.'); return; }
    if (password.length < 6) { setError('Password min 6 characters.'); return; }
    if (password !== password2) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const res = await resetPassword(resetToken, password);
      setAuth(res.token, res.user);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Link may have expired'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100dvh', background: '#0C0C0C',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle red glow top-left */}
      <div style={{
        position: 'absolute', top: -120, left: -80,
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,28,28,0.08) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Brand block */}
      <div className="nrc-a nrc-a1" style={{ padding: '72px 32px 0', flex: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 4,
          color: '#C0C0C0', marginBottom: 20, textTransform: 'uppercase',
        }}>
          Performance Nutrition
        </div>
        <div style={{
          fontSize: 68, fontWeight: 900, letterSpacing: -4,
          lineHeight: 0.88, color: '#fff',
        }}>
          FUEL
        </div>
        <div style={{
          fontSize: 68, fontWeight: 900, letterSpacing: -4,
          lineHeight: 0.88, color: RED, marginBottom: 6,
        }}>
          SYNC
        </div>
        <div style={{ width: 36, height: 3, background: RED, borderRadius: 2, marginTop: 20 }} />
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 3,
          color: 'rgba(255,255,255,0.15)', marginTop: 14, textTransform: 'uppercase',
        }}>
          Hybrid Athlete OS
        </div>
      </div>

      {/* Form sheet */}
      <div className="nrc-a nrc-a2" style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{
          width: '100%', background: '#111',
          borderRadius: '24px 24px 0 0',
          padding: '28px 24px 48px',
          borderTop: '1px solid #1E1E1E',
        }}>

          {(view === 'login' || view === 'register') && (
            <>
              <div style={{
                display: 'flex', background: '#0C0C0C',
                borderRadius: 12, padding: 4, marginBottom: 22,
                border: '1px solid #1E1E1E',
              }}>
                {(['login', 'register'] as const).map((m) => (
                  <button key={m} onClick={() => switchView(m)} className="nrc-press" style={{
                    flex: 1, padding: '11px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: view === m ? RED : 'transparent',
                    color: view === m ? '#fff' : 'rgba(255,255,255,0.25)',
                    fontWeight: 700, fontSize: 12, letterSpacing: 1.5,
                    textTransform: 'uppercase', transition: 'all 0.2s',
                  }}>
                    {m === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              <input style={inp} type="email" placeholder="Email address" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAuth()} />
              <input style={inp} type="password" placeholder="Password (min 6)" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAuth()} />

              {error && <Msg type="error" msg={error} />}

              <button onClick={submitAuth} disabled={loading} className="nrc-press" style={{
                width: '100%', padding: '16px 0', borderRadius: 14, border: 'none',
                marginTop: 4, marginBottom: 14,
                background: loading ? '#1A1A1A' : RED,
                color: loading ? 'rgba(255,255,255,0.25)' : '#fff',
                fontWeight: 800, fontSize: 15, letterSpacing: 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}>
                {loading ? 'Loading…' : view === 'login' ? 'Sign In →' : 'Create Account →'}
              </button>

              {view === 'login' && (
                <div style={{ textAlign: 'center' }}>
                  <button onClick={() => switchView('forgot')} style={{
                    background: 'none', border: 'none', color: '#444',
                    fontSize: 13, cursor: 'pointer', fontWeight: 500,
                  }}>Forgot password?</button>
                </div>
              )}
            </>
          )}

          {view === 'forgot' && (
            <>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1.5, marginBottom: 8 }}>
                Reset Password
              </div>
              <div style={{ color: '#444', fontSize: 13, marginBottom: 22, lineHeight: 1.6 }}>
                Enter your email. Link valid for 1 hour.
              </div>
              <input style={inp} type="email" placeholder="Email address" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitForgot()} />
              {error && <Msg type="error" msg={error} />}
              {done  && <Msg type="done"  msg={done}  />}
              <button onClick={submitForgot} disabled={loading || !!done} className="nrc-press" style={{
                width: '100%', padding: '16px 0', borderRadius: 14, border: 'none',
                marginBottom: 14, marginTop: 4,
                background: done ? '#0F2A0F' : loading ? '#1A1A1A' : RED,
                color: done ? '#22c55e' : loading ? 'rgba(255,255,255,0.25)' : '#fff',
                fontWeight: 800, fontSize: 15, letterSpacing: 1,
                cursor: (loading || !!done) ? 'not-allowed' : 'pointer',
              }}>
                {done ? 'Email Sent ✓' : loading ? 'Sending…' : 'Send Reset Link →'}
              </button>
              <div style={{ textAlign: 'center' }}>
                <button onClick={() => switchView('login')} style={{
                  background: 'none', border: 'none', color: '#444',
                  fontSize: 13, cursor: 'pointer',
                }}>← Back to sign in</button>
              </div>
            </>
          )}

          {view === 'reset' && (
            <>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1.5, marginBottom: 22 }}>
                New Password
              </div>
              <input style={inp} type="password" placeholder="New password (min 6)" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitReset()} />
              <input style={inp} type="password" placeholder="Confirm password" value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitReset()} />
              {error && <Msg type="error" msg={error} />}
              <button onClick={submitReset} disabled={loading} className="nrc-press" style={{
                width: '100%', padding: '16px 0', borderRadius: 14, border: 'none', marginTop: 4,
                background: loading ? '#1A1A1A' : RED,
                color: loading ? 'rgba(255,255,255,0.25)' : '#fff',
                fontWeight: 800, fontSize: 15, letterSpacing: 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}>
                {loading ? 'Saving…' : 'Set Password →'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Msg({ type, msg }: { type: 'error' | 'done'; msg: string }) {
  return (
    <div style={{
      fontSize: 13, marginBottom: 12, padding: '11px 14px', borderRadius: 10,
      background: type === 'error' ? 'rgba(255,28,28,0.08)' : 'rgba(34,197,94,0.08)',
      color: type === 'error' ? '#FF1C1C' : '#22c55e',
      fontWeight: 600, border: `1px solid ${type === 'error' ? 'rgba(255,28,28,0.2)' : 'rgba(34,197,94,0.2)'}`,
    }}>
      {msg}
    </div>
  );
}
