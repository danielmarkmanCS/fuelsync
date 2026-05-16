import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { updateProfile } from '../api/auth';

const RED   = '#FF3B30';
const CARD  = '#111111';
const CARD2 = '#181818';
const BORD  = '#222222';

const ACTIVITY_LEVELS = [
  { value: 'sedentary',    label: 'Sedentary',   desc: 'Desk job, little or no exercise' },
  { value: 'light',        label: 'Light',        desc: '1–3 training days / week' },
  { value: 'moderate',     label: 'Moderate',     desc: '3–5 training days / week' },
  { value: 'very_active',  label: 'Very Active',  desc: '6–7 training days / week' },
  { value: 'extra_active', label: 'Extra Active', desc: 'Twice-daily training' },
] as const;
type ActivityLevel = typeof ACTIVITY_LEVELS[number]['value'];

const inp: React.CSSProperties = {
  width: '100%', background: CARD2, border: `1px solid ${BORD}`,
  borderRadius: 10, color: '#FFFFFF', fontSize: 15, padding: '14px 15px', outline: 'none',
  marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
};

export default function ProfileSetupScreen() {
  const { user, setUser, logout } = useAuthStore();
  const name = user?.displayName || 'ATHLETE';

  const [displayName,   setDisplayName]   = useState(user?.displayName ?? '');
  const [weightKg,      setWeightKg]      = useState(user?.weightKg?.toString()  ?? '');
  const [heightCm,      setHeightCm]      = useState(user?.heightCm?.toString()  ?? '');
  const [age,           setAge]           = useState(user?.age?.toString()       ?? '');
  const [gender,        setGender]        = useState<'male' | 'female'>(user?.gender ?? 'male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>((user?.activityLevel as ActivityLevel) ?? 'moderate');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState('');

  const handleSave = async () => {
    const w = parseFloat(weightKg), h = parseFloat(heightCm), a = parseInt(age, 10);
    if (isNaN(w) || w < 30 || w > 300)  { setError('Valid weight: 30–300 kg.'); return; }
    if (isNaN(h) || h < 100 || h > 250) { setError('Valid height: 100–250 cm.'); return; }
    if (isNaN(a) || a < 10 || a > 100)  { setError('Valid age: 10–100.'); return; }
    setSaving(true); setError('');
    try {
      const updated = await updateProfile({ weightKg: w, heightCm: h, age: a, gender, activityLevel, displayName: displayName.trim() || undefined });
      setUser(updated); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  const profileComplete = user?.weightKg && user?.heightCm && user?.age;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0C0C0C' }}>

      <div className="nrc-a nrc-a1" style={{ padding: '28px 20px 0', marginBottom: 24 }}>
        <div className="nrc-label" style={{ marginBottom: 6 }}>Athlete Profile</div>
        <div className="nrc-hero" style={{ fontSize: 44 }}>{name.toUpperCase()}</div>
        {!profileComplete && (
          <div style={{ color: '#555555', fontSize: 13, marginTop: 10, fontWeight: 500, lineHeight: 1.5 }}>
            Complete your profile to unlock personalised targets.
          </div>
        )}
      </div>

      {profileComplete && (
        <div className="nrc-a nrc-a2" style={{ padding: '0 20px', marginBottom: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Weight', value: `${user!.weightKg}`, unit: 'KG' },
              { label: 'Height', value: `${user!.heightCm}`, unit: 'CM' },
              { label: 'Age',    value: `${user!.age}`,      unit: 'YR' },
            ].map(({ label, value, unit }) => (
              <div key={label} className="nrc-press" style={{
                background: CARD, borderRadius: 16, padding: '16px 12px',
                border: `1px solid ${BORD}`,
              }}>
                <div className="nrc-hero" style={{ fontSize: 32, color: RED, lineHeight: 1, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#555555', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#444444', letterSpacing: 1 }}>{unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px 40px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#555555', textTransform: 'uppercase', marginBottom: 12 }}>Display Name</div>
        <input style={{ ...inp, marginBottom: 24 }} type="text" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#555555', textTransform: 'uppercase', marginBottom: 12 }}>Body Stats</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...inp, flex: 1 }} type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="Weight (kg)" />
          <input style={{ ...inp, flex: 1 }} type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="Height (cm)" />
        </div>
        <input style={inp} type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" />

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#555555', textTransform: 'uppercase', marginBottom: 12, marginTop: 6 }}>Biological Sex</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          {(['male', 'female'] as const).map((g) => (
            <button key={g} onClick={() => setGender(g)} className="nrc-press" style={{
              flex: 1, padding: 15, borderRadius: 12, cursor: 'pointer', border: '1px solid',
              borderColor: gender === g ? RED : BORD,
              background: gender === g ? 'rgba(255,59,48,0.08)' : CARD2,
              color: gender === g ? RED : '#666666',
              fontWeight: 800, fontSize: 14, letterSpacing: 0.5, transition: 'all 0.2s',
            }}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>
          ))}
        </div>

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#555555', textTransform: 'uppercase', marginBottom: 12 }}>Activity Level</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {ACTIVITY_LEVELS.map(({ value, label, desc }) => {
            const active = activityLevel === value;
            return (
              <button key={value} onClick={() => setActivityLevel(value)} className="nrc-press" style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                background: active ? 'rgba(255,59,48,0.08)' : CARD2,
                border: '1px solid', borderColor: active ? RED : BORD,
                borderLeft: active ? `3px solid ${RED}` : `1px solid ${BORD}`, transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: active ? RED : '#444444', marginBottom: 3, letterSpacing: -0.3 }}>{label}</div>
                <div style={{ fontSize: 12, color: active ? '#888888' : '#333333', fontWeight: 500 }}>{desc}</div>
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ color: RED, fontSize: 13, marginBottom: 16, padding: '12px 14px', background: 'rgba(255,28,28,0.06)', borderRadius: 12, fontWeight: 600, border: '1px solid rgba(255,28,28,0.15)' }}>
            {error}
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="nrc-press" style={{
          width: '100%', padding: '16px 0', borderRadius: 14, marginBottom: 20,
          background: saved ? 'rgba(34,197,94,0.1)' : saving ? CARD2 : RED,
          color: saved ? '#22c55e' : saving ? '#555555' : '#fff',
          fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
          cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
          border: saved ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent',
        }}>
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Profile →'}
        </button>

        <div style={{ background: CARD, borderRadius: 16, padding: '16px 18px', border: `1px solid ${BORD}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#555555', textTransform: 'uppercase', marginBottom: 14 }}>Session</div>
          <button onClick={() => { if (window.confirm('Lock the app?')) logout(); }} className="nrc-press" style={{
            width: '100%', padding: 13, borderRadius: 10,
            border: '1px solid rgba(255,28,28,0.2)',
            background: 'none', color: RED,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>Lock App</button>
        </div>
      </div>
    </div>
  );
}
