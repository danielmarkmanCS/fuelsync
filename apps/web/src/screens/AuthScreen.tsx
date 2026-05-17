import { useState } from 'react';
import { createProfile } from '../api/auth';
import { setupPin, setupSecurityQuestion } from '../lib/pin';
import { useAuthStore } from '../store/authStore';

const SURF   = '#0F0F0F';
const SURF2  = '#161616';
const EDGE   = 'rgba(255,255,255,0.08)';
const RED    = '#FF453A';

const ACTIVITY_LEVELS = [
  { value: 'sedentary',    label: 'Sedentary',   desc: 'Desk job, little or no exercise' },
  { value: 'light',        label: 'Light',        desc: '1–3 training days / week' },
  { value: 'moderate',     label: 'Moderate',     desc: '3–5 training days / week' },
  { value: 'very_active',  label: 'Very Active',  desc: '6–7 training days / week' },
  { value: 'extra_active', label: 'Extra Active', desc: 'Twice-daily training' },
] as const;
type ActivityLevel = typeof ACTIVITY_LEVELS[number]['value'];

const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  "What is your mother's maiden name?",
  'What was the name of your elementary school?',
  'What was your childhood nickname?',
] as const;

const inp: React.CSSProperties = {
  width: '100%', background: SURF2, border: `1px solid ${EDGE}`,
  borderRadius: 12, color: '#FFFFFF', fontSize: 15, padding: '14px 15px',
  outline: 'none', marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
};

type Step = 'profile' | 'pin' | 'security';

export default function AuthScreen() {
  const { setUser, setPinVerified } = useAuthStore();
  const [step, setStep] = useState<Step>('profile');

  const [displayName,   setDisplayName]   = useState('');
  const [weightKg,      setWeightKg]      = useState('');
  const [heightCm,      setHeightCm]      = useState('');
  const [age,           setAge]           = useState('');
  const [gender,        setGender]        = useState<'male' | 'female'>('male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [pin,           setPin]           = useState('');
  const [pinConf,       setPinConf]       = useState('');
  const [secQuestion,   setSecQuestion]   = useState<string>(SECURITY_QUESTIONS[0]);
  const [secAnswer,     setSecAnswer]     = useState('');
  const [secConf,       setSecConf]       = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  const validateProfile = () => {
    const w = parseFloat(weightKg), h = parseFloat(heightCm), a = parseInt(age, 10);
    if (!displayName.trim())             { setError('Enter your name.'); return false; }
    if (isNaN(w) || w < 30 || w > 300)  { setError('Valid weight: 30–300 kg.'); return false; }
    if (isNaN(h) || h < 100 || h > 250) { setError('Valid height: 100–250 cm.'); return false; }
    if (isNaN(a) || a < 10 || a > 100)  { setError('Valid age: 10–100.'); return false; }
    return true;
  };

  const goToPin = () => { if (!validateProfile()) return; setError(''); setStep('pin'); };

  const goToSecurity = () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { setError('PIN must be 4 digits.'); return; }
    if (pin !== pinConf) { setError('PINs do not match.'); return; }
    setError(''); setStep('security');
  };

  const finish = async () => {
    if (!secAnswer.trim())                            { setError('Enter your answer.'); return; }
    if (secAnswer.trim().length < 2)                  { setError('Answer too short.'); return; }
    if (secAnswer.trim() !== secConf.trim())           { setError('Answers do not match.'); return; }
    setLoading(true); setError('');
    try {
      const user = await createProfile({ displayName: displayName.trim(), weightKg: parseFloat(weightKg), heightCm: parseFloat(heightCm), age: parseInt(age, 10), gender, activityLevel, dailyGoal: 2000 });
      await setupPin(pin);
      await setupSecurityQuestion(secQuestion, secAnswer.trim());
      setUser(user); setPinVerified(true);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to set up. Try again.'); }
    finally { setLoading(false); }
  };

  const stepNum = step === 'profile' ? 1 : step === 'pin' ? 2 : 3;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#060606', overflowY: 'scroll', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

      {/* Hero */}
      <div style={{ padding: '72px 32px 32px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -100, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,58,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -5, lineHeight: 0.88, color: '#FFFFFF' }}>FUEL</div>
        <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -5, lineHeight: 0.88, color: RED }}>SYNC</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24 }}>
          {[1,2,3].map((n) => (
            <div key={n} style={{
              width: n === stepNum ? 24 : 8, height: 8, borderRadius: 4,
              background: n <= stepNum ? RED : '#1A1A1A',
              transition: 'all 0.3s ease',
            }} />
          ))}
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: '#333333', marginLeft: 4 }}>
            STEP {stepNum} OF 3
          </div>
        </div>
      </div>

      {/* Card */}
      <div style={{ background: SURF, borderRadius: '24px 24px 0 0', padding: '28px 24px 56px', borderTop: `1px solid ${EDGE}`, minHeight: 'calc(100dvh - 280px)' }}>

        {step === 'profile' && (
          <>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, marginBottom: 20, color: '#FFFFFF' }}>Tell us about yourself</div>
            <input style={inp} type="text" placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <div style={{ display: 'flex', gap: 10 }}>
              <input style={{ ...inp, flex: 1 }} type="number" placeholder="Weight (kg)" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
              <input style={{ ...inp, flex: 1 }} type="number" placeholder="Height (cm)" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
            <input style={inp} type="number" placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)} />

            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10, marginTop: 4 }}>Biological Sex</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {(['male', 'female'] as const).map((g) => (
                <button key={g} onClick={() => setGender(g)} className="nrc-press" style={{
                  flex: 1, padding: 13, borderRadius: 12, cursor: 'pointer', border: `1px solid ${gender === g ? RED : EDGE}`,
                  borderTop: gender === g ? `2px solid ${RED}` : `1px solid ${EDGE}`,
                  background: gender === g ? `${RED}0A` : SURF2,
                  color: gender === g ? RED : '#444444', fontWeight: 800, fontSize: 14,
                }}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>
              ))}
            </div>

            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Activity Level</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {ACTIVITY_LEVELS.map(({ value, label, desc }) => {
                const active = activityLevel === value;
                return (
                  <button key={value} onClick={() => setActivityLevel(value)} className="nrc-press" style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: active ? `${RED}0A` : SURF2,
                    border: `1px solid ${active ? RED : EDGE}`,
                    borderLeft: active ? `3px solid ${RED}` : `1px solid ${EDGE}`,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: active ? RED : '#333333', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 11, color: active ? '#555555' : '#222222', fontWeight: 500 }}>{desc}</div>
                  </button>
                );
              })}
            </div>
            {error && <ErrBox msg={error} />}
            <Btn onClick={goToPin} disabled={false}>Next: Set PIN →</Btn>
          </>
        )}

        {step === 'pin' && (
          <>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, marginBottom: 8, color: '#FFFFFF' }}>Secure your data</div>
            <div style={{ color: '#444444', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              Choose a 4-digit PIN. After 15 wrong attempts all data is wiped.
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 8 }}>PIN</div>
            <input style={{ ...inp, letterSpacing: 10, fontSize: 24, textAlign: 'center' }}
              type="password" inputMode="numeric" maxLength={4}
              placeholder="• • • •" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>Confirm PIN</div>
            <input style={{ ...inp, letterSpacing: 10, fontSize: 24, textAlign: 'center' }}
              type="password" inputMode="numeric" maxLength={4}
              placeholder="• • • •" value={pinConf} onChange={(e) => setPinConf(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            {error && <ErrBox msg={error} />}
            <Btn onClick={goToSecurity} disabled={false}>Next: Recovery Question →</Btn>
            <Back onClick={() => { setStep('profile'); setError(''); }} />
          </>
        )}

        {step === 'security' && (
          <>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, marginBottom: 8, color: '#FFFFFF' }}>Recovery Question</div>
            <div style={{ color: '#444444', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              If you forget your PIN, answer this instead of wiping all data.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {SECURITY_QUESTIONS.map((q) => {
                const active = secQuestion === q;
                return (
                  <button key={q} onClick={() => setSecQuestion(q)} className="nrc-press" style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: active ? `${RED}0A` : SURF2,
                    border: `1px solid ${active ? RED : EDGE}`,
                    borderLeft: active ? `3px solid ${RED}` : `1px solid ${EDGE}`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? RED : '#333333' }}>{q}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 8 }}>Your Answer</div>
            <input style={inp} type="text" placeholder="Answer" value={secAnswer} onChange={(e) => setSecAnswer(e.target.value)} autoComplete="off" />
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>Confirm Answer</div>
            <input style={inp} type="text" placeholder="Repeat answer" value={secConf} onChange={(e) => setSecConf(e.target.value)} autoComplete="off" />
            <div style={{ fontSize: 11, color: '#2A2A2A', marginBottom: 16, lineHeight: 1.5 }}>Case-insensitive. 5 wrong answers = data wipe.</div>
            {error && <ErrBox msg={error} />}
            <Btn onClick={finish} disabled={loading}>{loading ? 'Setting up…' : 'Start Training →'}</Btn>
            <Back onClick={() => { setStep('pin'); setError(''); }} />
          </>
        )}
      </div>
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ fontSize: 13, marginBottom: 12, padding: '11px 14px', borderRadius: 10, background: `${RED}08`, color: RED, fontWeight: 600, border: `1px solid ${RED}20` }}>
      {msg}
    </div>
  );
}

function Btn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="nrc-press" style={{
      width: '100%', padding: '16px 0', borderRadius: 14, border: 'none',
      marginTop: 4, marginBottom: 14,
      background: disabled ? '#161616' : RED,
      color: disabled ? '#333333' : '#fff',
      fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: disabled ? 'none' : `0 4px 20px ${RED}40`,
    }}>{children}</button>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', background: 'none', border: 'none', color: '#333333', fontSize: 13, cursor: 'pointer', padding: '10px 0' }}>
      ← Back
    </button>
  );
}
