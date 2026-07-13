import { useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { getLogs } from '../api/localFood';
import type { FoodLog } from '../api/localFood';
import RoutineChecklist from '../components/RoutineChecklist';
import GlowMetrics from '../components/GlowMetrics';

const MUTED = 'var(--muted)';
type GlowSubTab = 'ascend' | 'routine';

const SUB_TABS: { id: GlowSubTab; label: string; color: string }[] = [
  { id: 'ascend',  label: 'ASCEND',  color: '#D81B60' },
  { id: 'routine', label: 'ROUTINE', color: '#43A047' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Nudge {
  icon: string;
  color: string;
  title: string;
  body: string;
  priority: number;
}

interface Tip {
  icon: string;
  tag: string;
  color: string;
  title: string;
  body: string;
}

// ─── Static tip bank (daily rotation) ────────────────────────────────────────

const ALL_TIPS: Tip[] = [
  { icon: '💧', tag: 'SKIN',  color: '#1E88E5', title: 'Hydration = glass skin',           body: 'Drink 35ml per kg bodyweight. Dehydration shows in your face within hours — dull skin, puffy eyes, visible pores.' },
  { icon: '🥩', tag: 'SKIN',  color: '#1E88E5', title: 'Collagen starts with protein',     body: 'Your body can\'t make collagen without glycine and proline. Lean beef, chicken skin and bone broth are the top sources.' },
  { icon: '🧴', tag: 'SKIN',  color: '#1E88E5', title: 'SPF every single morning',         body: 'UV is the #1 cause of premature aging. SPF 30+ daily is more effective than any serum or supplement.' },
  { icon: '🫐', tag: 'SKIN',  color: '#1E88E5', title: 'Antioxidants block UV damage',     body: 'Vitamin C and E neutralize free radicals. Blueberries, bell peppers and almonds keep your skin barrier strong.' },
  { icon: '🌙', tag: 'SKIN',  color: '#1E88E5', title: 'Night is when skin repairs',       body: 'Growth hormone peaks at 11pm–1am and drives collagen rebuild. Sleep deprivation visibly ages skin in 48 hours.' },
  { icon: '🥚', tag: 'HAIR',  color: '#FB8C00', title: 'Eggs are the best hair food',      body: 'Whole eggs give biotin, zinc, selenium and protein — every micronutrient hair follicles need. 2 eggs a day is enough.' },
  { icon: '🐟', tag: 'HAIR',  color: '#FB8C00', title: 'Omega-3 thickens hair',            body: 'DHT (the hair-loss hormone) is suppressed by omega-3. Salmon, sardines and walnuts are the highest sources.' },
  { icon: '🌿', tag: 'HAIR',  color: '#FB8C00', title: 'Iron deficiency causes shedding',  body: 'Low ferritin is the most overlooked cause of hair loss. Red meat, spinach, lentils. Get bloodwork if shedding.' },
  { icon: '💊', tag: 'HAIR',  color: '#FB8C00', title: 'Scalp massage 4 min/day',          body: 'Daily scalp massage increases hair growth by 68% in studies. Do it in the shower — no cost, measurable result.' },
  { icon: '😴', tag: 'SLEEP', color: '#7E57C2', title: '8h sleep = free HGH injection',    body: 'HGH peaks in the first 90 min of deep sleep. It builds muscle, burns fat and repairs collagen simultaneously.' },
  { icon: '🌡️', tag: 'SLEEP', color: '#7E57C2', title: 'Cold room = deep sleep',           body: 'Core temp must drop 1–2°C to reach deep sleep. Keep your room at 18–19°C. Warm shower 1h before bed triggers the drop.' },
  { icon: '📵', tag: 'SLEEP', color: '#7E57C2', title: 'Screen light delays sleep 90min',  body: 'Blue light suppresses melatonin for 90 minutes. Switch to warm light or blue-light glasses after 9pm.' },
  { icon: '💪', tag: 'BODY',  color: '#43A047', title: 'Posture is the free jawline hack', body: 'Forward head posture collapses your jawline. 2 min of dead hangs + chin tucks daily resets your anterior chain.' },
  { icon: '🧊', tag: 'BODY',  color: '#43A047', title: 'Cold exposure boosts testosterone', body: 'Cold showers 3–5 min daily increase norepinephrine by 300% and support testosterone levels.' },
  { icon: '🪒', tag: 'GROOM', color: '#E65100', title: 'Skin prep > razor quality',         body: 'Soften stubble 90 sec under hot water before shaving. A cheap razor with good prep beats an expensive one used dry.' },
  { icon: '🧴', tag: 'GROOM', color: '#E65100', title: 'Moisturizer within 60 seconds',    body: 'Apply within 60 seconds of washing your face — while skin is still damp. Locks in hydration 3x more effectively.' },
];

function getDailyTip(): Tip {
  const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
  return ALL_TIPS[day % ALL_TIPS.length];
}

// ─── Personalised nudge engine ────────────────────────────────────────────────

function buildNudges(
  logs: FoodLog[],
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number } | null,
  trainingType: string,
  intensity: string,
  activityModifier: string | undefined,
  weeklyRunKm: number,
  strengthSessions: number,
  legFatigue: number,
  recoveryScore: number,
  weightKg: number | null,
  age: number | null,
  gender: string | null,
): Nudge[] {
  const n: Nudge[] = [];
  const hour    = new Date().getHours();
  const cal     = logs.reduce((s, l) => s + l.calories, 0);
  const prot    = logs.reduce((s, l) => s + l.protein,  0);
  const carb    = logs.reduce((s, l) => s + l.carbs,    0);
  const fat     = logs.reduce((s, l) => s + l.fat,      0);
  const calDiff = targets ? cal - targets.calories : 0;
  const protLeft = targets ? Math.max(0, targets.proteinG - prot) : 0;
  const isWorkout = ['strength', 'cardio', 'hybrid', 'hiit', 'cycling'].includes(trainingType);
  const isRest    = trainingType === 'rest';
  const isEvening = hour >= 19;
  const isMorning = hour < 10;

  // ── Recovery score ──────────────────────────────────────────────────────────
  if (recoveryScore < 35) {
    n.push({
      icon: '🛌', color: '#E53935', priority: 1,
      title: `Recovery at ${recoveryScore}% — your body is signaling`,
      body: isWorkout
        ? 'Training on low recovery spikes cortisol and accelerates skin breakdown. Consider a walk or mobility session instead. Your face will look less puffy tomorrow.'
        : 'Good call resting. Prioritize 8h sleep tonight — this is when HGH rebuilds collagen and muscle simultaneously.',
    });
  } else if (recoveryScore >= 80) {
    n.push({
      icon: '⚡', color: '#43A047', priority: 5,
      title: `Recovery at ${recoveryScore}% — optimal window`,
      body: 'Your body is primed. A high-intensity session today will maximize testosterone response and GH output tonight. Go hard.',
    });
  }

  // ── Leg fatigue ─────────────────────────────────────────────────────────────
  if (legFatigue > 65) {
    n.push({
      icon: '🦵', color: '#FB8C00', priority: 2,
      title: `Leg fatigue at ${legFatigue}% — protect your joints`,
      body: 'Heavy leg load this week. Collagen in tendons and cartilage repairs slower than muscle. Add vitamin C + collagen 30 min before any lower body work, or switch to upper body today.',
    });
  }

  // ── Weekly run volume ───────────────────────────────────────────────────────
  if (weeklyRunKm > 35) {
    n.push({
      icon: '🏃', color: '#1E88E5', priority: 3,
      title: `${weeklyRunKm.toFixed(0)}km run this week — tendon load`,
      body: 'High mileage depletes collagen in Achilles and patellar tendons before you feel it. Take 10g collagen + 50mg vitamin C within 30 min of your run. Timing matters more than dose.',
    });
  } else if (weeklyRunKm > 0) {
    n.push({
      icon: '🏃', color: '#43A047', priority: 6,
      title: `${weeklyRunKm.toFixed(0)}km logged this week`,
      body: 'Running improves skin circulation and lymphatic drainage — your face looks better on run days. Keep the consistency.',
    });
  }

  // ── Strength volume ─────────────────────────────────────────────────────────
  if (strengthSessions >= 4) {
    n.push({
      icon: '🏋️', color: '#0091EA', priority: 3,
      title: `${strengthSessions} strength sessions this week`,
      body: 'Heavy lifting depletes zinc and magnesium fast. Zinc is critical for testosterone and collagen synthesis. Pumpkin seeds, beef, dark chocolate — add them this week.',
    });
  }

  // ── Protein ─────────────────────────────────────────────────────────────────
  if (protLeft > 25 && cal > 0) {
    const example = weightKg && weightKg > 85
      ? '200g chicken (46g), 3 eggs (18g), or a shake (25g)'
      : '150g chicken (34g), 2 eggs (12g), Greek yogurt (15g)';
    n.push({
      icon: '🥩', color: '#1E88E5', priority: isWorkout ? 1 : 2,
      title: `${Math.round(protLeft)}g protein still needed today`,
      body: `Collagen synthesis, hair growth and muscle repair all stall without hitting your protein floor. Options: ${example}.`,
    });
  } else if (targets && prot >= targets.proteinG * 0.95 && prot > 0) {
    n.push({
      icon: '✅', color: '#43A047', priority: 6,
      title: 'Protein goal hit',
      body: 'Collagen synthesis, hair growth and muscle repair are all fueled. Sleep now does the rest.',
    });
  }

  // ── Calories ─────────────────────────────────────────────────────────────────
  if (calDiff > 300) {
    n.push({
      icon: '🔥', color: '#E53935', priority: 2,
      title: `${Math.round(calDiff)} kcal over today`,
      body: isEvening
        ? 'Stop eating now. Insulin spikes at night blunt the GH peak that repairs your skin and burns fat while you sleep.'
        : 'Offset it: skip the next carb-heavy meal, keep protein, add a 20-min walk. Don\'t starve — it spikes cortisol.',
    });
  } else if (targets && calDiff < -500 && cal > 0 && isWorkout) {
    n.push({
      icon: '📉', color: '#FB8C00', priority: 2,
      title: `${Math.abs(Math.round(calDiff))} kcal under on a training day`,
      body: 'Undereating after training spikes cortisol, which breaks down muscle AND collagen. Eat a protein + carb meal now — this isn\'t the day to be in a big deficit.',
    });
  } else if (cal === 0 && !isMorning) {
    n.push({
      icon: '🍽️', color: '#FB8C00', priority: 3,
      title: 'Nothing logged yet today',
      body: 'Log your meals even roughly. Unlogged days make it impossible to connect what you eat to how you look and recover.',
    });
  }

  // ── Activity modifier (steps) ───────────────────────────────────────────────
  if (activityModifier === 'low') {
    n.push({
      icon: '🚶', color: '#7E57C2', priority: 4,
      title: 'Low movement day',
      body: 'Your lymphatic system has no pump — it runs on muscle movement. Low step count = facial puffiness, slower skin renewal, higher cortisol. A 20-min walk fixes this.',
    });
  } else if (activityModifier === 'high') {
    n.push({
      icon: '🔋', color: '#43A047', priority: 5,
      title: 'High activity today',
      body: 'High NEAT burns more than most people realize. Make sure you\'re not undereating — chronic deficit + high activity = cortisol dominance, which shows on your face.',
    });
  }

  // ── Rest day protocol ────────────────────────────────────────────────────────
  if (isRest) {
    const restBody = targets && carb > targets.carbsG * 0.7
      ? 'You\'re on a rest day with high carbs — insulin spikes without physical demand store it as fat. Shift to protein + fat today and save carbs for tomorrow\'s training.'
      : 'Rest day done right: lower carbs, same protein, slightly higher fat. Avocado, eggs and olive oil support testosterone on off days.';
    n.push({ icon: '🛌', color: '#7E57C2', priority: 4, title: 'Rest day protocol', body: restBody });
  }

  // ── Late carbs ───────────────────────────────────────────────────────────────
  if (isEvening && targets && carb > targets.carbsG * 0.45 && cal > 0) {
    n.push({
      icon: '🌙', color: '#7E57C2', priority: 3,
      title: 'Heavy carbs late tonight',
      body: 'Carbs after 7pm spike insulin during the GH secretion window. This blunts fat oxidation and skin repair overnight. Wind down with protein + fat only from here.',
    });
  }

  // ── Fat too low ───────────────────────────────────────────────────────────────
  if (targets && fat < targets.fatG * 0.45 && cal > 0) {
    n.push({
      icon: '🥑', color: '#43A047', priority: 4,
      title: 'Dietary fat very low today',
      body: gender === 'female'
        ? 'Low fat disrupts estrogen and progesterone synthesis. Hormonal imbalance shows as dull skin, hair shedding and irregular cycles. Add olive oil, avocado or nuts.'
        : 'Testosterone and DHT are synthesized from cholesterol. Under-eating fat tanks hormone levels. Add avocado, olive oil or whole eggs.',
    });
  }

  // ── Age-specific ─────────────────────────────────────────────────────────────
  if (age && age >= 28 && weeklyRunKm === 0 && strengthSessions === 0) {
    n.push({
      icon: '⏱️', color: '#E65100', priority: 5,
      title: 'Zero training logged this week',
      body: age >= 30
        ? 'After 30, muscle loss accelerates at 1% per year without resistance training. Muscle is the metabolic and aesthetic foundation — nothing replaces it.'
        : 'No training this week. Even 2 sessions of 30 min changes body composition, testosterone and how your face looks.',
    });
  }

  // ── Morning routine push ──────────────────────────────────────────────────────
  if (isMorning) {
    n.push({
      icon: '☀️', color: '#FB8C00', priority: 6,
      title: 'Morning window',
      body: 'First 90 min after waking: sunlight in your eyes (sets circadian rhythm), SPF on skin, cold water on face (reduces puffiness fast). Don\'t skip these — they compound.',
    });
  }

  return n.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

// ─── Components ───────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 800 }}>{value}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--surf2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${value}%`, background: color, borderRadius: 99,
          transition: 'width 0.7s var(--spring)',
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
    </div>
  );
}

function NudgeCard({ nudge, i }: { nudge: Nudge; i: number }) {
  return (
    <div className={`card a a${Math.min(i + 2, 6) as 2}`} style={{
      padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
      borderLeft: `3px solid ${nudge.color}`,
    }}>
      <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{nudge.icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{nudge.title}</div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>{nudge.body}</div>
      </div>
    </div>
  );
}



// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GlowScreen() {
  const { user }   = useAuthStore();
  const store      = useNutritionStore();
  const targets    = useEffectiveTargets();
  const [logs, setLogs]         = useState<FoodLog[]>([]);
  const [glowTab, setGlowTab]   = useState<GlowSubTab>('ascend');

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    getLogs(today).then(setLogs).catch(() => {});
  }, []);

  const wl       = store.weeklyLoad;
  const tl       = store.todayLog;
  const daily    = useMemo(() => getDailyTip(), []);

  const nudges = useMemo(() => buildNudges(
    logs,
    targets,
    tl?.trainingType ?? 'rest',
    tl?.intensity    ?? 'moderate',
    tl?.dailyActivityModifier,
    wl.totalRunKm,
    wl.strengthSessions.length,
    wl.legFatigueScore,
    wl.recoveryScore,
    user?.weightKg ?? null,
    user?.age      ?? null,
    user?.gender   ?? null,
  ), [logs, targets, tl, wl, user]);

  const cal     = logs.reduce((s, l) => s + l.calories, 0);
  const prot    = logs.reduce((s, l) => s + l.protein,  0);
  const calPct  = targets ? Math.min(110, Math.round((cal / targets.calories) * 100)) : 0;
  const protPct = targets ? Math.min(100, Math.round((prot / targets.proteinG) * 100)) : 0;
  const recColor = wl.recoveryScore >= 70 ? '#43A047' : wl.recoveryScore >= 40 ? '#FB8C00' : '#E53935';
  const fatColor = wl.legFatigueScore >= 70 ? '#E53935' : wl.legFatigueScore >= 40 ? '#FB8C00' : '#43A047';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 16px 100px', background: 'var(--bg)' }}>

      {/* Header */}
      <div className="a a1" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, color: 'var(--text)' }}>Ascend ✦</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
          Personalized to your training & nutrition
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="a a2" style={{
        display: 'flex', gap: 6, marginBottom: 20,
        background: 'var(--surf)', borderRadius: 14, padding: 5,
        border: '1px solid var(--edge)',
      }}>
        {SUB_TABS.map(tab => {
          const active = tab.id === glowTab;
          return (
            <button
              key={tab.id}
              onClick={() => setGlowTab(tab.id)}
              className="press"
              style={{
                flex: 1, padding: '8px 6px',
                background: active ? `${tab.color}18` : 'transparent',
                border: `1px solid ${active ? `${tab.color}40` : 'transparent'}`,
                borderRadius: 10,
                fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                color: active ? tab.color : 'var(--muted)',
                cursor: 'pointer',
                transition: 'all 0.2s var(--spring)',
                boxShadow: active ? `0 0 14px ${tab.color}30` : 'none',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ROUTINE tab */}
      {glowTab === 'routine' && <RoutineChecklist />}

      {/* ASCEND tab — existing content below */}
      {glowTab === 'ascend' && (<>

      {/* Dashboard snapshot */}
      <div className="card a a2" style={{ padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: MUTED, marginBottom: 14 }}>YOUR STATUS</div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <ScoreBar label="Recovery"    value={wl.recoveryScore}   color={recColor} />
          <ScoreBar label="Leg Fatigue" value={wl.legFatigueScore} color={fatColor} />
        </div>
        {targets && cal > 0 && (
          <div style={{ display: 'flex', gap: 14 }}>
            <ScoreBar label="Calories" value={calPct}  color={calPct > 105 ? '#E53935' : '#43A047'} />
            <ScoreBar label="Protein"  value={protPct} color={protPct >= 90 ? '#43A047' : '#1E88E5'} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Run km', val: `${wl.totalRunKm.toFixed(0)}km`, color: '#1E88E5' },
            { label: 'Strength', val: `${wl.strengthSessions.length}x`, color: '#0091EA' },
            tl?.trainingType ? { label: 'Today', val: tl.trainingType, color: 'var(--accent)' } : null,
            tl?.dailyActivityModifier ? { label: 'Steps', val: tl.dailyActivityModifier, color: '#FB8C00' } : null,
          ].filter(Boolean).map((s) => s && (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 9, color: MUTED, fontWeight: 600, letterSpacing: '0.08em', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Personalized nudges */}
      {nudges.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 10 }}>
            FOR YOU TODAY
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nudges.map((nd, i) => <NudgeCard key={nd.title} nudge={nd} i={i} />)}
          </div>
        </div>
      )}

      {/* Daily rotating tip */}
      <div className="a a3" style={{
        background: `linear-gradient(135deg, ${daily.color}15 0%, var(--surf) 100%)`,
        border: `1.5px solid ${daily.color}30`,
        borderRadius: 18, padding: '18px 18px', marginBottom: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -16, right: -16, fontSize: 72, opacity: 0.06, userSelect: 'none' }}>{daily.icon}</div>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', color: daily.color, marginBottom: 8 }}>TIP OF THE DAY</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>{daily.title}</div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.65 }}>{daily.body}</div>
      </div>

      </>)}
    </div>
  );
}
