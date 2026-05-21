import { useState, useEffect, useRef } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import TrainingPicker from '../components/TrainingPicker';
import WeatherBanner from '../components/WeatherBanner';
import { getLogs, estimateSteps } from '../api/localFood';
import StravaCard from '../components/StravaCard';
import { computeMacros } from '@mobile/services/nutritionEngine';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType, LoggedRun } from '@shared/types';
import { getCustomTargets } from '../lib/customTargets';

const BG     = '#070C18';
const SURF   = '#0E1624';
const SURF2  = '#162030';
const EDGE   = 'rgba(255,255,255,0.07)';
const TEXT   = '#E8EEFF';
const MUTED  = '#546078';
const BLUE   = '#3D65FF';
const BLUE2  = '#6B8BFF';
const GREEN  = '#0DBA6A';
const ORANGE = '#F07800';
const PURPLE = '#8844EE';
const CYAN   = '#00C8E8';
const YELLOW = '#F59E0B';
const RED    = '#FF3355';
const CARD_SHADOW = '0 2px 8px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)';

const ACTIVITY_MULT: Record<string, number> = {
  sedentary: 0.4, light: 0.65, moderate: 1.0, very_active: 1.7, extra_active: 2.4,
};

function getThisMonday(): string {
  const d   = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  return m.toISOString().split('T')[0];
}

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

function sumLogs(logs: FoodLog[]): MacroTargets {
  return logs.reduce<MacroTargets>((acc, l) => ({
    calories: acc.calories + parseFloat(l.calories as unknown as string),
    proteinG: acc.proteinG + parseFloat(l.protein  as unknown as string),
    carbsG:   acc.carbsG   + parseFloat(l.carbs    as unknown as string),
    fatG:     acc.fatG     + parseFloat(l.fat       as unknown as string),
  }), emptyMacros());
}

interface MicroTotals {
  fiber_g: number; cholesterol_mg: number; sodium_mg: number;
  vitamin_c_mg: number; vitamin_d_mcg: number; calcium_mg: number; iron_mg: number;
}
const emptyMicros = (): MicroTotals => ({ fiber_g: 0, cholesterol_mg: 0, sodium_mg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0, calcium_mg: 0, iron_mg: 0 });
function sumMicros(logs: FoodLog[]): MicroTotals {
  return logs.reduce<MicroTotals>((acc, l) => ({
    fiber_g:        acc.fiber_g        + (Number(l.fiber_g)        || 0),
    cholesterol_mg: acc.cholesterol_mg + (Number(l.cholesterol_mg) || 0),
    sodium_mg:      acc.sodium_mg      + (Number(l.sodium_mg)      || 0),
    vitamin_c_mg:   acc.vitamin_c_mg   + (Number(l.vitamin_c_mg)   || 0),
    vitamin_d_mcg:  acc.vitamin_d_mcg  + (Number(l.vitamin_d_mcg)  || 0),
    calcium_mg:     acc.calcium_mg     + (Number(l.calcium_mg)     || 0),
    iron_mg:        acc.iron_mg        + (Number(l.iron_mg)        || 0),
  }), emptyMicros());
}
function getMicroTargets(gender: string) {
  const male = gender === 'male';
  return { fiber_g: male ? 38 : 25, cholesterol_mg: 300, sodium_mg: 2300, vitamin_c_mg: male ? 90 : 75, vitamin_d_mcg: 15, calcium_mg: 1000, iron_mg: male ? 8 : 18 };
}

function paceMultiplier(paceMinPerKm?: number): number {
  if (paceMinPerKm == null) return 1.0;
  if (paceMinPerKm < 4.5)  return 1.5;
  if (paceMinPerKm < 5.5)  return 1.25;
  if (paceMinPerKm < 7.0)  return 1.0;
  return 0.75;
}

function fmtPace(p: number): string {
  const m = Math.floor(p);
  const s = String(Math.round((p % 1) * 60)).padStart(2, '0');
  return `${m}:${s}/km`;
}

function buildRecovery(loggedRuns: LoggedRun[], strengthSessions: number, activityLevel = 'moderate') {
  const mult    = ACTIVITY_MULT[activityLevel] ?? 1.0;
  const runLoad = loggedRuns.reduce((t, r) => t + r.km * 1.5 * paceMultiplier(r.paceMinPerKm), 0);
  const strLoad = strengthSessions * 15;
  const score   = Math.max(5, Math.round(100 - Math.min(100, (runLoad + strLoad) / mult)));
  const totalKm = loggedRuns.reduce((s, r) => s + r.km, 0);
  const runs    = loggedRuns.length;
  const parts: string[] = [];
  if (runs > 0)             parts.push(`${runs} run${runs > 1 ? 's' : ''} · ${totalKm.toFixed(1)} km`);
  if (strengthSessions > 0) parts.push(`${strengthSessions} strength`);
  const sub = parts.length ? parts.join(' · ') : 'No training this week';
  if (score >= 90) return { label: 'FRESH',      color: CYAN,   sub, score };
  if (score >= 65) return { label: 'ACTIVE',     color: GREEN,  sub, score };
  if (score >= 40) return { label: 'BUILDING',   color: YELLOW, sub, score };
  if (score >= 20) return { label: 'LOADED',     color: ORANGE, sub, score };
  return             { label: 'OVERLOADED', color: RED,    sub, score };
}

function getHeaderGradient(hour: number): string {
  if (hour >= 5 && hour < 9)  return 'linear-gradient(145deg, #071530 0%, #0D2A60 40%, #3D65FF 100%)';
  if (hour >= 9 && hour < 15) return 'linear-gradient(145deg, #050A18 0%, #122060 40%, #3D65FF 100%)';
  if (hour >= 15 && hour < 20) return 'linear-gradient(145deg, #0E0620 0%, #250E50 40%, #2C188A 100%)';
  return 'linear-gradient(145deg, #070412 0%, #0E0620 40%, #160840 100%)';
}

// ── COUNT-UP ANIMATION HOOK ────────────────────────────────────
function useCountUp(to: number, duration = 750): number {
  const [val, setVal] = useState(0);
  const frameRef = useRef<number>();
  const prevTo   = useRef(0);
  useEffect(() => {
    if (prevTo.current === to) return;
    const from = prevTo.current;
    prevTo.current = to;
    const t0 = performance.now();
    const step = (now: number) => {
      const p    = Math.min((now - t0) / duration, 1);
      const ease = 1 - (1 - p) * (1 - p);
      setVal(Math.round(from + (to - from) * ease));
      if (p < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [to, duration]);
  return val;
}

// ── CALORIE RING ─────────────────────────────────────────────────
function CalRing({ pct, cal, target }: { pct: number; cal: number; target: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  const displayCal = useCountUp(mounted ? cal : 0);
  const displayPct = mounted ? pct : 0;

  const S = 180, W = 11, r = (S - W * 2) / 2;
  const circ = 2 * Math.PI * r;
  const arc  = Math.min(displayPct / 100, 1) * circ;
  const over = pct >= 100;
  const onTrack = pct >= 78 && pct < 100;
  const gradId = over ? 'ringOver' : 'ringNormal';
  const breatheClass = over ? 'breathe-r' : onTrack ? 'breathe-g' : 'breathe-b';

  return (
    <div
      className={`ring-enter ${breatheClass}`}
      style={{ position: 'relative', width: S, height: S }}
    >
      <svg width={S} height={S} style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <linearGradient id="ringNormal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={CYAN}  />
            <stop offset="50%"  stopColor={BLUE2} />
            <stop offset="100%" stopColor={BLUE}  />
          </linearGradient>
          <linearGradient id="ringOver" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={YELLOW} />
            <stop offset="100%" stopColor={RED}    />
          </linearGradient>
          <linearGradient id="ringOnTrack" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={CYAN}  />
            <stop offset="100%" stopColor={GREEN} />
          </linearGradient>
          <filter id="ringGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx={S/2} cy={S/2} r={r} fill="none"
          stroke={over ? `${RED}14` : onTrack ? `${GREEN}14` : `${BLUE}10`}
          strokeWidth={W} />
        {/* Decorative inner ring */}
        <circle cx={S/2} cy={S/2} r={r - 20} fill="none"
          stroke={over ? `${RED}06` : `${BLUE}05`}
          strokeWidth={1} strokeDasharray="4 8" />
        {/* Fill */}
        <circle cx={S/2} cy={S/2} r={r} fill="none"
          stroke={`url(#${onTrack && !over ? 'ringOnTrack' : gradId})`}
          strokeWidth={W}
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${S/2} ${S/2})`}
          filter="url(#ringGlow)"
          style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, marginBottom: 2, textTransform: 'uppercase' }}>
          Consumed
        </div>
        <div style={{
          fontSize: 40, fontWeight: 900, letterSpacing: -3, lineHeight: 1,
          color: over ? RED : onTrack ? GREEN : TEXT,
          transition: 'color 0.4s',
        }}>
          {displayCal.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginTop: 4, letterSpacing: 0.3 }}>
          of <span style={{ color: over ? RED : BLUE, fontWeight: 800 }}>
            {Math.round(target).toLocaleString()}
          </span> kcal
        </div>
        {pct > 0 && (
          <div style={{
            marginTop: 10, padding: '3px 12px', borderRadius: 20,
            background: over ? `${RED}12` : onTrack ? `${GREEN}12` : `${BLUE}10`,
            color: over ? RED : onTrack ? GREEN : BLUE,
            fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
            transition: 'all 0.4s',
          }}>
            {over ? `+${Math.round(pct - 100)}% over` : `${Math.round(pct)}%`}
          </div>
        )}
        {onTrack && (
          <div style={{ marginTop: 5, fontSize: 10, fontWeight: 700, color: GREEN, letterSpacing: 0.5 }}>
            ON TRACK
          </div>
        )}
      </div>
    </div>
  );
}

// ── MACRO SECTION (unified card) ─────────────────────────────────
function MacroSection({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const macros = [
    { id: 'pro', label: 'PROTEIN', current: consumed.proteinG, target: targets?.proteinG ?? 0, color: RED    },
    { id: 'crb', label: 'CARBS',   current: consumed.carbsG,   target: targets?.carbsG   ?? 0, color: CYAN   },
    { id: 'fat', label: 'FAT',     current: consumed.fatG,     target: targets?.fatG     ?? 0, color: PURPLE },
  ];

  return (
    <div style={{
      background: `linear-gradient(160deg, ${SURF} 0%, ${SURF2} 100%)`,
      borderRadius: 20, padding: '20px 20px 16px',
      border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW,
    }}>
      {macros.map(({ id, label, current, target, color }, i) => {
        const pct  = target > 0 ? Math.min((current / target) * 100, 100) : 0;
        const over = current > target && target > 0;
        const c    = over ? RED : color;
        const remaining = Math.max(0, Math.round(target - current));

        return (
          <div key={id} style={{ marginBottom: i < 2 ? 20 : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: 3, background: c, flexShrink: 0 }} />
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: c, textTransform: 'uppercase' }}>
                  {label}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1.5, color: c, lineHeight: 1 }}>
                  {Math.round(current)}
                </span>
                <span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>
                  /{Math.round(target)}g
                </span>
              </div>
            </div>
            <div style={{ height: 8, background: `${c}12`, borderRadius: 6, overflow: 'hidden' }}>
              <div
                className="bar-ani"
                style={{
                  height: '100%', width: `${pct}%`,
                  background: `linear-gradient(90deg, ${c}55, ${c}CC, ${c})`,
                  borderRadius: 6,
                  transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: `0 0 8px ${c}40`,
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: over ? RED : MUTED, fontWeight: 600, marginTop: 4 }}>
              {over
                ? `${Math.round(current - target)}g over target`
                : `${remaining}g remaining`}
            </div>
          </div>
        );
      })}

      {/* ── CALORIC SPLIT BAR ── */}
      {(() => {
        const tot = consumed.proteinG * 4 + consumed.carbsG * 4 + consumed.fatG * 9;
        if (tot <= 0) return null;
        const pP = Math.round(consumed.proteinG * 4 / tot * 100);
        const cP = Math.round(consumed.carbsG   * 4 / tot * 100);
        const fP = Math.max(0, 100 - pP - cP);
        return (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${EDGE}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
              Caloric Split
            </div>
            <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
              <div style={{ width: `${pP}%`, background: RED,    transition: 'width 0.8s ease' }} />
              <div style={{ width: `${cP}%`, background: CYAN,   transition: 'width 0.8s ease' }} />
              <div style={{ width: `${fP}%`, background: PURPLE, transition: 'width 0.8s ease', borderRadius: '0 6px 6px 0' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 7 }}>
              {[['Protein', pP, RED], ['Carbs', cP, CYAN], ['Fat', fP, PURPLE]].map(([lbl, pct, color]) => (
                <div key={String(lbl)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: String(color) }} />
                  <span style={{ fontSize: 10, color: String(color), fontWeight: 700 }}>{lbl} {pct}%</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── RECOVERY CARD ─────────────────────────────────────────────────
function RecoveryCard({ recovery }: { recovery: { label: string; color: string; sub: string; score: number } }) {
  const S = 58, W = 5, r = (S - W * 2) / 2;
  const circ  = 2 * Math.PI * r;
  const sweep = 0.75;
  const arc   = (recovery.score / 100) * circ * sweep;
  const track = circ * sweep;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${recovery.color}20 0%, ${SURF} 60%)`,
      borderRadius: 18, padding: '16px 18px',
      border: `1px solid ${recovery.color}22`,
      borderLeft: `3px solid ${recovery.color}`,
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: `0 1px 2px rgba(10,22,40,0.04), 0 4px 20px ${recovery.color}14, 0 0 0 1px ${recovery.color}08`,
    }}>
      {/* Gauge */}
      <div style={{ position: 'relative', flexShrink: 0, width: S, height: S }}>
        <svg width={S} height={S} style={{ transform: 'rotate(135deg)' }}>
          <circle cx={S/2} cy={S/2} r={r} fill="none"
            stroke={`${recovery.color}22`} strokeWidth={W}
            strokeDasharray={`${track} ${circ - track}`} strokeLinecap="round" />
          <circle cx={S/2} cy={S/2} r={r} fill="none"
            stroke={recovery.color} strokeWidth={W}
            strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: recovery.color, lineHeight: 1 }}>
            {recovery.score}
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, marginBottom: 3, textTransform: 'uppercase' }}>
          Recovery Status
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: recovery.color, lineHeight: 1 }}>
          {recovery.label}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontWeight: 500 }}>
          {recovery.sub}
        </div>
      </div>
    </div>
  );
}

// ── DAILY INSIGHT ─────────────────────────────────────────────────
const INSIGHTS: Record<string, string[]> = {
  rest: [
    'Rest days are when muscles actually grow. Keep protein high today.',
    'Active recovery like light walking supports fat metabolism on rest days.',
    'Great day for meal prep — set yourself up for a strong training week.',
    'Quality sleep tonight is the most anabolic thing you can do right now.',
  ],
  strength: [
    '20–40g of protein within 30 minutes of your session maximizes synthesis.',
    'Progressive overload drives adaptation — aim to beat last week by one rep.',
    'Heavy lifting elevates your metabolism for up to 48 hours after training.',
    'Creatine + carbs post-workout accelerates glycogen replenishment.',
  ],
  cardio: [
    'Complex carbs 2–3 hours before cardio fuel longer, stronger efforts.',
    'Electrolytes matter on high-sweat days — sodium, potassium, magnesium.',
    'High carb targets today replenish glycogen for your next intense session.',
    'Even an easy cardio day improves heart efficiency — every session counts.',
  ],
  hybrid: [
    'Balanced macros = balanced recovery. Smart choice for today.',
    'Hybrid training builds both aerobic base and muscular strength in one shot.',
    'Keep protein elevated today to support repair from both training modalities.',
    'A well-rounded athlete is a resilient athlete. Great mode.',
  ],
};

const INSIGHT_COLORS: Record<string, string> = {
  rest: CYAN, strength: GREEN, cardio: ORANGE, hybrid: PURPLE,
};

function DailyInsight({ trainingType }: { trainingType?: string }) {
  const type  = trainingType ?? 'rest';
  const tips  = INSIGHTS[type] ?? INSIGHTS.rest;
  const color = INSIGHT_COLORS[type] ?? BLUE;
  const idx   = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % tips.length;

  return (
    <div style={{
      background: `${color}07`, borderRadius: 16, padding: '15px 17px',
      border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: color,
          flexShrink: 0,
        }} />
        <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 2.5, color, textTransform: 'uppercase' }}>
          Daily Insight
        </div>
      </div>
      <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.65, fontWeight: 500 }}>
        {tips[idx]}
      </div>
    </div>
  );
}

// ── MICRONUTRIENT TABLE ───────────────────────────────────────────
function MicroTable({ consumed, targets, hasData }: { consumed: MicroTotals; targets: ReturnType<typeof getMicroTargets>; hasData: boolean }) {
  const [open, setOpen] = useState(false);

  const rows: { key: keyof MicroTotals; label: string; unit: string; isLimit: boolean; color: string }[] = [
    { key: 'fiber_g',        label: 'Fiber',       unit: 'g',   isLimit: false, color: GREEN  },
    { key: 'cholesterol_mg', label: 'Cholesterol', unit: 'mg',  isLimit: true,  color: ORANGE },
    { key: 'sodium_mg',      label: 'Sodium',      unit: 'mg',  isLimit: true,  color: ORANGE },
    { key: 'vitamin_c_mg',   label: 'Vitamin C',   unit: 'mg',  isLimit: false, color: CYAN   },
    { key: 'vitamin_d_mcg',  label: 'Vitamin D',   unit: 'mcg', isLimit: false, color: YELLOW },
    { key: 'calcium_mg',     label: 'Calcium',     unit: 'mg',  isLimit: false, color: BLUE2  },
    { key: 'iron_mg',        label: 'Iron',        unit: 'mg',  isLimit: false, color: RED    },
  ];

  return (
    <div style={{ background: SURF, borderRadius: 20, border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 18px', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>Micronutrients</div>
          {!hasData && !open && (
            <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontWeight: 500 }}>Log foods via AI or search to track</div>
          )}
        </div>
        <div style={{ color: MUTED, fontSize: 18, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</div>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${EDGE}`, padding: '14px 18px 16px' }}>
          {!hasData && (
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
              Micronutrients are tracked when you log food via AI Smart or USDA search.
              Values will appear here once tracked data exists.
            </div>
          )}
          {rows.map(({ key, label, unit, isLimit, color }) => {
            const val    = Math.round(consumed[key] * 10) / 10;
            const target = targets[key];
            const pct    = target > 0 ? Math.min(100, (val / target) * 100) : 0;
            const over   = val > target && target > 0;
            const barCol = isLimit
              ? (over ? RED : GREEN)
              : pct >= 80 ? GREEN : pct >= 40 ? ORANGE : RED;
            const displayPct = Math.round(pct);

            return (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{label}</span>
                    {isLimit && <span style={{ fontSize: 8, fontWeight: 700, color: MUTED, letterSpacing: 1 }}>LIMIT</span>}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: barCol }}>
                    {val}{unit}
                    <span style={{ fontSize: 9, color: MUTED, fontWeight: 500 }}> / {target}{unit}</span>
                    <span style={{ fontSize: 9, color: barCol, fontWeight: 700, marginLeft: 5 }}>{displayPct}%</span>
                  </div>
                </div>
                <div style={{ height: 5, background: `${barCol}12`, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: `linear-gradient(90deg, ${barCol}60, ${barCol})`,
                    borderRadius: 3, transition: 'width 0.7s ease',
                  }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 8, fontSize: 9, color: MUTED, fontWeight: 500, lineHeight: 1.5 }}>
            Based on DRI/RDA guidelines. Targets personalised by gender.
          </div>
        </div>
      )}
    </div>
  );
}

// ── WATER TRACKER ─────────────────────────────────────────────────
function WaterTracker({ date }: { date: string }) {
  const TARGET = 8;
  const KEY = `fs_water_${date}`;
  const [glasses, setGlasses] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(KEY) ?? '0', 10) || 0; } catch { return 0; }
  });

  const update = (n: number) => {
    const clamped = Math.max(0, Math.min(12, n));
    setGlasses(clamped);
    try { localStorage.setItem(KEY, String(clamped)); } catch { /* ignore */ }
  };

  const pct   = Math.min(100, (glasses / TARGET) * 100);
  const done  = glasses >= TARGET;
  const color = done ? GREEN : CYAN;

  return (
    <div style={{ background: SURF, borderRadius: 18, padding: '16px 18px', border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>Hydration</div>
          {done && (
            <div style={{ padding: '2px 8px', borderRadius: 10, background: `${GREEN}20`, color: GREEN, fontSize: 9, fontWeight: 800 }}>GOAL MET</div>
          )}
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, color, lineHeight: 1 }}>
          {glasses}<span style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}>/{TARGET}</span>
          <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginLeft: 4 }}>glasses</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {Array.from({ length: TARGET }, (_, i) => (
          <div
            key={i}
            onClick={() => update(i < glasses ? i : i + 1)}
            style={{
              flex: 1, height: 26, borderRadius: 6,
              background: i < glasses ? `${color}BB` : `${color}12`,
              border: `1px solid ${i < glasses ? `${color}80` : `${color}20`}`,
              cursor: 'pointer', transition: 'all 0.18s ease',
            }}
          />
        ))}
      </div>

      <div style={{ height: 5, background: `${color}12`, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => update(glasses - 1)} disabled={glasses <= 0} className="nrc-press" style={{
          width: 36, height: 34, borderRadius: 9, flexShrink: 0,
          background: SURF2, border: `1px solid ${EDGE}`,
          color: glasses > 0 ? MUTED : `${MUTED}40`, fontWeight: 900, fontSize: 17, cursor: glasses > 0 ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>−</button>
        <button onClick={() => update(glasses + 1)} disabled={glasses >= 12} className="nrc-press" style={{
          flex: 1, height: 34, borderRadius: 9,
          background: done ? `${GREEN}18` : `${color}12`,
          border: `1px solid ${done ? `${GREEN}40` : `${color}25`}`,
          color: done ? GREEN : color,
          fontWeight: 800, fontSize: 12, letterSpacing: 0.5, cursor: glasses >= 12 ? 'default' : 'pointer',
          opacity: glasses >= 12 ? 0.5 : 1,
        }}>
          {glasses >= TARGET ? '+ More' : '+ Glass  ·  250 ml'}
        </button>
      </div>
    </div>
  );
}

// ── STEPS DISPLAY ─────────────────────────────────────────────────
function StepsBar({ steps, color }: { steps: number; color: string }) {
  const pct = Math.min(100, (steps / 10000) * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
        {/* Zone markers */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: `${ORANGE}30` }} />
        <div style={{ position: 'absolute', left: '80%', top: 0, bottom: 0, width: 1, background: `${GREEN}30` }} />
        <div
          className="bar-ani"
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})`,
            borderRadius: 5, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>0</div>
        <div style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>5k</div>
        <div style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>8k</div>
        <div style={{ fontSize: 8, color: GREEN, fontWeight: 700 }}>10k+</div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuthStore();
  const name = user?.displayName || 'Athlete';
  const profileComplete = !!(user?.weightKg && user?.heightCm && user?.age);
  const activityLevel = user?.activityLevel ?? 'moderate';

  const weatherKeySet = !!(import.meta.env.VITE_OPENWEATHER_KEY);
  const { todayLog, targets, weeklyLoad, weather, environmentAlert, logDay, refreshWeather, resetDay, setActivityModifier, profile } = useNutrition();
  const storeSetTargets       = useNutritionStore((s) => s.setTargets);
  const storeSetModifier      = useNutritionStore((s) => s.setActivityModifier);
  const loggedRuns            = useNutritionStore((s) => s.weeklyLoad.loggedRuns ?? []);
  const removeRunKm           = useNutritionStore((s) => s.removeRunKm);
  const renameRun             = useNutritionStore((s) => s.renameRun);
  const resetWeeklyRuns       = useNutritionStore((s) => s.resetWeeklyRuns);
  const addRunKm              = useNutritionStore((s) => s.addRunKm);
  const addStrengthSession    = useNutritionStore((s) => s.addStrengthSession);
  const removeStrengthSession = useNutritionStore((s) => s.removeStrengthSession);
  const startNewWeek          = useNutritionStore((s) => s.startNewWeek);

  const [consumed,        setConsumed]        = useState<MacroTargets>(emptyMacros());
  const [consumedMicros,  setConsumedMicros]  = useState<MicroTotals>(emptyMicros());
  const [stepDescription, setStepDescription] = useState('');
  const [stepEstimate,    setStepEstimate]    = useState<number | null>(null);
  const [stepLoading,     setStepLoading]     = useState(false);

  const STEPS_KEY = `fs_steps_${new Date().toISOString().slice(0, 10)}`;
  const [workoutKm,       setWorkoutKm]       = useState('');
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [workoutName,     setWorkoutName]     = useState('');
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [editingRunIdx,   setEditingRunIdx]   = useState<number | null>(null);
  const [editingRunName,  setEditingRunName]  = useState('');

  const today    = new Date().toISOString().split('T')[0];
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'EVENING';

  useEffect(() => {
    const monday = getThisMonday();
    if (weeklyLoad.weekStart !== monday) startNewWeek(monday);
  }, []);

  useEffect(() => { getLogs(today).then((l) => { setConsumed(sumLogs(l)); setConsumedMicros(sumMicros(l)); }).catch(() => {}); }, [today]);
  useEffect(() => { refreshWeather().catch(() => {}); }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STEPS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.description) setStepDescription(saved.description);
        if (saved.estimate != null) {
          setStepEstimate(saved.estimate);
          applyStepModifier(saved.estimate < 6000 ? 'low' : saved.estimate > 10000 ? 'high' : 'normal');
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STEPS_KEY, JSON.stringify({ description: stepDescription, estimate: stepEstimate }));
    } catch { /* ignore */ }
  }, [stepDescription, stepEstimate, STEPS_KEY]);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type);
    if (r.blocked && !window.confirm(
      `Your legs are heavily loaded from this week's runs.\n\nRunning today risks injury — consider switching to upper-body strength instead.\n\nLog cardio anyway?`
    )) return;
    if (r.blocked) logDay(type);
  };

  // Custom targets override
  const customTargets = getCustomTargets();
  const effectiveTargets = (customTargets.enabled && targets)
    ? { ...targets, calories: customTargets.calories, proteinG: customTargets.proteinG, carbsG: customTargets.carbsG, fatG: customTargets.fatG }
    : targets;

  // Net calories: estimate burned from today's training type + logged runs this week
  const userWeightKg = profile?.weightKg ?? 75;
  const runCalBurned = Math.round(loggedRuns.reduce((s, r) => s + r.km * userWeightKg * 1.05, 0));
  const strengthSets = weeklyLoad.totalStrengthSets ?? 0;
  const strengthCalBurned = Math.round(strengthSets * 7);
  const totalBurned = runCalBurned + strengthCalBurned;
  const netCal = effectiveTargets ? Math.round(effectiveTargets.calories + totalBurned - consumed.calories) : 0;

  const calPct   = effectiveTargets && effectiveTargets.calories > 0 ? (consumed.calories / effectiveTargets.calories) * 100 : 0;
  const calLeft  = effectiveTargets ? Math.round(effectiveTargets.calories - consumed.calories) : 0;
  const strength = weeklyLoad.totalStrengthSets ?? 0;
  const recovery = buildRecovery(loggedRuns, strength, activityLevel);

  const manualKm = loggedRuns.filter((r) => r.source === 'manual').reduce((s, r) => s + r.km, 0);
  const stravaKm = loggedRuns.filter((r) => r.source === 'strava').reduce((s, r) => s + r.km, 0);

  const stepLabel = stepEstimate !== null
    ? stepEstimate < 6000 ? 'LOW' : stepEstimate < 10000 ? 'NORMAL' : 'HIGH'
    : todayLog?.dailyActivityModifier === 'low' ? 'LOW'
    : todayLog?.dailyActivityModifier === 'high' ? 'HIGH'
    : null;
  const stepLabelColor = stepLabel === 'LOW' ? ORANGE : stepLabel === 'HIGH' ? GREEN : BLUE;

  const applyStepModifier = (modifier: 'low' | 'normal' | 'high') => {
    storeSetModifier(modifier);
    if (profile && todayLog) {
      const updated = { ...todayLog, dailyActivityModifier: modifier };
      const breakdown = computeMacros(profile, updated, weeklyLoad);
      storeSetTargets(breakdown.targets);
    }
  };

  const handleEstimateSteps = async () => {
    const q = stepDescription.trim();
    if (!q || stepLoading) return;
    setStepLoading(true);
    try {
      const r = await estimateSteps(q);
      setStepEstimate(r.steps);
      applyStepModifier(r.label === 'high' ? 'high' : r.label === 'low' ? 'low' : 'normal');
    } catch { /* silent */ }
    setStepLoading(false);
  };

  const weatherRec = (() => {
    if (!weather || !todayLog?.trainingType || todayLog.trainingType === 'rest') return null;
    const temp    = weather.tempC;
    const desc    = weather.description.toLowerCase();
    const isStorm   = desc.includes('storm') || desc.includes('thunder');
    const isExtreme = temp > 38 || temp < -5 || isStorm;
    const isHot     = temp > 32;
    const isRainy   = desc.includes('rain') || desc.includes('drizzle');
    const isCardio  = todayLog.trainingType === 'cardio' || todayLog.trainingType === 'hybrid';
    if (isExtreme) return { text: 'Extreme conditions — strength training or rest recommended', color: RED };
    if (isCardio && (isHot || isRainy)) return { text: 'Tough outdoor conditions — indoor cardio recommended', color: ORANGE };
    if (isCardio) return { text: 'Good conditions for outdoor cardio', color: GREEN };
    return null;
  })();

  const headerGrad = getHeaderGradient(hour);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG }}>

      {/* ── HERO HEADER ── */}
      <div style={{
        background: headerGrad,
        padding: '44px 22px 32px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Floating orbs */}
        <div className="orb1" style={{
          position: 'absolute', top: -30, right: 10, width: 180, height: 180,
          borderRadius: '50%', background: 'rgba(75,111,255,0.12)',
        }} />
        <div className="orb2" style={{
          position: 'absolute', bottom: -40, left: -20, width: 130, height: 130,
          borderRadius: '50%', background: 'rgba(75,111,255,0.12)',
        }} />
        <div className="orb3" style={{
          position: 'absolute', top: 50, left: '38%', width: 70, height: 70,
          borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        }} />

        <div className="nrc-a nrc-a1" style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.55)', marginBottom: 6, textTransform: 'uppercase' }}>
              Good {greeting}
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1, color: '#FFFFFF' }}>
              {name.toUpperCase()}
            </div>
            {weather && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 20, padding: '4px 12px',
                  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
                }}>
                  {Math.round(weather.tempC)}°C · {weather.description}
                </div>
              </div>
            )}
          </div>

          {/* Date badge */}
          <div style={{
            background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)',
            backdropFilter: 'blur(8px)',
            borderRadius: 14, padding: '10px 14px', textAlign: 'center', flexShrink: 0,
          }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: 1 }}>
              {new Date().toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -2, color: '#FFFFFF', lineHeight: 1, margin: '2px 0' }}>
              {new Date().getDate()}
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: 1 }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Calorie left chip */}
        {effectiveTargets && calLeft !== 0 && (
          <div className="nrc-a nrc-a2" style={{ position: 'relative', zIndex: 1, marginTop: 16 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: calLeft > 0 ? 'rgba(5,197,107,0.2)' : 'rgba(239,51,64,0.2)',
              border: `1px solid ${calLeft > 0 ? 'rgba(5,197,107,0.35)' : 'rgba(239,51,64,0.35)'}`,
              borderRadius: 20, padding: '5px 14px',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: calLeft > 0 ? GREEN : RED }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>
                {calLeft > 0
                  ? `${calLeft.toLocaleString()} kcal remaining today`
                  : `${Math.abs(calLeft)} kcal over target`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── PROFILE ALERT ── */}
      {!profileComplete && (
        <div className="nrc-a nrc-a2" style={{ padding: '16px 22px 0' }}>
          <div style={{
            background: `${ORANGE}08`, borderRadius: 16, padding: '15px 18px',
            border: `1px solid ${ORANGE}25`, borderLeft: `3px solid ${ORANGE}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 2 }}>
                Complete Your Profile
              </div>
              <div style={{ fontSize: 12, color: MUTED }}>
                Unlock personalised macro targets → go to Profile
              </div>
            </div>
            <div style={{ fontSize: 20, color: ORANGE, fontWeight: 900 }}>→</div>
          </div>
        </div>
      )}

      {/* Extreme weather banner */}
      {environmentAlert && environmentAlert.level !== 'none' && weather && (
        <div style={{ padding: '12px 22px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert} />
        </div>
      )}

      {/* ── DAILY STEPS ── */}
      {todayLog && (
        <div className="nrc-a nrc-a2" style={{ padding: '16px 22px 0' }}>
          <div style={{
            background: SURF, borderRadius: 18, padding: '16px 18px',
            border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: stepEstimate !== null ? 10 : 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
                Daily Activity
              </div>
              {stepLabel && (
                <div style={{
                  padding: '3px 10px', borderRadius: 20,
                  background: `${stepLabelColor}14`, color: stepLabelColor,
                  fontSize: 9, fontWeight: 800, letterSpacing: 1,
                }}>
                  {stepLabel}
                </div>
              )}
            </div>

            {stepEstimate !== null && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 8 }}>
                  <input
                    type="number"
                    value={stepEstimate}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 0) {
                        setStepEstimate(v);
                        applyStepModifier(v < 6000 ? 'low' : v > 10000 ? 'high' : 'normal');
                      }
                    }}
                    style={{
                      background: 'transparent', border: 'none', outline: 'none',
                      color: stepLabelColor, fontSize: 32, fontWeight: 900, letterSpacing: -2,
                      fontFamily: 'Inter, system-ui, sans-serif', padding: 0, width: 110,
                    }}
                  />
                  <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>steps</span>
                  <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginLeft: 4 }}>
                    {stepLabel === 'LOW' ? '−13% kcal' : stepLabel === 'HIGH' ? '+8% kcal' : 'normal target'}
                  </span>
                </div>
                <StepsBar steps={stepEstimate} color={stepLabelColor} />
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Describe your day... desk job, 30min walk, gym..."
                value={stepDescription}
                onChange={(e) => setStepDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEstimateSteps(); }}
                style={{
                  flex: 1, padding: '10px 13px', borderRadius: 11,
                  border: `1px solid ${EDGE}`, background: SURF2, color: TEXT,
                  fontSize: 12, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif',
                }}
              />
              <button
                onClick={handleEstimateSteps}
                disabled={stepLoading || !stepDescription.trim()}
                style={{
                  background: BLUE, border: 'none', borderRadius: 11, color: '#fff',
                  fontWeight: 800, fontSize: 11, letterSpacing: 0.5,
                  cursor: (!stepDescription.trim() || stepLoading) ? 'not-allowed' : 'pointer',
                  padding: '0 15px', whiteSpace: 'nowrap',
                  opacity: (!stepDescription.trim() || stepLoading) ? 0.5 : 1,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {stepLoading ? '···' : stepEstimate !== null ? 'Update' : 'Estimate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WATER TRACKER ── */}
      <div className="nrc-a nrc-a2" style={{ padding: '14px 22px 0' }}>
        <WaterTracker date={today} />
      </div>

      {/* ── CALORIE RING ── */}
      {effectiveTargets ? (
        <div className="nrc-a nrc-a2" style={{ padding: '22px 22px 0' }}>
          {weatherRec && (
            <div style={{
              background: `${weatherRec.color}0E`, border: `1px solid ${weatherRec.color}30`,
              borderRadius: '16px 16px 0 0', padding: '9px 18px', borderBottom: 'none',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: weatherRec.color, lineHeight: 1.4 }}>
                {weatherRec.text}
              </div>
            </div>
          )}
          <div style={{
            background: `linear-gradient(160deg, ${SURF} 0%, ${SURF2} 100%)`,
            borderRadius: weatherRec ? '0 0 24px 24px' : 24,
            padding: '28px 20px 24px',
            boxShadow: CARD_SHADOW, border: `1px solid ${EDGE}`,
            borderTop: weatherRec ? 'none' : undefined,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Ambient glow behind ring */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -55%)',
              width: 200, height: 200, borderRadius: '50%',
              background: `radial-gradient(circle, ${calPct >= 100 ? RED : calPct >= 78 ? GREEN : BLUE}0A 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
            <CalRing pct={calPct} cal={consumed.calories} target={effectiveTargets.calories} />
          </div>
        </div>
      ) : (
        <div className="nrc-a nrc-a2" style={{ padding: '22px 22px 0' }}>
          <div style={{
            background: SURF, borderRadius: 22, padding: '32px 22px',
            border: `1px solid ${EDGE}`, textAlign: 'center', boxShadow: CARD_SHADOW,
          }}>
            <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -4, color: TEXT, lineHeight: 1 }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 3, marginTop: 10 }}>
              CALORIES TODAY
            </div>
            {profileComplete && (
              <div style={{
                marginTop: 16, padding: '11px 16px', background: `${BLUE}08`,
                borderRadius: 14, border: `1px solid ${BLUE}18`,
              }}>
                <div style={{ fontSize: 13, color: BLUE, fontWeight: 700 }}>
                  Pick a training mode below
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
                  to unlock your personalised macro targets
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MACRO SECTION ── */}
      {effectiveTargets && (
        <div className="nrc-a nrc-a3" style={{ padding: '14px 22px 0' }}>
          <MacroSection consumed={consumed} targets={effectiveTargets} />
        </div>
      )}

      {/* ── NET CALORIES ── */}
      {effectiveTargets && totalBurned > 0 && (
        <div className="nrc-a nrc-a3" style={{ padding: '12px 22px 0' }}>
          <div style={{
            background: `linear-gradient(160deg, ${SURF} 0%, ${SURF2} 100%)`,
            borderRadius: 18, padding: '16px 18px',
            border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: MUTED, textTransform: 'uppercase', marginBottom: 12 }}>
              Net Calories
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
              <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>{effectiveTargets.calories.toLocaleString()}</div>
                <div style={{ fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>GOAL</div>
              </div>
              <div style={{ color: GREEN, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>+</div>
              <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: GREEN, letterSpacing: -0.5 }}>{totalBurned.toLocaleString()}</div>
                <div style={{ fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>BURNED</div>
              </div>
              <div style={{ color: MUTED, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>−</div>
              <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: ORANGE, letterSpacing: -0.5 }}>{Math.round(consumed.calories).toLocaleString()}</div>
                <div style={{ fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>EATEN</div>
              </div>
              <div style={{ color: MUTED, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>=</div>
              <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: netCal >= 0 ? GREEN : RED, letterSpacing: -0.5 }}>{netCal.toLocaleString()}</div>
                <div style={{ fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>NET LEFT</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MICRONUTRIENTS ── */}
      <div className="nrc-a nrc-a3" style={{ padding: '12px 22px 0' }}>
        <MicroTable
          consumed={consumedMicros}
          targets={getMicroTargets(user?.gender ?? 'male')}
          hasData={Object.values(consumedMicros).some((v) => v > 0)}
        />
      </div>

      {/* ── RECOVERY ── */}
      {effectiveTargets && (
        <div className="nrc-a nrc-a3" style={{ padding: '12px 22px 0' }}>
          <RecoveryCard recovery={recovery} />
        </div>
      )}

      {/* ── TRAINING MODE ── */}
      <div className="nrc-a nrc-a4" style={{ padding: '24px 22px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>
            {todayLog ? `Training Mode — ${todayLog.trainingType?.toUpperCase() ?? ''}` : 'Select Training Mode'}
          </div>
          {todayLog && (
            <button
              onClick={() => { if (window.confirm('Reset today?')) resetDay(); }}
              style={{
                background: 'none', border: 'none', color: MUTED,
                fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
              }}
            >
              RESET
            </button>
          )}
        </div>
        <TrainingPicker selected={todayLog?.trainingType ?? null} onSelect={handleSelectType} />
      </div>

      {/* ── DAILY INSIGHT (shown when training type is selected) ── */}
      {todayLog?.trainingType && (
        <div className="nrc-a nrc-a4" style={{ padding: '14px 22px 0' }}>
          <DailyInsight trainingType={todayLog.trainingType} />
        </div>
      )}

      {/* ── WEEKLY LOAD ── */}
      <div className="nrc-a nrc-a5" style={{ padding: '20px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>
          Weekly Load
        </div>
        <div style={{
          background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`,
          overflow: 'hidden', boxShadow: CARD_SHADOW,
        }}>
          {/* Running */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${EDGE}` }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${GREEN}12`, border: `1px solid ${GREEN}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={GREEN}>
                <path d="M13 2L4.09 12.76A1 1 0 005 14.5h6L10 22l9.91-10.76A1 1 0 0019 9.5H13.5L13 2z" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Running</div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginTop: 2 }}>
                {manualKm > 0 && <span>{manualKm.toFixed(1)} km manual</span>}
                {manualKm > 0 && stravaKm > 0 && <span style={{ margin: '0 4px' }}>·</span>}
                {stravaKm > 0 && <span style={{ color: '#FC4C02' }}>{stravaKm.toFixed(1)} km Strava</span>}
                {manualKm === 0 && stravaKm === 0 && <span>No runs this week</span>}
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: weeklyLoad.totalRunKm > 0 ? GREEN : MUTED, letterSpacing: -1 }}>
              {weeklyLoad.totalRunKm.toFixed(1)}<span style={{ fontSize: 10, color: MUTED, fontWeight: 700, marginLeft: 2 }}>KM</span>
            </div>
          </div>

          {/* Strength */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${PURPLE}12`, border: `1px solid ${PURPLE}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PURPLE} strokeWidth="2.5" strokeLinecap="round">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
                <line x1="6.8" y1="12" x2="9.5" y2="12" />
                <line x1="14.5" y1="12" x2="17.2" y2="12" />
                <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Strength</div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginTop: 2 }}>
                {strength > 0
                  ? `${strength} session${strength > 1 ? 's' : ''} this week`
                  : 'No sessions this week'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {strength > 0 && (
                <button onClick={() => removeStrengthSession()} className="nrc-press" style={{
                  width: 28, height: 28, borderRadius: 8, border: `1px solid ${EDGE}`,
                  background: SURF2, color: MUTED, fontWeight: 900, fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                }}>−</button>
              )}
              <div style={{ fontSize: 22, fontWeight: 900, color: strength > 0 ? PURPLE : MUTED, minWidth: 20, textAlign: 'center', letterSpacing: -1 }}>
                {strength}
              </div>
              <button onClick={() => addStrengthSession()} className="nrc-press" style={{
                background: `${PURPLE}12`, border: `1px solid ${PURPLE}30`, color: PURPLE,
                borderRadius: 8, fontWeight: 700, fontSize: 10, letterSpacing: 0.5, cursor: 'pointer',
                padding: '5px 10px', whiteSpace: 'nowrap',
              }}>
                + LOG
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── LOGGED RUNS ── */}
      <div className="nrc-a nrc-a5" style={{ padding: '16px 22px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>
              Logged Runs
            </div>
            {weeklyLoad.totalRunKm > 0 && (
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1, color: GREEN, lineHeight: 1 }}>
                {weeklyLoad.totalRunKm.toFixed(1)}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1, marginLeft: 2 }}>KM</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {loggedRuns.length > 0 && (
              <button
                onClick={() => { if (window.confirm('Reset all logged runs?')) resetWeeklyRuns(); }}
                style={{
                  background: 'none', border: `1px solid ${EDGE}`, color: MUTED,
                  borderRadius: 20, fontWeight: 700, fontSize: 10, letterSpacing: 0.5,
                  cursor: 'pointer', padding: '4px 10px',
                }}
              >
                RESET
              </button>
            )}
            <button onClick={() => setShowWorkoutForm(!showWorkoutForm)} className="nrc-press" style={{
              background: `${GREEN}12`, border: `1px solid ${GREEN}30`, color: GREEN,
              borderRadius: 20, fontWeight: 700, fontSize: 10, letterSpacing: 0.5,
              cursor: 'pointer', padding: '4px 13px',
            }}>
              + LOG
            </button>
          </div>
        </div>

        {showWorkoutForm && (
          <div style={{ background: SURF, borderRadius: 16, padding: '16px', border: `1px solid ${EDGE}`, marginBottom: 12, boxShadow: CARD_SHADOW }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 12 }}>
              Log a Run
            </div>
            <input type="text" value={workoutName} placeholder="Run name (optional)"
              onChange={(e) => setWorkoutName(e.target.value)}
              style={{ width: '100%', background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, padding: '10px 13px', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="number" value={workoutKm} placeholder="Distance (km)" min={0}
                onChange={(e) => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setWorkoutKm(v); }}
                style={{ flex: 1, background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, padding: '10px 13px', outline: 'none' }}
              />
              <input type="number" value={workoutDuration} placeholder="Duration (min)" min={0}
                onChange={(e) => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setWorkoutDuration(v); }}
                style={{ flex: 1, background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, padding: '10px 13px', outline: 'none' }}
              />
            </div>
            {workoutKm && workoutDuration && parseFloat(workoutKm) > 0 && parseFloat(workoutDuration) > 0 && (
              <div style={{ fontSize: 11, color: BLUE, fontWeight: 700, marginBottom: 10 }}>
                Pace: {fmtPace(parseFloat(workoutDuration) / parseFloat(workoutKm))}
              </div>
            )}
            <button onClick={() => {
              const km  = parseFloat(workoutKm);
              const dur = parseFloat(workoutDuration);
              if (!km || km <= 0) return;
              const durationMin  = dur > 0 ? dur : undefined;
              const paceMinPerKm = durationMin ? durationMin / km : undefined;
              addRunKm(km, workoutName.trim() || 'Run', 'manual', durationMin, paceMinPerKm);
              setWorkoutKm(''); setWorkoutDuration(''); setWorkoutName(''); setShowWorkoutForm(false);
            }} className="nrc-press" style={{
              width: '100%', background: GREEN, border: 'none', borderRadius: 11, color: '#fff',
              fontWeight: 900, fontSize: 13, cursor: 'pointer', padding: '12px 0',
              boxShadow: `0 4px 18px ${GREEN}40`,
            }}>
              DONE
            </button>
          </div>
        )}

        <div style={{
          background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`,
          overflow: 'hidden', boxShadow: CARD_SHADOW,
        }}>
          {loggedRuns.length === 0 ? (
            <div style={{ padding: '22px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
                No runs logged this week — tap + LOG to add one
              </div>
            </div>
          ) : loggedRuns.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', padding: '12px 16px',
              borderTop: i === 0 ? 'none' : `1px solid ${EDGE}`, gap: 10,
              borderLeft: `3px solid ${r.source === 'strava' ? '#FC4C02' : GREEN}`,
              background: r.source === 'strava' ? 'rgba(252,76,2,0.03)' : `${GREEN}03`,
            }}>
              {editingRunIdx === i ? (
                <input autoFocus value={editingRunName}
                  onChange={(e) => setEditingRunName(e.target.value)}
                  onBlur={() => { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); }
                    if (e.key === 'Escape') setEditingRunIdx(null);
                  }}
                  style={{
                    flex: 1, fontSize: 13, fontWeight: 600, color: TEXT,
                    border: 'none', borderBottom: `1px solid ${GREEN}`, outline: 'none',
                    background: 'transparent', padding: '1px 0',
                  }}
                />
              ) : (
                <div
                  onClick={() => { setEditingRunIdx(i); setEditingRunName(r.name); }}
                  style={{ flex: 1, fontSize: 13, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  title="Tap to rename"
                >
                  {r.name}
                </div>
              )}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: r.source === 'strava' ? '#FC4C02' : GREEN, letterSpacing: -0.5 }}>
                  {r.km}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginLeft: 2 }}>KM</span>
                </div>
                {r.paceMinPerKm && (
                  <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 1 }}>{fmtPace(r.paceMinPerKm)}</div>
                )}
              </div>
              <button onClick={() => removeRunKm(r.km, r.name)} style={{
                background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer',
                padding: '0 2px', lineHeight: 1, flexShrink: 0,
              }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── STRAVA ── */}
      <div className="nrc-a nrc-a6" style={{ padding: '20px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>
          Strava Connect
        </div>
        <StravaCard />
      </div>

      <div style={{ height: 36 }} />
    </div>
  );
}
