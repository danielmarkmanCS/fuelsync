import { useState, useEffect, useCallback } from 'react';
import { verifyPin } from '../lib/pin';
import { useAuthStore } from '../store/authStore';

const RED = '#FF3B30';

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.ceil(s / 60)}m`;
}

export default function PinScreen() {
  const setPinVerified = useAuthStore((s) => s.setPinVerified);
  const [digits, setDigits]     = useState('');
  const [error, setError]       = useState('');
  const [locked, setLocked]     = useState(false);
  const [lockMs, setLockMs]     = useState(0);
  const [wiped, setWiped]       = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [shaking, setShaking]   = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    if (!locked || lockMs <= 0) return;
    const id = setInterval(() => {
      setLockMs((prev) => {
        if (prev <= 1000) { setLocked(false); clearInterval(id); return 0; }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [locked]);

  const shake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const submit = useCallback(async (pin: string) => {
    const result = await verifyPin(pin);
    if (result.wiped) { setWiped(true); return; }
    if (result.ok) { setPinVerified(true); return; }
    shake();
    setDigits('');
    if (result.locked && result.lockedUntil) {
      setLocked(true);
      setLockMs(result.lockedUntil - Date.now());
      setError('Too many attempts.');
    } else {
      setAttemptsLeft(result.attemptsLeft);
      const remaining = result.attemptsLeft;
      if (remaining <= 2) {
        setError(`Wrong PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} left before lockout.`);
      } else {
        setError('Wrong PIN.');
      }
    }
  }, [setPinVerified]);

  const press = useCallback((d: string) => {
    if (locked) return;
    setError('');
    setDigits((prev) => {
      const next = prev + d;
      if (next.length === 4) {
        setTimeout(() => submit(next), 80);
        return next;
      }
      return next;
    });
  }, [locked, submit]);

  const del = () => { if (!locked) { setError(''); setDigits((p) => p.slice(0, -1)); } };

  if (wiped) {
    return (
      <div style={fullPage}>
        <div style={{ textAlign: 'center', padding: '0 32px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: '#111', marginBottom: 10 }}>
            Data Wiped
          </div>
          <div style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>
            Too many failed attempts. All data has been erased. Reload to start fresh.
          </div>
          <button onClick={() => window.location.reload()} style={btn}>Restart</button>
        </div>
      </div>
    );
  }

  return (
    <div style={fullPage}>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -3, color: '#111', lineHeight: 1 }}>
            FUEL<span style={{ color: RED }}>SYNC</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: '#CCC', marginTop: 8, textTransform: 'uppercase' }}>
            Enter PIN
          </div>
        </div>

        {/* Dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 32,
          ...(shaking ? { animation: 'shake 0.4s ease' } : {}),
        }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < digits.length ? RED : '#E5E5EA',
              transition: 'background 0.15s',
            }} />
          ))}
        </div>

        {error && (
          <div style={{
            textAlign: 'center', fontSize: 12, color: RED,
            fontWeight: 600, marginBottom: 20, minHeight: 18,
          }}>
            {error}
          </div>
        )}

        {locked && (
          <div style={{
            textAlign: 'center', fontSize: 13, color: '#888',
            marginBottom: 20, fontWeight: 600,
          }}>
            Try again in {fmt(lockMs)}
          </div>
        )}

        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) => {
            if (k === '') return <div key="empty" />;
            return (
              <button
                key={k}
                onClick={() => k === '⌫' ? del() : press(k)}
                disabled={locked}
                className="nrc-press"
                style={{
                  height: 64, borderRadius: 16, border: '1px solid #E5E5EA',
                  background: '#FFF', fontSize: k === '⌫' ? 20 : 22,
                  fontWeight: 700, color: locked ? '#CCC' : '#111',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                {k}
              </button>
            );
          })}
        </div>

        {attemptsLeft <= 2 && !locked && (
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#CCC', fontWeight: 600 }}>
            {15 - attemptsLeft} of 15 attempts used · data wipes at 15
          </div>
        )}

        {!confirmWipe ? (
          <button onClick={() => setConfirmWipe(true)} style={{
            marginTop: 36, background: 'none', border: 'none',
            color: '#BBBBBB', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'underline', padding: '8px 0',
          }}>
            Forgot PIN?
          </button>
        ) : (
          <div style={{
            marginTop: 28, background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)',
            borderRadius: 14, padding: '18px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#FF3B30', marginBottom: 6 }}>
              ⚠️ אין שחזור סיסמא
            </div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 16 }}>
              שכחת PIN = אין דרך אחרת.<br />
              המשך ימחק את <strong>כל הנתונים</strong> לצמיתות — תצטרך להתחיל מחדש.
            </div>
            <button onClick={async () => {
              await indexedDB.deleteDatabase('FuelSyncDB');
              window.location.reload();
            }} style={{
              width: '100%', padding: '12px 0', borderRadius: 10,
              border: 'none', background: '#FF3B30', color: '#fff',
              fontWeight: 800, fontSize: 13, cursor: 'pointer', marginBottom: 8,
            }}>
              מחק הכל והתחל מחדש
            </button>
            <button onClick={() => setConfirmWipe(false)} style={{
              width: '100%', padding: '10px 0', borderRadius: 10,
              border: 'none', background: 'none', color: '#AAAAAA',
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}>
              ביטול
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-5px)}
          80%{transform:translateX(5px)}
        }
      `}</style>
    </div>
  );
}

const fullPage: React.CSSProperties = {
  minHeight: '100dvh', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  background: '#F2F2F7',
};

const btn: React.CSSProperties = {
  marginTop: 28, padding: '14px 40px', borderRadius: 14,
  border: 'none', background: RED, color: '#fff',
  fontWeight: 800, fontSize: 15, cursor: 'pointer',
};
