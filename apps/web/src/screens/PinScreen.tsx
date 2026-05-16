import { useState, useEffect, useCallback } from 'react';
import { verifyPin, verifySecurityAnswer, resetPin, getSecurityQuestion } from '../lib/pin';
import { db } from '../lib/db';
import { useAuthStore } from '../store/authStore';

const RED = '#FF3B30';

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.ceil(s / 60)}m`;
}

type ForgotStep = 'question' | 'newPin';

export default function PinScreen() {
  const setPinVerified = useAuthStore((s) => s.setPinVerified);

  // PIN entry state
  const [digits, setDigits]     = useState('');
  const [error, setError]       = useState('');
  const [locked, setLocked]     = useState(false);
  const [lockMs, setLockMs]     = useState(0);
  const [wiped, setWiped]       = useState(false);
  const [shaking, setShaking]   = useState(false);
  const [totalAttempts, setTotalAttempts] = useState(0);

  // Forgot PIN state
  const [showForgot, setShowForgot]     = useState(false);
  const [forgotStep, setForgotStep]     = useState<ForgotStep>('question');
  const [secQuestion, setSecQuestion]   = useState('');
  const [secAnswer, setSecAnswer]       = useState('');
  const [secError, setSecError]         = useState('');
  const [secLoading, setSecLoading]     = useState(false);

  // New PIN state (after answer verified)
  const [newPin, setNewPin]       = useState('');
  const [newPinConf, setNewPinConf] = useState('');
  const [pinError, setPinError]   = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    db.pin_state.toArray().then((rows) => {
      if (rows[0]) setTotalAttempts(rows[0].totalAttempts);
    });
  }, []);

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
    if (result.ok)    { setPinVerified(true); return; }
    shake();
    setDigits('');
    setTotalAttempts((prev) => prev + 1);
    if (result.locked && result.lockedUntil) {
      setLocked(true);
      setLockMs(result.lockedUntil - Date.now());
      setError('Too many attempts.');
    } else {
      const rem = result.attemptsLeft;
      setError(rem <= 2 ? `Wrong PIN. ${rem} attempt${rem === 1 ? '' : 's'} left before lockout.` : 'Wrong PIN.');
    }
  }, [setPinVerified]);

  const press = useCallback((d: string) => {
    if (locked) return;
    setError('');
    setDigits((prev) => {
      const next = prev + d;
      if (next.length === 4) { setTimeout(() => submit(next), 80); return next; }
      return next;
    });
  }, [locked, submit]);

  const del = () => { if (!locked) { setError(''); setDigits((p) => p.slice(0, -1)); } };

  const openForgot = async () => {
    const q = await getSecurityQuestion();
    setSecQuestion(q ?? '');
    setSecAnswer(''); setSecError('');
    setForgotStep('question');
    setShowForgot(true);
  };

  const submitSecurityAnswer = async () => {
    if (!secAnswer.trim()) { setSecError('Enter your answer.'); return; }
    setSecLoading(true); setSecError('');
    const result = await verifySecurityAnswer(secAnswer.trim());
    setSecLoading(false);
    if (result.wiped) { setWiped(true); return; }
    if (result.ok) {
      setNewPin(''); setNewPinConf(''); setPinError('');
      setForgotStep('newPin');
    } else {
      setSecError(`Wrong answer. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left before data wipe.`);
    }
  };

  const submitNewPin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { setPinError('PIN must be 4 digits.'); return; }
    if (newPin !== newPinConf) { setPinError('PINs do not match.'); return; }
    setPinLoading(true);
    await resetPin(newPin);
    setPinLoading(false);
    setPinVerified(true);
  };

  // ── Wiped screen ──
  if (wiped) {
    return (
      <div style={fullPage}>
        <div style={{ textAlign: 'center', padding: '0 32px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: '#111', marginBottom: 10 }}>Data Wiped</div>
          <div style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>
            Too many failed attempts. All data has been erased.
          </div>
          <button onClick={() => window.location.reload()} style={redBtn}>Restart</button>
        </div>
      </div>
    );
  }

  // ── Forgot PIN: security question ──
  if (showForgot && forgotStep === 'question') {
    return (
      <div style={fullPage}>
        <div style={{ width: '100%', maxWidth: 360, padding: '0 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -2, color: '#111' }}>
              FUEL<span style={{ color: RED }}>SYNC</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: '#CCC', marginTop: 8, textTransform: 'uppercase' }}>
              Recovery Question
            </div>
          </div>

          {secQuestion ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16, lineHeight: 1.5 }}>
                {secQuestion}
              </div>
              <input
                style={inp}
                type="text"
                placeholder="Your answer"
                value={secAnswer}
                onChange={(e) => { setSecAnswer(e.target.value); setSecError(''); }}
                autoComplete="off"
              />
              {secError && <div style={{ fontSize: 12, color: RED, fontWeight: 600, marginBottom: 12 }}>{secError}</div>}
              <button onClick={submitSecurityAnswer} disabled={secLoading} style={redBtn}>
                {secLoading ? 'Checking…' : 'Verify Answer'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#888', fontSize: 13, lineHeight: 1.6 }}>
              No recovery question was set up.<br />You must wipe data to start fresh.
              <button onClick={async () => { await db.delete(); indexedDB.deleteDatabase('FuelSyncDB'); window.location.reload(); }}
                style={{ ...redBtn, marginTop: 20 }}>
                Wipe & Restart
              </button>
            </div>
          )}

          <button onClick={() => setShowForgot(false)} style={backBtn}>← Back to PIN</button>
        </div>
      </div>
    );
  }

  // ── Forgot PIN: set new PIN ──
  if (showForgot && forgotStep === 'newPin') {
    return (
      <div style={fullPage}>
        <div style={{ width: '100%', maxWidth: 360, padding: '0 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -2, color: '#111' }}>
              FUEL<span style={{ color: RED }}>SYNC</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: '#CCC', marginTop: 8, textTransform: 'uppercase' }}>
              Set New PIN
            </div>
          </div>

          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 8 }}>New PIN</div>
          <input style={{ ...inp, letterSpacing: 8, fontSize: 22, textAlign: 'center' }}
            type="password" inputMode="numeric" maxLength={4}
            placeholder="• • • •" value={newPin}
            onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }} />

          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>Confirm PIN</div>
          <input style={{ ...inp, letterSpacing: 8, fontSize: 22, textAlign: 'center' }}
            type="password" inputMode="numeric" maxLength={4}
            placeholder="• • • •" value={newPinConf}
            onChange={(e) => { setNewPinConf(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }} />

          {pinError && <div style={{ fontSize: 12, color: RED, fontWeight: 600, marginBottom: 12 }}>{pinError}</div>}
          <button onClick={submitNewPin} disabled={pinLoading} style={redBtn}>
            {pinLoading ? 'Saving…' : 'Save New PIN'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main PIN entry ──
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
          <div style={{ textAlign: 'center', fontSize: 12, color: RED, fontWeight: 600, marginBottom: 20, minHeight: 18 }}>
            {error}
          </div>
        )}
        {locked && (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#888', marginBottom: 20, fontWeight: 600 }}>
            Try again in {fmt(lockMs)}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) => {
            if (k === '') return <div key="empty" />;
            return (
              <button key={k} onClick={() => k === '⌫' ? del() : press(k)}
                disabled={locked} className="nrc-press" style={{
                  height: 64, borderRadius: 16, border: '1px solid #E5E5EA',
                  background: '#FFF', fontSize: k === '⌫' ? 20 : 22,
                  fontWeight: 700, color: locked ? '#CCC' : '#111',
                  cursor: locked ? 'not-allowed' : 'pointer', transition: 'background 0.1s',
                }}>
                {k}
              </button>
            );
          })}
        </div>

        {totalAttempts >= 10 && !locked && (
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: totalAttempts >= 13 ? RED : '#CCC', fontWeight: 600 }}>
            {totalAttempts} of 15 attempts used · data wipes at 15
          </div>
        )}

        <button onClick={openForgot} style={{
          marginTop: 36, background: 'none', border: 'none',
          color: '#BBBBBB', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', textDecoration: 'underline', padding: '8px 0',
          display: 'block', margin: '36px auto 0',
        }}>
          Forgot PIN?
        </button>
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
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  background: '#F2F2F7',
  overflowY: 'scroll', WebkitOverflowScrolling: 'touch' as never,
};

const inp: React.CSSProperties = {
  width: '100%', background: '#FAFAFA', border: '1px solid #E5E5EA',
  borderRadius: 10, color: '#111', fontSize: 15, padding: '14px 15px',
  outline: 'none', marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
  boxSizing: 'border-box',
};

const redBtn: React.CSSProperties = {
  width: '100%', padding: '15px 0', borderRadius: 14, border: 'none',
  background: RED, color: '#fff', fontWeight: 800, fontSize: 15,
  cursor: 'pointer', marginTop: 8, display: 'block',
};

const backBtn: React.CSSProperties = {
  width: '100%', background: 'none', border: 'none', color: '#AAA',
  fontSize: 13, cursor: 'pointer', marginTop: 12, padding: '10px 0',
};
