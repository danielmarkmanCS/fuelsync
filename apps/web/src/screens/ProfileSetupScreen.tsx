import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { updateProfile, clearProfile } from '../api/auth';
import { clearSyncToken, getSyncToken, syncProfile, syncAddLog, googleSignIn, setSyncToken } from '../api/syncClient';
import { db } from '../lib/db';
import type { WeightLog } from '../lib/db';
import { getLatestMeasurement, getMeasurements, saveMeasurement } from '../lib/bodyMeasurements';
import type { BodyMeasurement } from '../lib/bodyMeasurements';
import { getUnlocked, ALL_ACHIEVEMENTS } from '../lib/achievements';
import { clearPin } from '../lib/pin';
import { useNutritionStore } from '../store/nutritionStore';
import { getCustomTargets, setCustomTargets, getPresets, savePreset, deletePreset } from '../lib/customTargets';
import type { CustomTargets, MacroPreset } from '../lib/customTargets';
import { useThemeStore, type GoalMode } from '../store/themeStore';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const IS_NATIVE = Capacitor.isNativePlatform();

const BG      = 'var(--bg)';
const SURF    = 'var(--surf)';
const SURF2   = 'var(--surf2)';
const EDGE    = 'var(--edge)';
const TEXT    = 'var(--text)';
const MUTED   = 'var(--muted)';
const GREEN      = '#4ADE80';   // emerald green
const ORANGE     = 'var(--accent)';  // system accent (blue)
const ORANGE_MUT = 'var(--accent-muted)';
const YELLOW     = 'var(--accent)';  // weight today highlight
const PROT       = '#38BDF8';   // sky blue — protein
const RED     = '#FF4444';
const FAT_CLR = '#FBBF24';  // amber — fat
const CARD_SHADOW = 'var(--shadow-md)';

const ACTIVITY_LEVELS = [
  { value: 'sedentary',    label: 'Sedentary',    desc: 'Desk job, little or no exercise',   mult: 1.2,   icon: '🪑' },
  { value: 'light',        label: 'Light',         desc: '1–3 training days / week',          mult: 1.375, icon: '🚶' },
  { value: 'moderate',     label: 'Moderate',      desc: '3–5 training days / week',          mult: 1.55,  icon: '🏃' },
  { value: 'very_active',  label: 'Very Active',   desc: '6–7 training days / week',          mult: 1.725, icon: '⚡' },
  { value: 'extra_active', label: 'Extra Active',  desc: 'Twice-daily training or heavy work', mult: 1.9,   icon: '🔥' },
] as const;
type ActivityLevel = typeof ACTIVITY_LEVELS[number]['value'];

function calcBMR(w: number, h: number, a: number, gender: 'male' | 'female'): number {
  const base = 10 * w + 6.25 * h - 5 * a;
  return Math.round(gender === 'male' ? base + 5 : base - 161);
}

function calcBMI(w: number, h: number): number {
  return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
}

function getBMILabel(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: YELLOW };
  if (bmi < 25)   return { label: 'Healthy',     color: GREEN };
  if (bmi < 30)   return { label: 'Overweight',  color: ORANGE };
  return               { label: 'Obese',         color: RED };
}

const inp: React.CSSProperties = {
  width: '100%', background: SURF2, border: `1px solid ${EDGE}`,
  borderRadius: 8, color: TEXT, fontSize: 15, padding: '14px 15px',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit', fontWeight: 700,
};

export default function ProfileSetupScreen() {
  const { isDark, goalMode, setGoalMode } = useThemeStore();
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
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleConnected,  setGoogleConnected]  = useState(!!getSyncToken());
  const [googleError,      setGoogleError]      = useState('');

  // Weight log
  const [weightLogs,      setWeightLogs]      = useState<WeightLog[]>([]);
  const [todayWeightInput, setTodayWeightInput] = useState('');
  const [savingWeight,    setSavingWeight]    = useState(false);

  // Body measurements
  const [measurementHistory, setMeasurementHistory] = useState<BodyMeasurement[]>([]);
  const [measWaist,  setMeasWaist]  = useState('');
  const [measChest,  setMeasChest]  = useState('');
  const [measArms,   setMeasArms]   = useState('');
  const [measHips,   setMeasHips]   = useState('');
  const [measThighs, setMeasThighs] = useState('');
  const [measNeck,   setMeasNeck]   = useState('');
  const [measBf,     setMeasBf]     = useState('');
  const [savingMeas, setSavingMeas] = useState(false);
  const [measSaved,  setMeasSaved]  = useState(false);

  // Weight goal
  const WG_KEY = 'fs_weight_goal_v1';
  const [targetWeightKg, setTargetWeightKg] = useState(() => {
    try { return JSON.parse(localStorage.getItem(WG_KEY) ?? '{}').target ?? ''; } catch { return ''; }
  });
  const [goalTargetDate,  setGoalTargetDate]  = useState(() => {
    try { return JSON.parse(localStorage.getItem(WG_KEY) ?? '{}').date ?? ''; } catch { return ''; }
  });
  const handleSaveWeightGoal = () => {
    try { localStorage.setItem(WG_KEY, JSON.stringify({ target: targetWeightKg, date: goalTargetDate })); } catch {}
  };

  const goalCalAdj: Record<GoalMode, number> = { lose: -500, maintain: 0, gain: 300 };

  // Custom targets
  const [customTargets, setCustomTargetsState] = useState<CustomTargets>(getCustomTargets);
  const [presets, setPresets] = useState<MacroPreset[]>(getPresets);
  const [presetName, setPresetName] = useState('');
  const [showPresetSave, setShowPresetSave] = useState(false);

  const handleCustomTargetChange = (field: keyof CustomTargets, value: string | boolean) => {
    const updated = { ...customTargets, [field]: typeof value === 'boolean' ? value : (parseFloat(value as string) || 0) };
    setCustomTargetsState(updated);
    setCustomTargets(updated);
  };
  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    savePreset(presetName.trim(), { calories: customTargets.calories, proteinG: customTargets.proteinG, carbsG: customTargets.carbsG, fatG: customTargets.fatG });
    setPresets(getPresets());
    setPresetName('');
    setShowPresetSave(false);
  };
  const handleLoadPreset = (p: MacroPreset) => {
    const updated = { ...customTargets, enabled: true, calories: p.calories, proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG };
    setCustomTargetsState(updated);
    setCustomTargets(updated);
  };
  const handleDeletePreset = (id: string) => {
    deletePreset(id);
    setPresets(getPresets());
  };

  useEffect(() => {
    db.weight_logs.orderBy('date').reverse().limit(14).toArray().then(setWeightLogs).catch(() => {});
    getMeasurements(10).then(setMeasurementHistory).catch(() => {});
    getLatestMeasurement().then(m => {
      if (!m) return;
      if (m.waist_cm)   setMeasWaist(String(m.waist_cm));
      if (m.chest_cm)   setMeasChest(String(m.chest_cm));
      if (m.arms_cm)    setMeasArms(String(m.arms_cm));
      if (m.hips_cm)    setMeasHips(String(m.hips_cm));
      if (m.thighs_cm)  setMeasThighs(String(m.thighs_cm));
      if (m.neck_cm)    setMeasNeck(String(m.neck_cm));
      if (m.body_fat_pct) setMeasBf(String(m.body_fat_pct));
    }).catch(() => {});
  }, []);

  // Auto-save profile whenever valid data changes — no Save button required
  useEffect(() => {
    const w = parseFloat(weightKg), h = parseFloat(heightCm), a = parseInt(age, 10);
    if (isNaN(w) || w < 30 || w > 300) return;
    if (isNaN(h) || h < 100 || h > 250) return;
    if (isNaN(a) || a < 10 || a > 100) return;
    const t = setTimeout(async () => {
      try {
        const updated = await updateProfile({ weightKg: w, heightCm: h, age: a, gender, activityLevel, displayName: displayName.trim() || undefined });
        setUser(updated);
        syncProfile({ weight_kg: w, height_cm: h, age: a, gender, activity_level: activityLevel, display_name: displayName.trim() || undefined }).catch(() => {});
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(t);
  }, [weightKg, heightCm, age, gender, activityLevel, displayName]);

  const handleSaveMeasurements = async () => {
    const hasAny = [measWaist, measChest, measArms, measHips, measThighs, measNeck, measBf].some(v => v.trim());
    if (!hasAny) return;
    setSavingMeas(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await saveMeasurement(today, {
        waist_cm:     parseFloat(measWaist)  || null,
        chest_cm:     parseFloat(measChest)  || null,
        arms_cm:      parseFloat(measArms)   || null,
        hips_cm:      parseFloat(measHips)   || null,
        thighs_cm:    parseFloat(measThighs) || null,
        neck_cm:      parseFloat(measNeck)   || null,
        body_fat_pct: parseFloat(measBf)     || null,
      });
      const updated = await getMeasurements(10);
      setMeasurementHistory(updated);
      setMeasSaved(true);
      setTimeout(() => setMeasSaved(false), 2500);
    } catch { /* ignore */ }
    finally { setSavingMeas(false); }
  };

  const handleLogWeight = async () => {
    const kg = parseFloat(todayWeightInput);
    if (isNaN(kg) || kg < 20 || kg > 400) return;
    setSavingWeight(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const existing = await db.weight_logs.where('date').equals(today).first();
      if (existing?.id != null) {
        await db.weight_logs.update(existing.id, { weightKg: kg, logged_at: new Date().toISOString() });
      } else {
        await db.weight_logs.add({ date: today, weightKg: kg, logged_at: new Date().toISOString() });
      }
      const updated = await db.weight_logs.orderBy('date').reverse().limit(14).toArray();
      setWeightLogs(updated);
      setTodayWeightInput('');
    } catch {}
    finally { setSavingWeight(false); }
  };

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

  const handleGoogleConnect = async () => {
    setGoogleConnecting(true); setGoogleError('');
    try {
      let idToken = '';
      if (IS_NATIVE) {
        await GoogleAuth.initialize({ clientId: CLIENT_ID, scopes: ['profile', 'email'], grantOfflineAccess: true });
        const googleUser = await GoogleAuth.signIn();
        idToken = googleUser?.authentication?.idToken ?? '';
        if (!idToken) throw new Error('No ID token');
      } else {
        throw new Error('Use the web sign-in button');
      }
      const { token: t } = await googleSignIn(idToken);
      setSyncToken(t);
      setGoogleConnected(true);
      // Push current local profile to cloud
      if (user) {
        syncProfile({
          display_name: user.displayName, weight_kg: user.weightKg ?? undefined,
          height_cm: user.heightCm ?? undefined, age: user.age ?? undefined,
          gender: user.gender ?? undefined, activity_level: user.activityLevel,
          daily_goal: user.dailyGoal,
        }).catch(() => {});
      }
    } catch (e: unknown) {
      setGoogleError(e instanceof Error ? e.message : 'Connection failed');
    } finally { setGoogleConnecting(false); }
  };

  const handleSave = async () => {
    if (isNaN(w) || w < 30 || w > 300)  { setError('Valid weight: 30–300 kg.'); return; }
    if (isNaN(h) || h < 100 || h > 250) { setError('Valid height: 100–250 cm.'); return; }
    if (isNaN(a) || a < 10 || a > 100)  { setError('Valid age: 10–100.'); return; }
    setSaving(true); setError('');
    try {
      const computedGoal = tdee ? tdee + goalCalAdj[goalMode] : undefined;
      const updated = await updateProfile({
        weightKg: w, heightCm: h, age: a, gender, activityLevel,
        displayName: displayName.trim() || undefined,
        ...(computedGoal ? { dailyGoal: computedGoal } : {}),
      });
      setUser(updated);
      // Always push to cloud — this is what survives browser wipes
      await syncProfile({
        weight_kg: w, height_cm: h, age: a, gender,
        activity_level: activityLevel,
        display_name: displayName.trim() || undefined,
        ...(computedGoal ? { daily_goal: computedGoal } : {}),
      }).catch((e: unknown) => {
        // Not a blocking error — local save succeeded. Warn only if signed in.
        if (getSyncToken()) console.warn('[profile] cloud sync failed:', e);
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  };

  // Auto-sync food logs to cloud every 2 hours (background, silent)
  useEffect(() => {
    if (!getSyncToken()) return;
    const runSync = async () => {
      try {
        const rows = await db.food_logs.toArray();
        for (const row of rows) {
          const id = row.sync_id ?? String(row.id!);
          await syncAddLog({
            id, food_name: row.food_name, calories: row.calories,
            protein: row.protein, carbs: row.carbs, fat: row.fat,
            weight_grams: row.weight_grams, meal_type: row.meal_type,
            image_url: row.image_url, ingredients: row.ingredients,
            logged_at: row.logged_at,
            date: row.date ?? row.logged_at?.split('T')[0] ?? null,
            fiber_g: row.fiber_g ?? null, cholesterol_mg: row.cholesterol_mg ?? null,
            sodium_mg: row.sodium_mg ?? null, vitamin_c_mg: row.vitamin_c_mg ?? null,
            vitamin_d_mcg: row.vitamin_d_mcg ?? null, calcium_mg: row.calcium_mg ?? null,
            iron_mg: row.iron_mg ?? null,
          }).catch(() => {});
          if (!row.sync_id) await db.food_logs.update(row.id!, { sync_id: id }).catch(() => {});
        }
      } catch { /* silent */ }
    };
    runSync();
    const interval = setInterval(runSync, 2 * 60 * 60 * 1000); // every 2 hours
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG }}>

      {/* ── HEADER ── */}
      <div className="nrc-a nrc-a1" style={{ padding: '24px 20px 12px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          background: SURF2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: -0.5 }}>
            {initials || 'AT'}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.8, color: TEXT, lineHeight: 1.1 }}>
            {name}
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 3, fontWeight: 500 }}>
            {isFullyComplete ? 'Profile complete ✓' : `${completenessPct}% complete`}
          </div>
        </div>
      </div>

      {/* ── COMPUTED STATS ── */}
      {hasStats && (
        <div className="nrc-a nrc-a2" style={{ padding: '0 16px 16px' }}>
          {/* BMR / TDEE / BMI — single surface */}
          <div style={{
            background: SURF, borderRadius: 16,
            display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
            overflow: 'hidden', marginBottom: 10,
          }}>
            {[
              { label: 'BMR',  value: bmr?.toLocaleString()  ?? '—', unit: 'kcal/day', color: ORANGE },
              { label: 'TDEE', value: tdee?.toLocaleString() ?? '—', unit: 'kcal/day', color: GREEN  },
              { label: 'BMI',  value: bmi?.toString()        ?? '—', unit: bmiInfo?.label ?? '', color: bmiInfo?.color ?? ORANGE },
            ].flatMap(({ label, value, unit, color }, i) => {
              const cell = (
                <div key={label} style={{ padding: '14px 10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: MUTED, fontWeight: 500, marginBottom: 5 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: -0.5, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{unit}</div>
                </div>
              );
              return i > 0 ? [<div key={`d${i}`} style={{ background: EDGE }} />, cell] : [cell];
            })}
          </div>

          {tdee && (
            <div style={{ background: SURF, borderRadius: 12, padding: '13px 16px', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>
                You need ~<strong style={{ color: ORANGE }}>{tdee.toLocaleString()} kcal/day</strong> to maintain weight.{' '}
                FuelSync adjusts daily targets based on training type.
              </div>
            </div>
          )}

          {bmr && (() => {
            if (!w || !h || !a || !gender) return null;
            const avgBmrByAge = gender === 'male'
              ? [{ age: 20, bmr: 1900 }, { age: 30, bmr: 1800 }, { age: 40, bmr: 1700 }, { age: 50, bmr: 1600 }, { age: 60, bmr: 1500 }]
              : [{ age: 20, bmr: 1550 }, { age: 30, bmr: 1480 }, { age: 40, bmr: 1400 }, { age: 50, bmr: 1330 }, { age: 60, bmr: 1260 }];
            let metabAge = avgBmrByAge[0].age;
            for (const row of avgBmrByAge) { if (bmr >= row.bmr) { metabAge = row.age; break; } }
            if (!metabAge) metabAge = avgBmrByAge[avgBmrByAge.length - 1].age + 10;
            const diff = metabAge - a;
            const color = diff <= -5 ? GREEN : diff <= 0 ? PROT : diff <= 5 ? FAT_CLR : RED;
            const label = diff <= -5 ? 'Younger than age' : diff <= 0 ? 'Age-appropriate' : diff <= 5 ? 'Slightly higher' : 'Higher than age';
            return (
              <div style={{ background: SURF, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>
                    Metabolic age — <strong style={{ color }}>{label}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Based on BMR vs {gender} averages</div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: -1, lineHeight: 1 }}>{metabAge}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>est. age</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── BODY STATS (current) ── */}
      {profileComplete && !hasStats && (
        <div className="nrc-a nrc-a2" style={{ padding: '20px 22px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Weight', value: `${user!.weightKg}`, unit: 'KG', color: ORANGE   },
              { label: 'Height', value: `${user!.heightCm}`, unit: 'CM', color: YELLOW   },
              { label: 'Age',    value: `${user!.age}`,      unit: 'YR', color: GREEN  },
            ].map(({ label, value, unit, color }) => (
              <div key={label} style={{
                background: SURF, borderRadius: 8, padding: '16px 12px',
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

      <div style={{ padding: '20px 16px 48px' }}>

        {/* Display Name */}
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 8 }}>
          Display Name
        </div>
        <input style={{ ...inp, marginBottom: 20 }} type="text" value={displayName}
          onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />

        {/* Body Stats */}
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 8 }}>
          Body Stats
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input style={{ ...inp, flex: 1 }} type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="Weight (kg)" />
          <input style={{ ...inp, flex: 1 }} type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="Height (cm)" />
        </div>
        <input style={{ ...inp, marginBottom: 20 }} type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" />

        {/* Biological Sex */}
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 8 }}>
          Biological Sex
        </div>
        <div style={{ background: SURF, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
            {(['male', 'female'] as const).map((g, i) => i === 0 ? (
              <button key={g} onClick={() => setGender(g)} className="nrc-press" style={{
                padding: 15, border: 'none', cursor: 'pointer',
                background: gender === g ? ORANGE_MUT : SURF,
                color: gender === g ? ORANGE : MUTED,
                fontWeight: 700, fontSize: 14, transition: 'background 0.2s',
              }}>Male</button>
            ) : [
              <div key="div" style={{ background: EDGE }} />,
              <button key={g} onClick={() => setGender(g)} className="nrc-press" style={{
                padding: 15, border: 'none', cursor: 'pointer',
                background: gender === g ? ORANGE_MUT : SURF,
                color: gender === g ? ORANGE : MUTED,
                fontWeight: 700, fontSize: 14, transition: 'background 0.2s',
              }}>Female</button>,
            ])}
          </div>
        </div>

        {/* Activity Level */}
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
          Activity Level
        </div>
        <div style={{ background: SURF, borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: EDGE }}>
            {ACTIVITY_LEVELS.map(({ value, label, desc }) => {
              const active = activityLevel === value;
              return (
                <button key={value} onClick={() => setActivityLevel(value)} className="nrc-press" style={{
                  textAlign: 'left', padding: '14px 16px', cursor: 'pointer',
                  background: active ? ORANGE_MUT : SURF, border: 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                  transition: 'background 0.2s',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? ORANGE : TEXT, marginBottom: 2 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, fontWeight: 400 }}>{desc}</div>
                  </div>
                  {active && <span style={{ color: ORANGE, fontSize: 16 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── WEIGHT LOG ── */}
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10, marginTop: 10 }}>
          Weight Log
        </div>
        <div style={{
          background: SURF, borderRadius: 16,
          padding: '16px 16px 14px', marginBottom: 28,
        }}>
          {/* Log today */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              type="number"
              value={todayWeightInput}
              onChange={(e) => setTodayWeightInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogWeight(); }}
              placeholder={`Today's weight (kg)`}
              style={{ ...inp, flex: 1, marginBottom: 0 }}
            />
            <button
              onClick={handleLogWeight}
              disabled={savingWeight || !todayWeightInput.trim()}
              className="nrc-press"
              style={{
                background: savingWeight || !todayWeightInput.trim() ? SURF2 : ORANGE_MUT,
                border: `1px solid ${savingWeight || !todayWeightInput.trim() ? EDGE : 'var(--accent)'}`,
                borderRadius: 8, color: savingWeight || !todayWeightInput.trim() ? MUTED : ORANGE,
                fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: '0 18px',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              {savingWeight ? '···' : 'Log'}
            </button>
          </div>

          {/* Weight history — last 7 entries */}
          {weightLogs.length > 0 && (() => {
            const today = new Date().toISOString().split('T')[0];
            const min = Math.min(...weightLogs.map((l) => l.weightKg));
            const max = Math.max(...weightLogs.map((l) => l.weightKg));
            const range = max - min || 1;

            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {weightLogs.slice(0, 7).map((log, i) => {
                    const prev = weightLogs[i + 1];
                    const diff = prev ? log.weightKg - prev.weightKg : null;
                    const diffColor = diff == null ? MUTED : diff < 0 ? GREEN : diff > 0 ? RED : MUTED;
                    return (
                      <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, minWidth: 72 }}>
                          {log.date === today ? 'Today' : new Date(log.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                        <div style={{ flex: 1, height: 4, background: SURF2, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${((log.weightKg - min) / range) * 100}%`,
                            background: log.date === today ? 'var(--accent)' : 'var(--accent-muted)',
                            borderRadius: 2,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: log.date === today ? YELLOW : TEXT, minWidth: 52, textAlign: 'right', letterSpacing: -0.5 }}>
                          {log.weightKg}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>kg</span>
                        </div>
                        {diff !== null && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: diffColor, minWidth: 36, textAlign: 'right' }}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Mini sparkline for all entries */}
                {weightLogs.length >= 3 && (() => {
                  const all = [...weightLogs].sort((a, b) => a.date.localeCompare(b.date));
                  const n = all.length;
                  const wMin = Math.min(...all.map(l => l.weightKg)) - 0.5;
                  const wMax = Math.max(...all.map(l => l.weightKg)) + 0.5;
                  const W = 260; const H = 36;
                  const toX = (i: number) => (i / (n - 1)) * W;
                  const toY = (w: number) => H - ((w - wMin) / (wMax - wMin)) * H;
                  const pts = all.map((l, i) => `${toX(i)},${toY(l.weightKg)}`).join(' ');
                  const first = all[0]; const last = all[all.length - 1];
                  const delta = last.weightKg - first.weightKg;
                  const trendColor = delta <= 0 ? GREEN : RED;
                  return (
                    <div style={{ marginTop: 12, background: SURF2, borderRadius: 8, padding: '10px 12px', border: `1px solid ${EDGE}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>All {n} entries</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: trendColor }}>
                          {delta >= 0 ? '+' : ''}{delta.toFixed(1)} kg total
                        </span>
                      </div>
                      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
                        <polyline points={pts} fill="none" stroke={trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        {all.map((l, i) => (
                          <circle key={l.id} cx={toX(i)} cy={toY(l.weightKg)} r={i === n - 1 ? 3 : 2} fill={i === n - 1 ? trendColor : `${trendColor}80`} />
                        ))}
                      </svg>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 8, color: MUTED }}>{new Date(first.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span style={{ fontSize: 8, color: MUTED }}>{new Date(last.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  );
                })()}
              </>
            );
          })()}

          {weightLogs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '12px 0', color: MUTED, fontSize: 12, fontWeight: 700 }}>
              Log your first weigh-in above to track progress
            </div>
          )}
        </div>

        {/* ── BODY MEASUREMENTS ── */}
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
          Body Measurements
        </div>
        <div style={{ background: SURF, borderRadius: 16, padding: '16px 16px 14px', marginBottom: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {([
              { label: 'Waist',      unit: 'cm',  val: measWaist,  set: setMeasWaist  },
              { label: 'Chest',      unit: 'cm',  val: measChest,  set: setMeasChest  },
              { label: 'Arms (bicep)', unit: 'cm', val: measArms,  set: setMeasArms   },
              { label: 'Hips',       unit: 'cm',  val: measHips,   set: setMeasHips   },
              { label: 'Thighs',     unit: 'cm',  val: measThighs, set: setMeasThighs },
              { label: 'Neck',       unit: 'cm',  val: measNeck,   set: setMeasNeck   },
              { label: 'Body Fat',   unit: '%',   val: measBf,     set: setMeasBf     },
            ] as const).map(({ label, unit, val, set }) => (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  {label} <span style={{ fontWeight: 500 }}>({unit})</span>
                </div>
                <input
                  type="number" min={0} value={val}
                  onChange={(e) => (set as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                  placeholder="—"
                  style={{ ...inp, marginBottom: 0, padding: '10px 12px', fontSize: 16 }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveMeasurements}
            disabled={savingMeas}
            className="nrc-press"
            style={{
              width: '100%', padding: 12, borderRadius: 8,
              border: `1px solid ${measSaved ? GREEN + '40' : 'var(--accent)'}`,
              background: measSaved ? `${GREEN}20` : savingMeas ? SURF2 : ORANGE_MUT,
              color: measSaved ? GREEN : savingMeas ? MUTED : ORANGE,
              fontWeight: 800, fontSize: 13, cursor: savingMeas ? 'not-allowed' : 'pointer',
            }}
          >
            {measSaved ? '✓ Saved!' : savingMeas ? 'Saving…' : 'Save Measurements'}
          </button>

          {/* History — last 5 entries */}
          {measurementHistory.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${EDGE}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {measurementHistory.slice(0, 5).map((m) => (
                  <div key={m.id} style={{
                    background: SURF2, borderRadius: 8, padding: '10px 12px',
                    border: `1px solid ${EDGE}`,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 6 }}>
                      {new Date(m.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {[
                        m.waist_cm   != null && `Waist ${m.waist_cm}cm`,
                        m.chest_cm   != null && `Chest ${m.chest_cm}cm`,
                        m.arms_cm    != null && `Arms ${m.arms_cm}cm`,
                        m.hips_cm    != null && `Hips ${m.hips_cm}cm`,
                        m.thighs_cm  != null && `Thighs ${m.thighs_cm}cm`,
                        m.neck_cm    != null && `Neck ${m.neck_cm}cm`,
                        m.body_fat_pct != null && `BF ${m.body_fat_pct}%`,
                      ].filter(Boolean).map((label) => (
                        <span key={String(label)} style={{
                          fontSize: 10, fontWeight: 700, color: TEXT,
                          background: 'var(--bg)', borderRadius: 6, padding: '2px 8px',
                          border: `1px solid ${EDGE}`,
                        }}>{label}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── ACHIEVEMENTS ── */}
        {(() => {
          const unlocked = getUnlocked();
          const total    = ALL_ACHIEVEMENTS.length;
          const count    = unlocked.length;
          return (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                Achievements
              </div>
              <div style={{ background: SURF, borderRadius: 16, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
                    {count}/{total} unlocked
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: total }).map((_, i) => (
                      <div key={i} style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: i < count ? '#FBBF24' : EDGE,
                        transition: 'background 0.3s',
                      }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {ALL_ACHIEVEMENTS.map((a) => {
                    const isUnlocked = unlocked.includes(a.id);
                    return (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 10px',
                        background: isUnlocked ? `${a.color}10` : SURF2,
                        borderRadius: 10,
                        border: `1px solid ${isUnlocked ? a.color + '40' : EDGE}`,
                        opacity: isUnlocked ? 1 : 0.45,
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: isUnlocked ? `${a.color}20` : EDGE,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, flexShrink: 0,
                          filter: isUnlocked ? 'none' : 'grayscale(1)',
                        }}>
                          {a.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: isUnlocked ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.label}
                          </div>
                          <div style={{ fontSize: 9, color: MUTED, fontWeight: 600, lineHeight: 1.3, marginTop: 1 }}>
                            {a.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── PROFILE HEALTH CHECK ── */}
        {(() => {
          const today = new Date().toISOString().split('T')[0];
          const checks: { label: string; done: boolean; pts: number; icon: string; hint: string }[] = [
            { label: 'Body stats complete',   done: hasStats,                       pts: 15, icon: '⚖️', hint: 'Add weight, height & age above' },
            { label: 'Display name set',      done: !!displayName.trim(),           pts: 10, icon: '👤', hint: 'Set your display name' },
            { label: 'First weigh-in logged', done: weightLogs.length > 0,         pts: 15, icon: '📊', hint: 'Log your first weight in the Weight Log' },
            { label: '7 weigh-ins tracked',   done: weightLogs.length >= 7,        pts: 10, icon: '📈', hint: 'Log 7 weigh-ins total for trend data' },
            { label: 'Weighed today',         done: weightLogs[0]?.date === today, pts: 10, icon: '🎯', hint: "Log today's weight above" },
            { label: 'Body measurements',     done: measurementHistory.length > 0, pts: 15, icon: '📏', hint: 'Save at least one body measurement' },
            { label: 'Weight goal set',       done: !!targetWeightKg,             pts: 10, icon: '🏁', hint: 'Set a target weight in the goal section' },
            { label: 'Google sync enabled',   done: googleConnected,               pts: 5,  icon: '☁️', hint: 'Connect your Google account' },
            { label: 'Achievement unlocked',  done: getUnlocked().length > 0,     pts: 5,  icon: '🏆', hint: 'Log food consistently to earn achievements' },
            { label: 'Custom macro targets',  done: customTargets.enabled,         pts: 5,  icon: '🎛️', hint: 'Enable custom macro goals below' },
          ];
          const totalPts = checks.reduce((s, c) => s + c.pts, 0);
          const earned   = checks.reduce((s, c) => s + (c.done ? c.pts : 0), 0);
          const score    = Math.round((earned / totalPts) * 100);
          const doneCount = checks.filter(c => c.done).length;
          const pending  = checks.filter(c => !c.done);
          const scoreColor = score >= 80 ? GREEN : score >= 50 ? FAT_CLR : ORANGE;
          const scoreLabel = score >= 90 ? 'Elite Athlete' : score >= 70 ? 'On Track' : score >= 40 ? 'Getting Started' : 'Just Beginning';

          return (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                Profile Health Check
              </div>
              <div style={{ background: SURF, borderRadius: 16, padding: '18px 16px' }}>

                {/* Score header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  {/* Radial score ring */}
                  <div style={{
                    width: 68, height: 68, borderRadius: '50%', flexShrink: 0,
                    background: `conic-gradient(${scoreColor} ${score * 3.6}deg, ${EDGE} 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: 54, height: 54, borderRadius: '50%', background: SURF,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: 0,
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor, letterSpacing: -1, lineHeight: 1 }}>{score}</div>
                      <div style={{ fontSize: 7, fontWeight: 700, color: MUTED, letterSpacing: 1 }}>/ 100</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: TEXT, letterSpacing: -0.5, lineHeight: 1 }}>{scoreLabel}</div>
                    <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginTop: 4 }}>
                      {doneCount}/{checks.length} checks · {earned}/{totalPts} pts
                    </div>
                    {score < 100 && pending.length > 0 && (
                      <div style={{ fontSize: 10, color: scoreColor, fontWeight: 700, marginTop: 5, lineHeight: 1.3 }}>
                        Next: {pending[0].hint}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: 6, background: EDGE, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{
                    height: '100%', width: `${score}%`,
                    background: scoreColor, borderRadius: 3,
                    transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>

                {/* Check rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {checks.map(({ label, done: isDone, pts, icon }) => (
                    <div key={label} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      background: isDone ? `${GREEN}08` : SURF2,
                      border: `1px solid ${isDone ? GREEN + '25' : EDGE}`,
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                        background: isDone ? `${GREEN}18` : `${EDGE}80`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14,
                      }}>{icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: isDone ? TEXT : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {label}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: isDone ? GREEN : MUTED }}>
                          +{pts}pts
                        </div>
                        <div style={{
                          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                          background: isDone ? GREEN : EDGE,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, color: isDone ? '#fff' : MUTED, fontWeight: 900,
                        }}>
                          {isDone ? '✓' : '·'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {score === 100 && (
                  <div style={{
                    marginTop: 14, padding: '12px 14px',
                    background: `${GREEN}14`, borderRadius: 8,
                    border: `1px solid ${GREEN}30`, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: GREEN }}>🏆 Perfect Profile Score!</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 3, fontWeight: 700 }}>You're getting the most out of FuelSync.</div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── WEIGHT GOAL ── */}
        {(() => {
          const currentKg   = weightLogs[0]?.weightKg ?? parseFloat(weightKg);
          const targetKg    = parseFloat(targetWeightKg);
          const hasCurrent  = !isNaN(currentKg) && currentKg > 0;
          const hasTarget   = !isNaN(targetKg)  && targetKg > 0;
          const diffKg      = hasCurrent && hasTarget ? targetKg - currentKg : null;
          const daysToGoal  = goalTargetDate ? Math.max(0, Math.round((new Date(goalTargetDate).getTime() - Date.now()) / 86400000)) : null;
          const dailyTarget = diffKg !== null && daysToGoal !== null && daysToGoal > 0
            ? Math.round((diffKg * 7700) / daysToGoal) // 7700 kcal ≈ 1 kg fat
            : null;

          return (
            <div style={{ background: SURF, borderRadius: 16, padding: '18px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 14 }}>
                Weight Goal
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                    Target Weight (kg)
                  </div>
                  <input
                    type="number" min={30} max={300} value={targetWeightKg}
                    onChange={(e) => setTargetWeightKg(e.target.value)}
                    onBlur={handleSaveWeightGoal}
                    placeholder="e.g. 75"
                    style={{ ...inp, marginBottom: 0, padding: '10px 12px' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                    Target Date
                  </div>
                  <input
                    type="date" value={goalTargetDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => { setGoalTargetDate(e.target.value); }}
                    onBlur={handleSaveWeightGoal}
                    style={{ ...inp, marginBottom: 0, padding: '10px 12px' }}
                  />
                </div>
              </div>

              {hasCurrent && hasTarget && (
                <div style={{ background: SURF2, borderRadius: 10, padding: '12px 14px', border: `1px solid ${EDGE}` }}>
                  {/* Progress bar */}
                  {(() => {
                    const startKg  = weightLogs[weightLogs.length - 1]?.weightKg ?? currentKg;
                    const totalDiff = targetKg - startKg;
                    const doneDiff  = currentKg - startKg;
                    const progress  = totalDiff !== 0 ? Math.max(0, Math.min(1, doneDiff / totalDiff)) : 0;
                    const lostKg    = Math.abs(currentKg - startKg);
                    return (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Progress
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: Math.abs(diffKg!) < 0.5 ? GREEN : ORANGE }}>
                            {Math.abs(diffKg!).toFixed(1)}kg to go
                          </div>
                        </div>
                        <div style={{ height: 8, background: EDGE, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ height: '100%', width: `${progress * 100}%`, background: diffKg! < 0 ? GREEN : FAT_CLR, borderRadius: 4, transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: MUTED, fontWeight: 600 }}>
                          <span>{startKg}kg (start)</span>
                          <span>{lostKg > 0 ? `${diffKg! < 0 ? '−' : '+'}${lostKg.toFixed(1)}kg` : 'Starting out'}</span>
                          <span>{targetKg}kg (target)</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: diffKg! <= 0 ? GREEN : FAT_CLR, letterSpacing: -1, lineHeight: 1 }}>
                        {diffKg! < 0 ? '↓' : '↑'}{Math.abs(diffKg!).toFixed(1)}
                      </div>
                      <div style={{ fontSize: 8, color: MUTED, fontWeight: 600, marginTop: 2 }}>kg to lose</div>
                    </div>
                    {daysToGoal !== null && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: daysToGoal < 14 ? RED : TEXT, letterSpacing: -1, lineHeight: 1 }}>
                          {daysToGoal}
                        </div>
                        <div style={{ fontSize: 8, color: MUTED, fontWeight: 600, marginTop: 2 }}>days left</div>
                      </div>
                    )}
                    {dailyTarget !== null && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: Math.abs(dailyTarget) > 1000 ? RED : FAT_CLR, letterSpacing: -1, lineHeight: 1 }}>
                          {dailyTarget > 0 ? '+' : ''}{dailyTarget}
                        </div>
                        <div style={{ fontSize: 8, color: MUTED, fontWeight: 600, marginTop: 2 }}>kcal/day adj.</div>
                      </div>
                    )}
                  </div>
                  {dailyTarget !== null && Math.abs(dailyTarget) > 800 && (
                    <div style={{ marginTop: 10, fontSize: 10, color: '#FBBF24', fontWeight: 700, lineHeight: 1.5 }}>
                      ⚠ Aggressive goal — consider extending the timeline for healthier progress.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Goal Mode */}
        <div style={{
          background: SURF,
          borderRadius: 16, padding: '18px 18px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 14 }}>
            Calorie Goal
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([
              ['lose',     'Lose Weight',   RED,    '-500 kcal/day'],
              ['maintain', 'Maintain',      GREEN,  'TDEE target'],
              ['gain',     'Gain Muscle',   YELLOW,  '+300 kcal/day'],
            ] as const).map(([mode, label, color, sub]) => (
              <button key={mode} onClick={() => setGoalMode(mode)} style={{
                flex: 1, padding: '12px 6px', borderRadius: 8,
                border: `1px solid ${goalMode === mode ? color + '60' : EDGE}`,
                background: goalMode === mode ? `${color}14` : SURF2,
                color: goalMode === mode ? color : MUTED,
                fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span>{label}</span>
                <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8 }}>{sub}</span>
              </button>
            ))}
          </div>
          {tdee && (() => {
            const targetCal = tdee + goalCalAdj[goalMode];
            const macroRatios: Record<GoalMode, { p: number; c: number; f: number }> = {
              lose:     { p: 0.35, c: 0.30, f: 0.35 },
              maintain: { p: 0.30, c: 0.40, f: 0.30 },
              gain:     { p: 0.30, c: 0.45, f: 0.25 },
            };
            const r = macroRatios[goalMode];
            const proteinG = Math.round((targetCal * r.p) / 4);
            const carbsG   = Math.round((targetCal * r.c) / 4);
            const fatG     = Math.round((targetCal * r.f) / 9);
            return (
              <div>
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, textAlign: 'center', marginBottom: 10 }}>
                  Target: <strong style={{ color: TEXT }}>{targetCal.toLocaleString()} kcal/day</strong>
                  {goalMode !== 'maintain' && (
                    <span style={{ color: goalMode === 'lose' ? RED : YELLOW }}>
                      {' '}({goalCalAdj[goalMode] > 0 ? '+' : ''}{goalCalAdj[goalMode]} from TDEE)
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {([['Protein', proteinG, PROT], ['Carbs', carbsG, GREEN], ['Fat', fatG, FAT_CLR]] as const).map(([label, g, color]) => (
                    <div key={label} style={{ background: `${color}12`, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: `1px solid ${color}25` }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color, letterSpacing: -0.5 }}>{g}g</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Custom Targets */}
        <div style={{
          background: SURF,
          borderRadius: 16, padding: '18px 18px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>
              Custom Macro Goals
            </div>
            <button
              onClick={() => handleCustomTargetChange('enabled', !customTargets.enabled)}
              style={{
                background: customTargets.enabled ? `${GREEN}18` : SURF2,
                border: `1px solid ${customTargets.enabled ? GREEN + '40' : EDGE}`,
                borderRadius: 8, padding: '5px 14px',
                color: customTargets.enabled ? GREEN : MUTED,
                fontWeight: 800, fontSize: 11, cursor: 'pointer', letterSpacing: 0.5,
              }}
            >
              {customTargets.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {customTargets.enabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                ['calories', 'Calories (kcal)', ORANGE],
                ['proteinG', 'Protein (g)',     YELLOW],
                ['carbsG',   'Carbs (g)',        GREEN],
                ['fatG',     'Fat (g)',           FAT_CLR],
              ] as const).map(([field, label, color]) => (
                <div key={field}>
                  <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>{label}</div>
                  <input
                    type="number"
                    value={customTargets[field] || ''}
                    onChange={(e) => handleCustomTargetChange(field, e.target.value)}
                    style={{ ...inp, padding: '10px 12px', fontSize: 15, borderColor: color + '30' }}
                    min={0}
                  />
                </div>
              ))}
            </div>
          )}
          {customTargets.enabled && (
            <div style={{ marginTop: 12 }}>
              {/* Save as preset */}
              {showPresetSave ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    autoFocus
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowPresetSave(false); }}
                    placeholder="Preset name…"
                    style={{ ...inp, flex: 1, padding: '9px 12px', fontSize: 13 }}
                  />
                  <button onClick={handleSavePreset} style={{ padding: '9px 14px', borderRadius: 8, background: GREEN, border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setShowPresetSave(false)} style={{ padding: '9px 12px', borderRadius: 8, background: SURF2, border: `1px solid ${EDGE}`, color: MUTED, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPresetSave(true)}
                  style={{ width: '100%', padding: '9px', borderRadius: 8, border: `1px dashed ${EDGE}`, background: 'transparent', color: MUTED, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: presets.length > 0 ? 10 : 0 }}
                >+ Save current as preset</button>
              )}
              {/* Preset list */}
              {presets.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, background: SURF2, border: `1px solid ${EDGE}`, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>{p.calories} kcal · P{p.proteinG}g C{p.carbsG}g F{p.fatG}g</div>
                  </div>
                  <button onClick={() => handleLoadPreset(p)} style={{ padding: '5px 10px', borderRadius: 6, background: `${ORANGE_MUT}`, border: `1px solid var(--accent)`, color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Load</button>
                  <button onClick={() => handleDeletePreset(p.id)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14, padding: '4px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {!customTargets.enabled && (
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
              Override the app's auto-calculated daily targets with your own values. Enable to set custom calories and macros.
            </div>
          )}
        </div>



        {/* ── TRAINING DAY MACRO PLANNER ── */}
        {tdee && (() => {
          const base = tdee + goalCalAdj[goalMode];
          const TRAINING_SPLITS: { type: string; label: string; color: string; p: number; c: number; f: number; note: string }[] = [
            { type: 'rest',     label: 'Rest',     color: '#A78BFA', p: 0.30, c: 0.25, f: 0.45, note: 'Fat-fueled recovery' },
            { type: 'strength', label: 'Strength', color: PROT,      p: 0.35, c: 0.35, f: 0.30, note: 'High protein for muscle' },
            { type: 'cardio',   label: 'Cardio',   color: GREEN,     p: 0.25, c: 0.50, f: 0.25, note: 'Carb-forward endurance' },
            { type: 'hybrid',   label: 'Hybrid',   color: FAT_CLR,   p: 0.30, c: 0.40, f: 0.30, note: 'Balanced performance' },
          ];
          return (
            <div style={{ background: SURF, borderRadius: 16, padding: '18px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
                Training Day Macro Planner
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 14 }}>
                How your macros shift by training type · based on {base.toLocaleString()} kcal target
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {TRAINING_SPLITS.map(({ type, label, color, p, c, f, note }) => {
                  const protG = Math.round((base * p) / 4);
                  const carbG = Math.round((base * c) / 4);
                  const fatG  = Math.round((base * f) / 9);
                  return (
                    <div key={type} style={{ background: SURF2, borderRadius: 8, padding: '10px 12px', border: `1px solid ${color}25` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 800, color, marginRight: 8 }}>{label}</span>
                          <span style={{ fontSize: 9, color: MUTED }}>{note}</span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>{base.toLocaleString()} kcal</span>
                      </div>
                      {/* Stacked proportion bar */}
                      <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6, marginBottom: 6 }}>
                        <div style={{ width: `${p * 100}%`, background: PROT }} />
                        <div style={{ width: `${c * 100}%`, background: GREEN }} />
                        <div style={{ width: `${f * 100}%`, background: FAT_CLR }} />
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {[
                          { label: 'Protein', g: protG, color: PROT },
                          { label: 'Carbs',   g: carbG, color: GREEN },
                          { label: 'Fat',     g: fatG,  color: FAT_CLR },
                        ].map(({ label: ml, g, color: mc }) => (
                          <div key={ml} style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 900, color: mc, letterSpacing: -0.3 }}>{g}g</div>
                            <div style={{ fontSize: 8, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{ml}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {error && (
          <div style={{
            color: RED, fontSize: 13, marginBottom: 16, padding: '12px 14px',
            background: 'rgba(239,51,64,0.06)', borderRadius: 8, fontWeight: 700,
            border: '1px solid rgba(239,51,64,0.18)',
          }}>
            {error}
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="nrc-press" style={{
          width: '100%', padding: '17px 0', borderRadius: 8, marginBottom: 14,
          background: saved ? 'var(--accent-muted)' : saving ? SURF2 : 'var(--accent)',
          color: saved ? 'var(--accent)' : saving ? MUTED : '#fff',
          fontWeight: 900, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer',
          border: saved ? '1px solid var(--accent)' : '1px solid transparent',
          transition: 'all 0.25s',
          letterSpacing: 0.5,
        }}>
          {saved ? '✓ Profile Saved' : saving ? 'Saving…' : 'Save Profile →'}
        </button>

        {/* Account Section */}
        <div style={{
          background: SURF,
          borderRadius: 8, padding: '18px 18px',
          border: `1px solid ${EDGE}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 14 }}>
            Account
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Google Cloud Sync */}
            {googleConnected ? (
              <div style={{
                padding: '12px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>☁️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>Google Sync Active</div>
                    <div style={{ fontSize: 11, color: MUTED }}>Profile, training & supplements sync to your Google account</div>
                  </div>
                </div>
                {/* Copy token — lets user pair this account on another device without Google OAuth */}
                <button
                  onClick={async () => {
                    const token = getSyncToken();
                    if (!token) return;
                    await navigator.clipboard.writeText(token).catch(() => {});
                    // Show brief confirmation
                    const el = document.getElementById('fs-token-copy-msg');
                    if (el) { el.style.display = 'block'; setTimeout(() => { el.style.display = 'none'; }, 2000); }
                  }}
                  style={{
                    width: '100%', padding: '8px 0', borderRadius: 6,
                    background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                    color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  📋 Copy Device Token (for pairing another device)
                </button>
                <div id="fs-token-copy-msg" style={{ display: 'none', fontSize: 10, color: GREEN, textAlign: 'center', marginTop: 4 }}>
                  ✓ Token copied — paste it on the other device
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={handleGoogleConnect}
                  disabled={googleConnecting}
                  className="nrc-press"
                  style={{
                    width: '100%', padding: 14, borderRadius: 8,
                    border: '1px solid rgba(66,133,244,0.4)',
                    background: 'rgba(66,133,244,0.08)',
                    color: '#4285F4', fontWeight: 700, fontSize: 13,
                    cursor: googleConnecting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <span style={{ fontSize: 16 }}>🔗</span>
                  {googleConnecting ? 'Connecting…' : 'Connect Google Account'}
                </button>
                <div style={{ fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 6 }}>
                  Saves profile, training & supplements to your Google account
                </div>
                {googleError ? (
                  <div style={{ fontSize: 11, color: RED, textAlign: 'center', marginTop: 4 }}>{googleError}</div>
                ) : null}
              </div>
            )}

            <button onClick={async () => {
              if (!window.confirm('Sign out? Your local data stays on this device.')) return;
              clearSyncToken();
              logout();
            }} className="nrc-press" style={{
              width: '100%', padding: 14, borderRadius: 8,
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
