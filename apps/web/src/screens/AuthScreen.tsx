import { useState } from 'react';
import { createProfile } from '../api/auth';
import { setupPin } from '../lib/pin';
import { useAuthStore } from '../store/authStore';

const RED = '#FF3B30';

const ACTIVITY_LEVELS = [
  { value: 'sedentary',    label: 'Sedentary',   desc: 'Desk job, little or no exercise' },
  { value: 'light',        label: 'Light',        desc: '1–3 training days / week' },
  { value: 'moderate',     label: 'Moderate',     desc: '3–5 training days / week' },
  { value: 'very_active',  label: 'Very Active',  desc: '6–7 training days / week' },
  { value: 'extra_active', label: 'Extra Active', desc: 'Twice-daily training' },
] as const;
type ActivityLevel = typeof ACTIVITY_LEVELS[number]['value'];

const inp: React.CSSProperties = {
  width: '100%', background: '#FAFAFA', border: '1px solid #E5E5EA',
  borderRadius: 10, color: '#111111', fontSize: 15, padding: '14px 15px',
  outline: 'none', marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
};

type Step = 'profile' | 'pin';

export default function AuthScreen() {
  const { setUser, setPinVerified } = useAuthStore();

  const [step, setStep] = useState<Step>('profile');

  // Profile fields
  const [displayName,   setDisplayName]   = useState('');
  const [weightKg,      setWeightKg]      = useState('');
  const [heightCm,      setHeightCm]      = useState('');
  const [age,           setAge]           = useState('');
  const [gender,        setGender]        = useState<'male' | 'female'>('male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');

  // PIN fields
  const [pin,     setPin]     = useState('');
  const [pinConf, setPinConf] = useState('');

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const validateProfile = () => {
    const w = parseFloat(weightKg), h = parseFloat(heightCm), a = parseInt(age, 10);
    if (!displayName.trim()) { setError('Enter your name.'); return false; }
    if (isNaN(w) || w < 30 || w > 300)  { setError('Valid weight: 30–300 kg.'); return false; }
    if (isNaN(h) || h < 100 || h > 250) { setError('Valid height: 100–250 cm.'); return false; }
    if (isNaN(a) || a < 10 || a > 100)  { setError('Valid age: 10–100.'); return false; }
    return true;
  };

  const goToPin = () => {
    if (!validateProfile()) return;
    setError('');
    setStep('pin');
  };

  const finish = async () => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { setError('PIN must be 4 digits.'); return; }
    if (pin !== pinConf) { setError('PINs do not match.'); return; }
    setLoading(true); setError('');
    try {
      const user = await createProfile({
        displayName: displayName.trim(),
        weightKg: parseFloat(weightKg),
        heightCm: parseFloat(heightCm),
        age: parseInt(age, 10),
        gender,
        activityLevel,
        dailyGoal: 2000,
      });
      await setupPin(pin);
      setUser(user);
      setPinVerified(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to set up. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ height: '100%', background: '#F2F2F7', overflowY: 'auto', position: 'relative' }}>
      <div style={{ position: 'absolute', top: -120, left: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,48,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />

      <div className="nrc-a nrc-a1" style={{ padding: '72px 32px 28px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 4, color: '#AAAAAA', marginBottom: 20, textTransform: 'uppercase' }}>Performance Nutrition</div>
        <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: -4, lineHeight: 0.88, color: '#111111' }}>FUEL</div>
        <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: -4, lineHeight: 0.88, color: RED, marginBottom: 6 }}>SYNC</div>
        <div style={{ width: 36, height: 3, background: RED, borderRadius: 2, marginTop: 20 }} />
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 3, color: '#CCCCCC', marginTop: 14, textTransform: 'uppercase' }}>
          {step === 'profile' ? 'Step 1 of 2 — Your Profile' : 'Step 2 of 2 — Set PIN'}
        </div>
      </div>

      <div className="nrc-a nrc-a2">
        <div style={{ width: '100%', background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '28px 24px 48px', borderTop: '1px solid #E5E5EA', boxShadow: '0 -4px 24px rgba(0,0,0,0.06)', minHeight: 'calc(100dvh - 260px)' }}>

          {step === 'profile' && (
            <>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, marginBottom: 20 }}>Tell us about yourself</div>

              <input style={inp} type="text" placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <div style={{ display: 'flex', gap: 10 }}>
                <input style={{ ...inp, flex: 1 }} type="number" placeholder="Weight (kg)" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
                <input style={{ ...inp, flex: 1 }} type="number" placeholder="Height (cm)" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
              </div>
              <input style={inp} type="number" placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)} />

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 10, marginTop: 4 }}>Biological Sex</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                {(['male', 'female'] as const).map((g) => (
                  <button key={g} onClick={() => setGender(g)} className="nrc-press" style={{
                    flex: 1, padding: 13, borderRadius: 12, cursor: 'pointer', border: '1px solid',
                    borderColor: gender === g ? RED : '#E5E5EA',
                    background: gender === g ? 'rgba(255,59,48,0.06)' : '#FAFAFA',
                    color: gender === g ? RED : '#888', fontWeight: 800, fontSize: 14, transition: 'all 0.2s',
                  }}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>
                ))}
              </div>

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 10 }}>Activity Level</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {ACTIVITY_LEVELS.map(({ value, label, desc }) => {
                  const active = activityLevel === value;
                  return (
                    <button key={value} onClick={() => setActivityLevel(value)} className="nrc-press" style={{
                      textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      background: active ? '#FFF5F4' : '#FAFAFA',
                      border: '1px solid', borderColor: active ? RED : '#EEEEEE',
                      borderLeft: active ? `3px solid ${RED}` : '1px solid #EEEEEE', transition: 'all 0.15s',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: active ? RED : '#BBBBBB', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 11, color: active ? '#666' : '#CCC', fontWeight: 500 }}>{desc}</div>
                    </button>
                  );
                })}
              </div>

              {error && <Msg type="error" msg={error} />}

              <button onClick={goToPin} className="nrc-press" style={primaryBtn(false)}>
                Next: Set PIN →
              </button>
            </>
          )}

          {step === 'pin' && (
            <>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>Secure your data</div>
              <div style={{ color: '#888', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
                Choose a 4-digit PIN. After 15 wrong attempts all data is wiped.
              </div>

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 8 }}>PIN</div>
              <input style={{ ...inp, letterSpacing: 8, fontSize: 22, textAlign: 'center' }}
                type="password" inputMode="numeric" maxLength={4}
                placeholder="• • • •" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />

              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>Confirm PIN</div>
              <input style={{ ...inp, letterSpacing: 8, fontSize: 22, textAlign: 'center' }}
                type="password" inputMode="numeric" maxLength={4}
                placeholder="• • • •" value={pinConf} onChange={(e) => setPinConf(e.target.value.replace(/\D/g, '').slice(0, 4))} />

              {error && <Msg type="error" msg={error} />}

              <button onClick={finish} disabled={loading} className="nrc-press" style={primaryBtn(loading)}>
                {loading ? 'Setting up…' : 'Start Training →'}
              </button>

              <button onClick={() => { setStep('profile'); setError(''); }} style={{
                width: '100%', background: 'none', border: 'none', color: '#AAA',
                fontSize: 13, cursor: 'pointer', marginTop: 8, padding: '10px 0',
              }}>← Back</button>
            </>
          )}
        </div>
    </div>
  );
}

function Msg({ type, msg }: { type: 'error' | 'done'; msg: string }) {
  return (
    <div style={{
      fontSize: 13, marginBottom: 12, padding: '11px 14px', borderRadius: 10,
      background: type === 'error' ? 'rgba(255,59,48,0.06)' : 'rgba(34,197,94,0.08)',
      color: type === 'error' ? '#FF3B30' : '#22c55e',
      fontWeight: 600, border: `1px solid ${type === 'error' ? 'rgba(255,59,48,0.18)' : 'rgba(34,197,94,0.2)'}`,
    }}>{msg}</div>
  );
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '16px 0', borderRadius: 14, border: 'none',
    marginTop: 4, marginBottom: 14,
    background: disabled ? '#F2F2F7' : RED,
    color: disabled ? '#AAAAAA' : '#fff',
    fontWeight: 800, fontSize: 15, letterSpacing: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
