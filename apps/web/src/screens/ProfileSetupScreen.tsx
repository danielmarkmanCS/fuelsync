import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { updateProfile, clearProfile } from '../api/auth';
import { clearSyncToken, getSyncToken, syncProfile, syncAddLog } from '../api/syncClient';
import { db } from '../lib/db';
import { clearPin } from '../lib/pin';
import { useNutritionStore } from '../store/nutritionStore';

const BG     = '#0E1117';
const SURF   = '#161B27';
const SURF2  = '#1D2333';
const EDGE   = 'rgba(255,255,255,0.07)';
const TEXT   = '#DCE6FF';
const MUTED  = '#5A6990';
const BLUE   = '#1E40DC';
const BLUE2  = '#4B6FFF';
const GREEN  = '#05C56B';
const CYAN   = '#00BDD0';
const ORANGE = '#FF8B00';
const RED    = '#EF3340';
const PURPLE = '#8034E0';
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.06)';

const ACTIVITY_LEVELS = [
  { value: 'sedentary',    label: 'Sedentary',    desc: 'Desk job, little or no exercise',   mult: 1.2,   icon: '🪑' },
  { value: 'light',        label: 'Light',         desc: '1–3 training days / week',          mult: 1.375, icon: '🚶' },
  { value: 'moderate',     label: 'Moderate',      desc: '3–5 training days / week',          mult: 1.55,  icon: '🏃' },
  { value: 'very_active',  label: 'Very Active',   desc: '6–7 training days / week',          mult: 1.725, icon: '⚡' },
  { value: 'extra_active', label: 'Extra Active',  desc: 'Twice-daily training or heavy work', mult: 1.9,   icon: '🔥' },
] as const;
type ActivityLevel = typeof ACTIVITY_LEVELS[number]['value'];

function calcBMR(w: number, h: number, a: number, gender: 'male' | 'female'): number {
  if (gender === 'male') return Math.round(88.36 + 13.4 * w + 5.7 * h - 5.7 * a);
  return Math.round(447.6 + 9.25 * w + 3.1 * h - 4.33 * a);
}

function calcBMI(w: number, h: number): number {
  return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
}

function getBMILabel(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: CYAN };
  if (bmi < 25)   return { label: 'Healthy',     color: GREEN };
  if (bmi < 30)   return { label: 'Overweight',  color: ORANGE };
  return               { label: 'Obese',         color: RED };
}

const inp: React.CSSProperties = {
  width: '100%', background: SURF2, border: `1px solid ${EDGE}`,
  borderRadius: 12, color: TEXT, fontSize: 15, padding: '14px 15px',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
};

export default function ProfileSetupScreen() {
  const { user, setUser, logout } = useAuthStore();
  const name    = user?.displayName || 'ATHLETE';
  const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const [displayName,   setDisplayName]   = useState(user?.displayName ?? '');
  const [weightKg,      setWeightKg]      = useState(user?.weightKg  ? user.weightKg.toString()  : '');
  const [heightCm,      setHeightCm]      = useState(user?.heightCm  ? user.heightCm.toString()  : '');
  const [age,           setAge]           = useState(user?.age        ? user.age.toString()        : '');
  const [gender,        setGender]        = useState<'male' | 'female'>(user?.gender ?? 'male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>((user?.activityLevel as ActivityLevel) ?? 'moderate');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState('');
  const [syncing,       setSyncing]       = useState(false);
  const [syncDone,      setSyncDone]      = useState<string | null>(null);

  const profileComplete = user?.weightKg && user?.heightCm && user?.age;

  const filledFields    = [displayName.trim(), weightKg, heightCm, age].filter(Boolean).length;
  const completenessPct = Math.round((filledFields / 4) * 100);
  const isFullyComplete = filledFields === 4;

  // Computed stats
  const w = parseFloat(weightKg), h = parseFloat(heightCm), a = parseInt(age, 10);
  const hasStats = !isNaN(w) && !isNaN(h) && !isNaN(a) && w > 0 && h > 0 && a > 0;
  const bmr  = hasStats ? calcBMR(w, h, a, gender) : null;
  const mult = ACTIVITY_LEVELS.find(l => l.value === activityLevel)?.mult ?? 1.55;
  const tdee = bmr ? Math.round(bmr * mult) : null;
  const bmi  = hasStats ? calcBMI(w, h) : null;
  const bmiInfo = bmi ? getBMILabel(bmi) : null;

  const handleSave = async () => {
    if (isNaN(w) || w < 30 || w > 300)  { setError('Valid weight: 30–300 kg.'); return; }
    if (isNaN(h) || h < 100 || h > 250) { setError('Valid height: 100–250 cm.'); return; }
    if (isNaN(a) || a < 10 || a > 100)  { setError('Valid age: 10–100.'); return; }
    setSaving(true); setError('');
    try {
      const updated = await updateProfile({ weightKg: w, heightCm: h, age: a, gender, activityLevel, displayName: displayName.trim() || undefined });
      setUser(updated);
      syncProfile({ weight_kg: w, height_cm: h, age: a, gender, activity_level: activityLevel, display_name: displayName.trim() || undefined }).catch(() => {});
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handlePushAllToCloud = async () => {
    setSyncing(true); setSyncDone(null);
    try {
      const rows = await db.food_logs.toArray();
      let pushed = 0;
      for (const row of rows) {
        const id = row.sync_id ?? String(row.id!);
        await syncAddLog({
          id, food_name: row.food_name, calories: row.calories,
          protein: row.protein, carbs: row.carbs, fat: row.fat,
          weight_grams: row.weight_grams, meal_type: row.meal_type,
          image_url: row.image_url, ingredients: row.ingredients,
          logged_at: row.logged_at, date: row.date,
        });
        if (!row.sync_id) await db.food_logs.update(row.id!, { sync_id: id });
        pushed++;
      }
      setSyncDone(`${pushed} log${pushed === 1 ? '' : 's'} pushed to cloud`);
      setTimeout(() => setSyncDone(null), 4000);
    } catch { setSyncDone('Sync failed — check connection'); }
    finally { setSyncing(false); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG }}>

      {/* ── HEADER ── */}
      <div style={{
        background: 'linear-gradient(145deg, #080F30 0%, #1428A0 40%, #1E40DC 100%)',
        padding: '44px 22px 32px', position: 'relative', overflow: 'hidden',
      }}>
        <div className="orb1" style={{ position: 'absolute', top: -20, right: 10, width: 160, height: 160, borderRadius: '50%', background: 'rgba(75,111,255,0.10)' }} />
        <div className="orb2" style={{ position: 'absolute', bottom: -30, left: -10, width: 120, height: 120, borderRadius: '50%', background: 'rgba(30,64,220,0.08)' }} />

        <div className="nrc-a nrc-a1" style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Avatar */}
          <div style={{
            width: 60, height: 60, borderRadius: 20,
            background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', letterSpacing: -1 }}>
              {initials || 'AT'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.55)', marginBottom: 4, textTransform: 'uppercase' }}>
              Athlete Profile
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -2, lineHeight: 1, color: '#FFFFFF' }}>
              {name.toUpperCase()}
            </div>
            {!profileComplete && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 5, fontWeight: 500 }}>
                Complete your profile to unlock smart targets
              </div>
            )}
          </div>
        </div>

        {/* Completeness bar */}
        <div className="nrc-a nrc-a2" style={{ position: 'relative', zIndex: 1, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
              {isFullyComplete ? 'Profile Complete' : `Profile ${completenessPct}% complete`}
            </div>
            {isFullyComplete
              ? <div style={{ fontSize: 10, fontWeight: 800, color: GREEN }}>✓ All Set</div>
              : <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
                  {4 - filledFields} field{4 - filledFields !== 1 ? 's' : ''} remaining
                </div>
            }
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${completenessPct}%`,
              background: isFullyComplete ? GREEN : 'rgba(255,255,255,0.75)',
              borderRadius: 3, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
        </div>

      </div>

      {/* ── COMPUTED STATS ── */}
      {hasStats && (
        <div className="nrc-a nrc-a2" style={{ padding: '20px 22px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'BMR', value: bmr?.toLocaleString() ?? '—', unit: 'kcal/day', color: BLUE,   desc: 'Basal metabolic rate' },
              { label: 'TDEE', value: tdee?.toLocaleString() ?? '—', unit: 'kcal/day', color: GREEN,  desc: 'Total daily expenditure' },
              { label: 'BMI',  value: bmi?.toString() ?? '—',  unit: bmiInfo?.label ?? '',  color: bmiInfo?.color ?? BLUE, desc: 'Body mass index' },
            ].map(({ label, value, unit, color, desc }) => (
              <div key={label} style={{
                background: `linear-gradient(160deg, ${color}20 0%, ${SURF} 60%)`,
                borderRadius: 16, padding: '14px 12px',
                border: `1px solid ${color}18`, borderTop: `3px solid ${color}`,
                boxShadow: CARD_SHADOW, textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color, textTransform: 'uppercase', marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1.5, color, lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, marginTop: 4 }}>
                  {unit}
                </div>
              </div>
            ))}
          </div>

          {/* TDEE context bar */}
          {tdee && (
            <div style={{
              background: `${BLUE}06`, borderRadius: 14, padding: '13px 16px',
              border: `1px solid ${BLUE}15`, borderLeft: `3px solid ${BLUE}`,
              marginBottom: 0,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: BLUE, textTransform: 'uppercase', marginBottom: 4 }}>
                Your Energy Target
              </div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, fontWeight: 500 }}>
                Based on your stats, you need ~<strong style={{ color: BLUE }}>{tdee.toLocaleString()} kcal/day</strong> to maintain weight.
                {' '}FuelSync adjusts this daily based on training type.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BODY STATS (current) ── */}
      {profileComplete && !hasStats && (
        <div className="nrc-a nrc-a2" style={{ padding: '20px 22px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Weight', value: `${user!.weightKg}`, unit: 'KG', color: BLUE   },
              { label: 'Height', value: `${user!.heightCm}`, unit: 'CM', color: CYAN   },
              { label: 'Age',    value: `${user!.age}`,      unit: 'YR', color: GREEN  },
            ].map(({ label, value, unit, color }) => (
              <div key={label} style={{
                background: SURF, borderRadius: 16, padding: '16px 12px',
                border: `1px solid ${EDGE}`, borderTop: `3px solid ${color}`,
                boxShadow: CARD_SHADOW, textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1.5, color: TEXT, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 1, marginTop: 4 }}>{unit}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '20px 22px 48px' }}>

        {/* Display Name */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
          Display Name
        </div>
        <input style={{ ...inp, marginBottom: 20 }} type="text" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />

        {/* Body Stats */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
          Body Stats
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input style={{ ...inp, flex: 1 }} type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="Weight (kg)" />
          <input style={{ ...inp, flex: 1 }} type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="Height (cm)" />
        </div>
        <input style={{ ...inp, marginBottom: 20 }} type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" />

        {/* Biological Sex */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
          Biological Sex
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {(['male', 'female'] as const).map((g) => (
            <button key={g} onClick={() => setGender(g)} className="nrc-press" style={{
              flex: 1, padding: 15, borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${gender === g ? BLUE : EDGE}`,
              borderTop: gender === g ? `3px solid ${BLUE}` : `1px solid ${EDGE}`,
              background: gender === g ? `${BLUE}08` : SURF2,
              color: gender === g ? BLUE : MUTED,
              fontWeight: 800, fontSize: 14, transition: 'all 0.2s',
              boxShadow: gender === g ? `0 4px 16px ${BLUE}14` : 'none',
            }}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>

        {/* Activity Level */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>
          Activity Level
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {ACTIVITY_LEVELS.map(({ value, label, desc, icon }) => {
            const active = activityLevel === value;
            return (
              <button key={value} onClick={() => setActivityLevel(value)} className="nrc-press" style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                background: active ? `${BLUE}07` : SURF2,
                border: `1px solid ${active ? BLUE : EDGE}`,
                borderLeft: active ? `3px solid ${BLUE}` : `1px solid ${EDGE}`,
                transition: 'all 0.2s',
                boxShadow: active ? `0 4px 16px ${BLUE}12` : 'none',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: active ? BLUE : TEXT, marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>
                    {desc}
                  </div>
                </div>
                {active && (
                  <div style={{ marginLeft: 'auto', color: BLUE, fontSize: 18, fontWeight: 900 }}>✓</div>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{
            color: RED, fontSize: 13, marginBottom: 16, padding: '12px 14px',
            background: 'rgba(239,51,64,0.06)', borderRadius: 12, fontWeight: 600,
            border: '1px solid rgba(239,51,64,0.18)',
          }}>
            {error}
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="nrc-press" style={{
          width: '100%', padding: '17px 0', borderRadius: 16, marginBottom: 14,
          background: saved ? `${GREEN}12` : saving ? SURF2 : `linear-gradient(135deg, ${BLUE} 0%, ${BLUE2} 100%)`,
          color: saved ? GREEN : saving ? MUTED : '#fff',
          fontWeight: 900, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer',
          border: saved ? `1px solid ${GREEN}35` : '1px solid transparent',
          boxShadow: (!saved && !saving) ? `0 4px 16px ${BLUE}35, 0 8px 32px ${BLUE}20, inset 0 1px 0 rgba(255,255,255,0.18)` : 'none',
          transition: 'all 0.25s',
          letterSpacing: 0.5,
        }}>
          {saved ? '✓ Profile Saved' : saving ? 'Saving…' : 'Save Profile →'}
        </button>

        {/* Account Section */}
        <div style={{
          background: `linear-gradient(160deg, ${SURF} 0%, ${SURF2} 100%)`,
          borderRadius: 18, padding: '18px 18px',
          border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>
            Account
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {getSyncToken() && (
              <button onClick={handlePushAllToCloud} disabled={syncing} className="nrc-press" style={{
                width: '100%', padding: 14, borderRadius: 12,
                border: `1px solid ${syncDone && !syncDone.includes('failed') ? GREEN + '35' : EDGE}`,
                background: syncDone && !syncDone.includes('failed') ? `${GREEN}08` : SURF2,
                color: syncDone && !syncDone.includes('failed') ? GREEN : BLUE,
                fontWeight: 700, fontSize: 13, cursor: syncing ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}>
                {syncing ? 'Pushing to cloud…' : syncDone ?? '↑ Push all logs to cloud'}
              </button>
            )}
            <button onClick={async () => {
              if (!window.confirm('Sign out? Your local data stays on this device.')) return;
              clearSyncToken();
              logout();
            }} className="nrc-press" style={{
              width: '100%', padding: 14, borderRadius: 12,
              border: `1px solid ${EDGE}`, background: SURF2, color: MUTED,
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
