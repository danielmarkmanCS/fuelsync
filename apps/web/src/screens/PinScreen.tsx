import { useState, useEffect, useCallback } from 'react';
import { verifyPin, verifySecurityAnswer, resetPin, getSecurityQuestion } from '../lib/pin';
import { db } from '../lib/db';
import { useAuthStore } from '../store/authStore';
import { T, CARD, BTN_PRIMARY, BTN_GHOST, INPUT } from '../theme';

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.ceil(s / 60)}m`;
}

type ForgotStep = 'question' | 'newPin';

export default function PinScreen() {
  const setPinVerified = useAuthStore((s) => s.setPinVerified);

  const [digits, setDigits]   = useState('');
  const [error, setError]     = useState('');
  const [locked, setLocked]   = useState(false);
  const [lockMs, setLockMs]   = useState(0);
  const [wiped, setWiped]     = useState(false);
  const [shaking, setShaking] = useState(false);
  const [totalAttempts, setTotalAttempts] = useState(0);

  const [showForgot, setShowForgot]   = useState(false);
  const [forgotStep, setForgotStep]   = useState<ForgotStep>('question');
  const [secQuestion, setSecQuestion] = useState('');
  const [secAnswer, setSecAnswer]     = useState('');
  const [secError, setSecError]       = useState('');
  const [secLoading, setSecLoading]   = useState(false);

  const [newPin, setNewPin]         = useState('');
  const [newPinConf, setNewPinConf] = useState('');
  const [pinError, setPinError]     = useState('');
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
      setError(rem <= 2 ? `Wrong PIN — ${rem} attempt${rem === 1 ? '' : 's'} left` : 'Wrong PIN');
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
      setSecError(`Wrong answer — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left before data wipe.`);
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

  if (wiped) {
    return (
      <div style={page}>
        <div style={{ textAlign: 'center', padding: '0 32px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 8 }}>Data Wiped</div>
          <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            Too many failed attempts. All data has been erased.
          </div>
          <button onClick={() => window.location.reload()} style={{ ...BTN_PRIMARY, width: 200 }}>
            Restart
          </button>
        </div>
      </div>
    );
  }

  if (showForgot && forgotStep === 'question') {
    return (
      <div style={page}>
        <div style={{ width: '100%', maxWidth: 340, padding: '0 24px' }}>
          <Logo />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.muted, textTransform: 'uppercase', textAlign: 'center', marginBottom: 28 }}>
            Recovery Question
          </div>

          {secQuestion ? (
            <>
              <div style={{ ...CARD, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: T.muted, textTransform: 'uppercase', marginBottom: 6 }}>Question</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.5 }}>{secQuestion}</div>
              </div>
              <input style={INPUT} type="text" placeholder="Your answer"
                value={secAnswer}
                onChange={(e) => { setSecAnswer(e.target.value); setSecError(''); }}
                autoComplete="off"
              />
              {secError && <ErrMsg msg={secError} />}
              <button onClick={submitSecurityAnswer} disabled={secLoading} style={{ ...BTN_PRIMARY, marginTop: 12 }}>
                {secLoading ? 'Checking…' : 'Verify Answer'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: T.muted, fontSize: 14, lineHeight: 1.6 }}>
              No recovery question set up.<br />You must wipe data to start fresh.
              <button onClick={async () => { await db.delete(); indexedDB.deleteDatabase('FuelSyncDB'); window.location.reload(); }}
                style={{ ...BTN_PRIMARY, marginTop: 24, background: T.red, boxShadow: 'none' }}>
                Wipe & Restart
              </button>
            </div>
          )}

          <button onClick={() => setShowForgot(false)} style={{ ...BTN_GHOST, display: 'block', width: '100%', textAlign: 'center', marginTop: 12 }}>
            ← Back to PIN
          </button>
        </div>
      </div>
    );
  }

  if (showForgot && forgotStep === 'newPin') {
    return (
      <div style={page}>
        <div style={{ width: '100%', maxWidth: 340, padding: '0 24px' }}>
          <Logo />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.muted, textTransform: 'uppercase', textAlign: 'center', marginBottom: 28 }}>
            Set New PIN
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>New PIN</div>
          <input style={{ ...INPUT, letterSpacing: 12, fontSize: 22, textAlign: 'center', marginBottom: 16 }}
            type="password" inputMode="numeric" maxLength={4}
            placeholder="• • • •" value={newPin}
            onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }} />

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Confirm PIN</div>
          <input style={{ ...INPUT, letterSpacing: 12, fontSize: 22, textAlign: 'center' }}
            type="password" inputMode="numeric" maxLength={4}
            placeholder="• • • •" value={newPinConf}
            onChange={(e) => { setNewPinConf(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); }} />

          {pinError && <ErrMsg msg={pinError} />}
          <button onClick={submitNewPin} disabled={pinLoading} style={{ ...BTN_PRIMARY, marginTop: 16 }}>
            {pinLoading ? 'Saving…' : 'Save New PIN'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ width: '100%', maxWidth: 320, padding: '0 24px' }}>

        <Logo />

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.muted, textTransform: 'uppercase', textAlign: 'center', marginBottom: 40 }}>
          Enter PIN
        </div>

        {/* Dot indicators */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 32,
          ...(shaking ? { animation: 'pinShake 0.4s ease' } : {}),
        }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: '50%',
              background: i < digits.length ? T.accent : 'transparent',
              border: `2px solid ${i < digits.length ? T.accent : T.edge2}`,
              transition: 'all 0.12s ease',
            }} />
          ))}
        </div>

        {(error || locked) && (
          <div style={{ textAlign: 'center', fontSize: 13, color: locked ? T.muted : T.red, fontWeight: 600, marginBottom: 20, minHeight: 20 }}>
            {locked ? `Try again in ${fmt(lockMs)}` : error}
          </div>
        )}

        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) => {
            if (k === '') return <div key="empty" />;
            const isDel = k === '⌫';
            return (
              <button key={k} onClick={() => isDel ? del() : press(k)}
                disabled={locked} className="press" style={{
                  height: 64,
                  borderRadius: 12,
                  border: isDel ? 'none' : `1px solid ${T.edge}`,
                  background: isDel ? 'transparent' : T.surf,
                  fontSize: isDel ? 20 : 22,
                  fontWeight: isDel ? 400 : 600,
                  color: locked ? T.muted2 : isDel ? T.muted : T.text,
                  cursor: locked ? 'not-allowed' : 'pointer',
                  boxShadow: isDel ? 'none' : T.shadow,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {k}
              </button>
            );
          })}
        </div>

        {totalAttempts >= 10 && !locked && (
          <div style={{
            textAlign: 'center', marginTop: 20, fontSize: 12, fontWeight: 600,
            color: totalAttempts >= 13 ? T.red : T.muted,
            padding: '8px 12px',
            background: totalAttempts >= 13 ? 'rgba(229,57,53,0.06)' : T.surf2,
            borderRadius: 8,
            border: `1px solid ${totalAttempts >= 13 ? 'rgba(229,57,53,0.18)' : T.edge}`,
          }}>
            {totalAttempts} of 15 attempts — data wipes at 15
          </div>
        )}

        <button onClick={openForgot} style={{ ...BTN_GHOST, display: 'block', width: '100%', textAlign: 'center', marginTop: 28 }}>
          Forgot PIN?
        </button>
      </div>

      <style>{`
        @keyframes pinShake {
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

function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 8 }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1, color: T.text }}>
        Fuel<span style={{ color: T.accent }}>Sync</span>
      </div>
    </div>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return (
    <div style={{ fontSize: 13, color: T.red, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>
      {msg}
    </div>
  );
}

const page: React.CSSProperties = {
  position:       'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  background:     T.bg,
  overflowY:      'auto',
};
