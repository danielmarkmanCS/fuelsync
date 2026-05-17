import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { updateProfile } from '../api/auth';

const BG     = '#060606';
const SURF   = '#0F0F0F';
const SURF2  = '#161616';
const EDGE   = 'rgba(255,255,255,0.08)';
const RED    = '#FF453A';
const GREEN  = '#30D158';

const ACTIVITY_LEVELS = [
  { value: 'sedentary',    label: 'Sedentary',   desc: 'Desk job, little or no exercise' },
  { value: 'light',        label: 'Light',        desc: '1–3 training days / week' },
  { value: 'moderate',     label: 'Moderate',     desc: '3–5 training days / week' },
  { value: 'very_active',  label: 'Very Active',  desc: '6–7 training days / week' },
  { value: 'extra_active', label: 'Extra Active', desc: 'Twice-daily training' },
] as const;
type ActivityLevel = typeof ACTIVITY_LEVELS[number]['value'];

const inp: React.CSSProperties = {
  width: '100%', background: SURF2, border: `1px solid ${EDGE}`,
  borderRadius: 12, color: '#FFFFFF', fontSize: 15, padding: '14px 15px',
  outline: 'none', marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
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
    <div style={{ height: '100%', overflowY: 'auto', background: BG }}>

      {/* Header */}
      <div className="nrc-a nrc-a1" style={{ padding: '36px 22px 0', marginBottom: 28 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#2A2A2A', marginBottom: 4, textTransform: 'uppercase' }}>Athlete Profile</div>
        <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1, color: '#FFFFFF' }}>{name.toUpperCase()}</div>
        {!profileComplete && (
          <div style={{ color: '#333333', fontSize: 13, marginTop: 12, fontWeight: 500, lineHeight: 1.5 }}>
            Complete your profile to unlock personalised targets.
          </div>
        )}
      </div>

      {/* Stats grid */}
      {profileComplete && (
        <div className="nrc-a nrc-a2" style={{ padding: '0 22px', marginBottom: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Weight', value: `${user!.weightKg}`, unit: 'KG', color: RED },
              { label: 'Height', value: `${user!.heightCm}`, unit: 'CM', color: '#5AC8FA' },
              { label: 'Age',    value: `${user!.age}`,      unit: 'YR', color: GREEN },
            ].map(({ label, value, unit, color }) => (
              <div key={label} className="nrc-press" style={{ background: SURF, borderRadius: 16, padding: '16px 12px', border: `1px solid ${EDGE}`, borderTop: `2px solid ${color}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: color, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1.5, color: '#FFFFFF', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#333333', letterSpacing: 1, marginTop: 4 }}>{unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 22px 48px' }}>

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Display Name</div>
        <input style={{ ...inp, marginBottom: 24 }} type="text" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Body Stats</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...inp, flex: 1 }} type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="Weight (kg)" />
          <input style={{ ...inp, flex: 1 }} type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="Height (cm)" />
        </div>
        <input style={inp} type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" />

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10, marginTop: 6 }}>Biological Sex</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          {(['male', 'female'] as const).map((g) => (
            <button key={g} onClick={() => setGender(g)} className="nrc-press" style={{
              flex: 1, padding: 15, borderRadius: 12, cursor: 'pointer', border: '1px solid',
              borderColor: gender === g ? RED : EDGE,
              borderTop: gender === g ? `2px solid ${RED}` : `1px solid ${EDGE}`,
              background: gender === g ? `${RED}0A` : SURF2,
              color: gender === g ? RED : '#444444',
              fontWeight: 800, fontSize: 14, transition: 'all 0.2s',
            }}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>
          ))}
        </div>

        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Activity Level</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {ACTIVITY_LEVELS.map(({ value, label, desc }) => {
            const active = activityLevel === value;
            return (
              <button key={value} onClick={() => setActivityLevel(value)} className="nrc-press" style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                background: active ? `${RED}0A` : SURF2,
                border: `1px solid ${active ? RED : EDGE}`,
                borderLeft: active ? `3px solid ${RED}` : `1px solid ${EDGE}`,
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: active ? RED : '#333333', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, color: active ? '#555555' : '#2A2A2A', fontWeight: 500 }}>{desc}</div>
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{ color: RED, fontSize: 13, marginBottom: 16, padding: '12px 14px', background: `${RED}08`, borderRadius: 12, fontWeight: 600, border: `1px solid ${RED}20` }}>
            {error}
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="nrc-press" style={{
          width: '100%', padding: '16px 0', borderRadius: 14, marginBottom: 16,
          background: saved ? `${GREEN}12` : saving ? SURF2 : RED,
          color: saved ? GREEN : saving ? '#333333' : '#fff',
          fontWeight: 800, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer',
          border: saved ? `1px solid ${GREEN}30` : '1px solid transparent',
          boxShadow: (!saved && !saving) ? `0 4px 20px ${RED}40` : 'none',
        }}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Profile →'}
        </button>

        <div style={{ background: SURF, borderRadius: 16, padding: '16px 18px', border: `1px solid ${EDGE}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 14 }}>Session</div>
          <button onClick={() => { if (window.confirm('Lock the app?')) logout(); }} className="nrc-press" style={{
            width: '100%', padding: 13, borderRadius: 10,
            border: `1px solid ${RED}25`, background: 'none', color: RED,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>Lock App</button>
        </div>
      </div>
    </div>
  );
}
