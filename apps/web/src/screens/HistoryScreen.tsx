import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllLogs, addLog, unremoveLog, clearPullCache, getWeeklySummary, type FoodLog, type Ingredient, type WeeklySummary } from '../api/localFood';
import { playFoodLogSound } from '../utils/sounds';
import { useNutrition } from '../hooks/useNutrition';
import { useNutritionStore } from '../store/nutritionStore';
import { useThemeStore } from '../store/themeStore';
import { db } from '../lib/db';

const BG      = 'var(--bg)';
const SURF    = 'var(--surf)';
const SURF2   = 'var(--surf2)';
const EDGE    = 'var(--edge)';
const TEXT    = 'var(--text)';
const MUTED   = 'var(--muted)';
const MUTED2  = 'var(--muted2)';
const GREEN      = '#22C55E';   // carbs
const ORANGE     = 'var(--accent)';  // CSS var — use only for direct color props, NOT hex-suffix template literals
const ORANGE_HEX = '#2F81F7';        // hex equivalent — use in template literals with opacity suffix
const ORANGE_MUT = 'var(--accent-muted)';
const YELLOW     = '#22C55E';   // carbs (alias)
const PROT    = '#38BDF8';   // protein — blue
const RED     = '#EF4444';
const FAT_CLR = '#F59E0B';   // fat — amber
const CARD_SHADOW = 'var(--shadow-md)';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack', other: 'Other',
};

interface DaySummary {
  date: string; label: string;
  totalCal: number; totalProtein: number; totalCarbs: number; totalFat: number;
  items: FoodLog[];
}

interface FoodDirEntry {
  name: string;
  count: number;
  lastLogged: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  latestLog: FoodLog;
}

function buildFoodDirectory(logs: FoodLog[]): FoodDirEntry[] {
  const active = logs.filter((l) => !l.removed);
  const map = new Map<string, FoodLog[]>();
  for (const log of active) {
    const key = log.food_name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
  }
  return Array.from(map.values())
    .map((entries) => {
      entries.sort((a, b) => b.logged_at.localeCompare(a.logged_at));
      const n = entries.length;
      const latest = entries[0];
      return {
        name:      latest.food_name,
        count:     n,
        lastLogged: latest.logged_at,
        calories:  Math.round(entries.reduce((s, e) => s + Number(e.calories), 0) / n),
        protein:   Math.round(entries.reduce((s, e) => s + Number(e.protein),  0) / n),
        carbs:     Math.round(entries.reduce((s, e) => s + Number(e.carbs),    0) / n),
        fat:       Math.round(entries.reduce((s, e) => s + Number(e.fat),      0) / n),
        latestLog: latest,
      };
    })
    .sort((a, b) => b.lastLogged.localeCompare(a.lastLogged));
}

function dateLabel(date: string): string {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (date === today)     return 'Today';
  if (date === yesterday) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function groupByDate(logs: FoodLog[]): DaySummary[] {
  const map = new Map<string, FoodLog[]>();
  for (const log of logs) {
    const d = log.logged_at.slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(log);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const active = items.filter((i) => !i.removed);
      // Only show days that had at least one active entry ever
      if (active.length === 0 && items.every((i) => i.removed)) {
        // Keep the day visible so removed items are still accessible
      }
      return {
        date, label: dateLabel(date),
        totalCal:     Math.round(active.reduce((s, i) => s + Number(i.calories), 0)),
        totalProtein: Math.round(active.reduce((s, i) => s + Number(i.protein),  0)),
        totalCarbs:   Math.round(active.reduce((s, i) => s + Number(i.carbs),    0)),
        totalFat:     Math.round(active.reduce((s, i) => s + Number(i.fat),      0)),
        items,  // includes both active and removed
      };
    });
}

function calcStreak(days: DaySummary[]): number {
  if (days.length === 0) return 0;
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const sorted    = days.filter(d => d.items.length > 0).map(d => d.date).sort((a, b) => b.localeCompare(a));
  if (sorted.length === 0) return 0;
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00');
    const curr = new Date(sorted[i]     + 'T12:00:00');
    if (Math.round((prev.getTime() - curr.getTime()) / 86400000) === 1) streak++;
    else break;
  }
  return streak;
}

// ── STREAK MILESTONE ──────────────────────────────────────────────
function StreakMilestone({ streak }: { streak: number }) {
  if (streak < 3) return null;
  const milestones = [
    { min: 30, label: 'ELITE ATHLETE', color: '#C8A200', msg: '1 full month of consistency. You are in rare company.' },
    { min: 14, label: 'COMMITTED',     color: GREEN,     msg: '2 weeks straight. Fuel tracking is becoming your identity.' },
    { min: 7,  label: 'ON FIRE',       color: ORANGE_HEX, msg: '7 day streak — a perfect week of fuel tracking.' },
    { min: 3,  label: 'BUILDING',      color: YELLOW,     msg: '3 day streak — momentum is everything. Keep going.' },
  ];
  const m = milestones.find((x) => streak >= x.min)!;
  return (
    <div className="milestone-in" style={{
      background: `linear-gradient(135deg, ${m.color}18, ${m.color}06)`,
      border: `1px solid ${m.color}40`,
      borderRadius: 8, padding: '18px 20px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: `0 4px 24px ${m.color}18`,
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 8, background: `${m.color}20`, border: `2px solid ${m.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: m.color, letterSpacing: -1 }}>{streak}</div>
      </div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: m.color, textTransform: 'uppercase', marginBottom: 4 }}>
          {streak} Day Streak · {m.label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, lineHeight: 1.4 }}>
          {m.msg}
        </div>
      </div>
    </div>
  );
}

// ── WEIGHT TREND CHART ────────────────────────────────────────────
interface WeightEntry { date: string; weightKg: number; }
function WeightChart({ entries, units }: { entries: WeightEntry[]; units: 'metric' | 'imperial' }) {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const vals   = sorted.map(e => units === 'imperial' ? e.weightKg * 2.20462 : e.weightKg);
  const min    = Math.min(...vals) - 1;
  const max    = Math.max(...vals) + 1;
  const range  = max - min || 1;
  const W = 280, H = 80, PAD = 12;
  const xs = sorted.map((_, i) => PAD + (i / (sorted.length - 1)) * (W - PAD * 2));
  const ys = vals.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2));
  const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const fillPath = `M${xs[0]},${H} ` + xs.map((x, i) => `L${x},${ys[i]}`).join(' ') + ` L${xs[xs.length-1]},${H} Z`;
  const latest   = vals[vals.length - 1];
  const first    = vals[0];
  const delta    = latest - first;
  const unitLabel = units === 'imperial' ? 'lb' : 'kg';

  return (
    <div style={{ background: SURF, borderRadius: 8, padding: '16px 16px 14px', border: `1px solid ${EDGE}`, marginBottom: 16, boxShadow: CARD_SHADOW }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>
            Weight Trend
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: TEXT, letterSpacing: -1, lineHeight: 1 }}>
              {latest.toFixed(1)}
            </span>
            <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{unitLabel}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: delta <= 0 ? GREEN : RED, letterSpacing: -0.5 }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unitLabel}
          </div>
          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>
            vs {sorted.length} days ago
          </div>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORANGE_HEX} stopOpacity="0.25" />
            <stop offset="100%" stopColor={ORANGE_HEX} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#wg)" />
        <polyline points={polyline} fill="none" stroke={ORANGE_HEX} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Latest dot */}
        <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="4" fill={ORANGE_HEX} />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 9, color: MUTED }}>{sorted[0].date}</span>
        <span style={{ fontSize: 9, color: MUTED }}>{sorted[sorted.length-1].date}</span>
      </div>
    </div>
  );
}

// ── 7-DAY MACRO AVERAGES ──────────────────────────────────────────
function MacroAverages({ days, targets }: { days: DaySummary[]; targets: { calories: number; proteinG: number; carbsG: number; fatG: number } | null }) {
  const today = new Date();
  const week  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - i);
    return d.toISOString().split('T')[0];
  });
  const dayMap = new Map(days.map(d => [d.date, d]));
  const logged = week.map(d => dayMap.get(d)).filter(Boolean) as DaySummary[];
  if (logged.length === 0) return null;

  const avg = (key: 'totalProtein' | 'totalCarbs' | 'totalFat') =>
    Math.round(logged.reduce((s, d) => s + d[key], 0) / logged.length);

  const macros = [
    { label: 'Protein', key: 'totalProtein' as const, color: PROT,    target: targets?.proteinG ?? 0 },
    { label: 'Carbs',   key: 'totalCarbs'   as const, color: YELLOW,  target: targets?.carbsG   ?? 0 },
    { label: 'Fat',     key: 'totalFat'     as const, color: FAT_CLR, target: targets?.fatG     ?? 0 },
  ];

  return (
    <div style={{ background: SURF, borderRadius: 8, padding: '16px', border: `1px solid ${EDGE}`, marginBottom: 16, boxShadow: CARD_SHADOW }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>
        7-Day Macro Avg · {logged.length} days
      </div>
      {macros.map(({ label, key, color, target }) => {
        const val = avg(key);
        const pct = target > 0 ? Math.min((val / target) * 100, 130) : 0;
        const over = val > target && target > 0;
        return (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: over ? RED : color }}>{label}</span>
              <div style={{ fontSize: 11, color: MUTED }}>
                <span style={{ fontWeight: 800, color: over ? RED : TEXT }}>{val}g</span>
                {target > 0 && <span style={{ marginLeft: 4 }}>/ {target}g target</span>}
              </div>
            </div>
            <div style={{ height: 6, background: SURF2, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 4,
                background: over ? RED : color,
                transition: 'width 0.6s ease',
                opacity: over ? 1 : 0.85,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WEEKLY BAR CHART ──────────────────────────────────────────────
function WeeklyChart({ days, goalCal }: { days: DaySummary[]; goalCal: number }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const dayMap    = new Map(days.map(d => [d.date, d]));
  const maxCal    = Math.max(goalCal * 1.2, ...week.map(d => dayMap.get(d)?.totalCal ?? 0), 1);
  const CHART_H   = 80;
  const weekTotal  = week.reduce((s, d) => s + (dayMap.get(d)?.totalCal ?? 0), 0);
  const daysLogged = week.filter(d => (dayMap.get(d)?.totalCal ?? 0) > 0).length;

  return (
    <div style={{
      background: SURF, borderRadius: 8, padding: '18px 16px 14px',
      border: `1px solid ${EDGE}`, marginBottom: 16, boxShadow: CARD_SHADOW,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>
          This Week
        </div>
        {weekTotal > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -1.2, color: TEXT, lineHeight: 1 }}>
              {weekTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>
              kcal · {daysLogged} day{daysLogged !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        {/* Goal dashed line */}
        <div style={{
          position: 'absolute',
          top: CHART_H - (goalCal / maxCal) * CHART_H,
          left: 0, right: 0, height: 1,
          borderTop: '1.5px dashed var(--accent)',
          zIndex: 1, pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: CHART_H, position: 'relative', zIndex: 2 }}>
          {week.map((date) => {
            const ds    = dayMap.get(date);
            const cal   = ds?.totalCal ?? 0;
            const barH  = cal > 0 ? Math.max((cal / maxCal) * CHART_H, 6) : 3;
            const pct   = goalCal > 0 ? (cal / goalCal) * 100 : 0;
            const isToday = date === todayStr;
            const color = pct >= 110 ? RED : pct >= 85 ? GREEN : pct > 0 ? YELLOW : 'rgba(255,255,255,0.10)';
            const dayLbl = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' }).toUpperCase();

            return (
              <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: CHART_H, justifyContent: 'flex-end' }}>
                  {cal > 0 && (
                    <div style={{ fontSize: 8, fontWeight: 700, color: isToday ? color : MUTED, marginBottom: 3, letterSpacing: 0.3 }}>
                      {cal >= 1000 ? `${(cal / 1000).toFixed(1)}k` : cal}
                    </div>
                  )}
                  <div style={{
                    width: '100%', height: barH,
                    background: `linear-gradient(180deg, ${color}88 0%, ${color} 100%)`,
                    borderRadius: '5px 5px 3px 3px',
                    boxShadow: isToday ? `0 0 14px ${color}55, 0 2px 6px ${color}30` : `0 1px 4px ${color}20`,
                    opacity: isToday ? 1 : 0.78,
                    transition: 'height 0.6s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>
                <div style={{
                  fontSize: 8, fontWeight: isToday ? 800 : 600,
                  color: isToday ? ORANGE : MUTED, marginTop: 7, letterSpacing: 0.5,
                }}>
                  {isToday ? 'TODAY' : dayLbl}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <div style={{ width: 16, height: 0, borderTop: '2px dashed var(--accent)' }} />
        <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>
          Goal {goalCal.toLocaleString()} kcal
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {[[GREEN, '85–110%'], [RED, '110%+']].map(([c, lbl]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: c }} />
              <div style={{ fontSize: 8, color: MUTED, fontWeight: 700 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── STATS ROW ─────────────────────────────────────────────────────
function StatsRow({ streak, totalDays, avgCal, goalCal }: { streak: number; totalDays: number; avgCal: number; goalCal: number }) {
  const goalPct = goalCal > 0 ? Math.round((avgCal / goalCal) * 100) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
      {[
        { label: 'Day Streak',  value: streak,   unit: streak === 1 ? 'day' : 'days', color: streak >= 7 ? ORANGE : streak >= 3 ? GREEN : ORANGE, colorHex: streak >= 7 ? ORANGE_HEX : streak >= 3 ? GREEN : ORANGE_HEX, highlight: streak >= 3 },
        { label: 'Days Logged', value: totalDays, unit: 'total',      color: YELLOW, colorHex: YELLOW, highlight: false },
        { label: 'Avg Daily',   value: goalPct,   unit: '% of goal',  color: goalPct >= 85 && goalPct <= 115 ? GREEN : goalPct > 115 ? RED : ORANGE, colorHex: goalPct >= 85 && goalPct <= 115 ? GREEN : goalPct > 115 ? RED : ORANGE_HEX, highlight: goalPct >= 85 && goalPct <= 115 },
      ].map(({ label, value, unit, color, colorHex, highlight }) => (
        <div key={label} style={{
          background: highlight ? `${colorHex}12` : SURF,
          borderRadius: 8, padding: '14px 12px',
          border: `1px solid ${highlight ? colorHex + '30' : EDGE}`,
          borderTop: `3px solid ${color}`,
          boxShadow: highlight ? `0 4px 16px ${colorHex}18` : CARD_SHADOW,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: color, textTransform: 'uppercase', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -2, color: color, lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, marginTop: 3 }}>
            {unit}
          </div>
        </div>
      ))}
    </div>
  );
}

function MacroChip({ label, value, color, pct }: { label: string; value: number; color: string; pct: number }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: `${color}08`, borderRadius: 10, padding: '6px 10px', minWidth: 56,
      border: `1px solid ${color}15`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 900, color, letterSpacing: -0.5 }}>{value}g</div>
      <div style={{ fontSize: 8, fontWeight: 700, color, marginTop: 1 }}>{pct}%</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: MUTED, textTransform: 'uppercase', marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ── Body Composition Estimator ─────────────────────────────────────────
function BodyCompositionCard({ weightEntries, days }: { weightEntries: WeightEntry[]; days: DaySummary[] }) {
  if (weightEntries.length < 2) return null;

  const first = weightEntries[0];
  const last  = weightEntries[weightEntries.length - 1];
  const wDiff = parseFloat((last.weightKg - first.weightKg).toFixed(1));

  // Estimate caloric surplus/deficit from food logs
  // If we have no target data, skip body comp
  const avgCal = days.length > 0 ? days.reduce((s, d) => s + d.totalCal, 0) / days.length : 0;

  // 3500 kcal ≈ 1 lb fat ≈ 0.45 kg fat (rough heuristic)
  const daysBetween = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000);
  const wDiffSign = wDiff > 0 ? '+' : '';

  // Simple body comp estimate: assume ~75% of weight change is fat, 25% is muscle/water on surplus
  // On deficit: ~85% fat, 15% lean mass (varies enormously but gives a number to work with)
  const isSurplus = wDiff >= 0;
  const fatPct    = isSurplus ? 0.75 : 0.85;
  const leanPct   = 1 - fatPct;
  const fatKg     = parseFloat((Math.abs(wDiff) * fatPct * (isSurplus ? 1 : -1)).toFixed(1));
  const leanKg    = parseFloat((Math.abs(wDiff) * leanPct * (isSurplus ? 1 : -1)).toFixed(1));

  const cardColor = wDiff > 0 ? ORANGE_HEX : wDiff < 0 ? GREEN : 'var(--muted)';

  return (
    <div style={{
      background: SURF, borderRadius: 12, border: `1px solid ${EDGE}`, padding: '16px 16px', marginBottom: 14,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>
        Body Composition Estimate
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, background: SURF2, borderRadius: 10, padding: '12px 12px', border: `1px solid ${EDGE}` }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: cardColor, letterSpacing: -1 }}>
            {wDiffSign}{wDiff} <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>kg</span>
          </div>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginTop: 3 }}>Total weight change</div>
          <div style={{ fontSize: 9, color: MUTED, opacity: 0.6, marginTop: 2 }}>
            over {Math.round(daysBetween)} days
          </div>
        </div>
        <div style={{ flex: 1, background: SURF2, borderRadius: 10, padding: '12px 12px', border: `1px solid ${EDGE}` }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: fatKg < 0 ? GREEN : ORANGE_HEX, letterSpacing: -1 }}>
            {fatKg > 0 ? '+' : ''}{fatKg} <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>kg</span>
          </div>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginTop: 3 }}>Est. fat mass</div>
          <div style={{ fontSize: 9, color: MUTED, opacity: 0.6, marginTop: 2 }}>~{Math.round(fatPct * 100)}% of Δ</div>
        </div>
        <div style={{ flex: 1, background: SURF2, borderRadius: 10, padding: '12px 12px', border: `1px solid ${EDGE}` }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: leanKg > 0 ? PROT : MUTED, letterSpacing: -1 }}>
            {leanKg > 0 ? '+' : ''}{leanKg} <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>kg</span>
          </div>
          <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginTop: 3 }}>Est. lean mass</div>
          <div style={{ fontSize: 9, color: MUTED, opacity: 0.6, marginTop: 2 }}>~{Math.round(leanPct * 100)}% of Δ</div>
        </div>
      </div>
      {avgCal > 0 && (
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, padding: '8px 10px', background: SURF2, borderRadius: 8 }}>
          📊 Avg {Math.round(avgCal)} kcal/day over this period.
          {' '}{isSurplus ? 'Caloric surplus — body gained mass. High protein intake limits fat gain.' : 'Caloric deficit — body lost mass. Protein intake is key to preserving lean muscle.'}
        </div>
      )}
      <div style={{ fontSize: 9, color: MUTED, marginTop: 8, opacity: 0.5, lineHeight: 1.5 }}>
        ⚠ Estimates based on weight change only. Real composition requires DEXA or caliper measurement.
      </div>
    </div>
  );
}

// ── AI Coach Tab ─────────────────────────────────────────────────────────
import type { WeeklyLoad } from '@shared/types';
import type { MacroTargets } from '@shared/types';

function CoachTab({
  days, weightEntries, targets, streak, weeklyLoad,
  summary, loading, error, onGenerate,
}: {
  days: DaySummary[];
  weightEntries: WeightEntry[];
  targets: MacroTargets | null;
  streak: number;
  weeklyLoad: WeeklyLoad;
  summary: WeeklySummary | null;
  loading: boolean;
  error: string;
  onGenerate: () => void;
}) {
  const sectionStyle = (color: string): React.CSSProperties => ({
    background: SURF2, borderRadius: 10, padding: '14px 14px',
    border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`,
    marginBottom: 10,
  });

  return (
    <div>
      {/* Body Composition */}
      <BodyCompositionCard weightEntries={weightEntries} days={days} />

      {/* Weekly AI Summary */}
      <div style={{
        background: SURF, borderRadius: 12, border: `1px solid ${EDGE}`, padding: '16px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 3 }}>
              AI Coach
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>
              Weekly Debrief
            </div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 6,
            background: `${ORANGE_HEX}18`, border: `1px solid ${ORANGE_HEX}40`,
            fontSize: 10, fontWeight: 800, color: ORANGE_HEX,
          }}>
            {days.length}/7 days
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Streak', value: `${streak}d`, color: streak >= 7 ? ORANGE_HEX : streak >= 3 ? GREEN : MUTED },
            { label: 'Avg Cal', value: days.length > 0 ? `${Math.round(days.reduce((s, d) => s + d.totalCal, 0) / days.length)}` : '—', color: ORANGE_HEX },
            { label: 'Run km', value: `${(weeklyLoad?.totalRunKm ?? 0).toFixed(1)}`, color: GREEN },
            { label: 'Lifts', value: `${weeklyLoad?.totalStrengthSets ?? 0}`, color: PROT },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, background: SURF2, borderRadius: 8, padding: '8px 6px', border: `1px solid ${EDGE}`, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 900, color, letterSpacing: -0.5 }}>{value}</div>
              <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {days.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: MUTED, fontSize: 13, fontWeight: 700 }}>
            Log at least 1 day to generate a weekly debrief.
          </div>
        ) : summary ? (
          <div>
            <div style={sectionStyle(GREEN)}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                ✅ What went well
              </div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.well}</div>
            </div>
            <div style={sectionStyle(ORANGE_HEX)}>
              <div style={{ fontSize: 10, fontWeight: 800, color: ORANGE_HEX, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                ⚠️ What to watch
              </div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.watch}</div>
            </div>
            <div style={sectionStyle(PROT)}>
              <div style={{ fontSize: 10, fontWeight: 800, color: PROT, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
                🎯 This week's focus
              </div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.focus}</div>
            </div>
            <button
              onClick={onGenerate}
              style={{
                width: '100%', padding: '10px', marginTop: 4, borderRadius: 8,
                border: `1px solid ${EDGE}`, background: SURF2,
                color: MUTED, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >Regenerate</button>
          </div>
        ) : error ? (
          <div style={{ padding: '12px', borderRadius: 8, background: '#EF444415', border: '1px solid #EF444440', color: '#EF4444', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        {!summary && !loading && (
          <button
            onClick={onGenerate}
            disabled={days.length === 0}
            style={{
              width: '100%', padding: '14px', borderRadius: 10,
              border: 'none', background: days.length === 0 ? SURF2 : ORANGE_HEX,
              color: days.length === 0 ? MUTED : '#fff', fontSize: 14, fontWeight: 900,
              cursor: days.length === 0 ? 'default' : 'pointer', letterSpacing: 0.5,
            }}
          >
            Generate Weekly Debrief →
          </button>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${ORANGE_HEX}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: MUTED, fontWeight: 700 }}>Analysing your week…</div>
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = 'days' | 'foods' | 'coach';

export default function HistoryScreen() {
  const { targets } = useNutrition();
  const { units } = useThemeStore();
  const { weeklyLoad } = useNutritionStore();
  const [tab,          setTab]          = useState<Tab>('days');
  const [days,         setDays]         = useState<DaySummary[]>([]);
  const [allLogs,      setAllLogs]      = useState<FoodLog[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [relogged,     setRelogged]     = useState<string | null>(null);
  const [expandedFood, setExpandedFood] = useState<string | null>(null);
  const [reloggedIng,  setReloggedIng]  = useState<string | null>(null);
  const [foodSearch,   setFoodSearch]   = useState('');
  const relogRef = useRef<Set<string>>(new Set());
  // Coach tab
  const [coachSummary,    setCoachSummary]    = useState<WeeklySummary | null>(null);
  const [coachLoading,    setCoachLoading]    = useState(false);
  const [coachError,      setCoachError]      = useState('');

  // Supplement data: { date → { taken, total } }
  const [suppByDate,  setSuppByDate]  = useState<Map<string, { taken: number; total: number }>>(new Map());
  const [suppTotal,   setSuppTotal]   = useState(0);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      getAllLogs(),
      db.supplements.toArray().then(all => all.filter(s => s.active !== false).length),
      db.supplement_logs.toArray(),
      db.weight_logs.orderBy('date').toArray(),
    ])
      .then(([logs, total, suppLogs, wLogs]) => {
        const sorted = [...logs].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
        setAllLogs(sorted);
        setDays(groupByDate(logs));
        setSuppTotal(total);
        setWeightEntries(wLogs.map(w => ({ date: w.date, weightKg: w.weightKg })));
        const byDate = new Map<string, { taken: number; total: number }>();
        for (const l of suppLogs) {
          if (!byDate.has(l.date)) byDate.set(l.date, { taken: 0, total });
          if (l.taken) byDate.get(l.date)!.taken++;
        }
        setSuppByDate(byDate);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Full load on mount
  useEffect(() => { load(); }, [load]);

  // Silent refresh whenever the document becomes visible (app foregrounded or tab focused)
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) { clearPullCache(); loadRef.current(true); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const handleRelog = async (item: FoodLog) => {
    if (relogRef.current.has(item.id)) return;
    relogRef.current.add(item.id);
    setRelogged(item.id);
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (item.removed && item.logged_at.slice(0, 10) === today) {
        await unremoveLog(item.id);
      } else {
        await addLog({
          food_name: item.food_name, calories: item.calories,
          protein: item.protein, carbs: item.carbs, fat: item.fat,
          weight_grams: item.weight_grams ?? undefined,
          meal_type: item.meal_type, image_url: item.image_url ?? undefined,
          ingredients: item.ingredients ?? undefined,
          fiber_g: item.fiber_g, cholesterol_mg: item.cholesterol_mg,
          sodium_mg: item.sodium_mg, vitamin_c_mg: item.vitamin_c_mg,
          vitamin_d_mcg: item.vitamin_d_mcg, calcium_mg: item.calcium_mg,
          iron_mg: item.iron_mg,
        });
      }
      playFoodLogSound();
    } catch { /* silent */ }
    setTimeout(() => { relogRef.current.delete(item.id); setRelogged(null); }, 1500);
  };

  const handleRelogIngredient = async (ing: Ingredient, mealType: string, key: string) => {
    if (reloggedIng === key) return;
    setReloggedIng(key);
    try {
      await addLog({ food_name: ing.name, calories: ing.calories, protein: ing.protein, carbs: ing.carbs, fat: ing.fat, meal_type: mealType || 'snack' });
    } catch { /* silent */ }
    setTimeout(() => setReloggedIng(null), 1500);
  };

  const goalCal    = targets?.calories ?? 2000;
  const totalDays  = days.length;
  const streak     = calcStreak(days);
  const avgCal     = totalDays > 0 ? Math.round(days.reduce((s, d) => s + d.totalCal, 0) / totalDays) : 0;
  const foodDir    = buildFoodDirectory(allLogs);
  const filteredDir = foodSearch.trim()
    ? foodDir.filter((e) => e.name.toLowerCase().includes(foodSearch.toLowerCase()))
    : foodDir;

  return (
    <div style={{ minHeight: '100%', background: BG }}>

      {/* ── HEADER ── */}
      <div style={{
        background: 'var(--surf)',
        padding: '32px 16px 0', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid var(--edge)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: MUTED, marginBottom: 4, textTransform: 'uppercase' }}>
              My Way
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1.5, color: ORANGE }}>
              Your Journey
            </div>
          </div>
          {streak >= 2 && (
            <div style={{
              background: ORANGE_MUT, border: '1px solid var(--accent)',
              borderRadius: 8, padding: '4px 12px',
              fontSize: 11, fontWeight: 800, color: ORANGE,
            }}>
              {streak} day streak
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, fontWeight: 700 }}>
          {totalDays > 0
            ? tab === 'foods'
              ? `${foodDir.length} unique foods · ${allLogs.filter(l => !l.removed).length} total logs`
              : `${totalDays} days · avg ${avgCal.toLocaleString()} kcal`
            : 'Log food in the Fuel tab to build your history'}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${EDGE}` }}>
          {(['days', 'foods', 'coach'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase',
              color: tab === t ? ORANGE : MUTED,
              borderBottom: tab === t ? `3px solid ${ORANGE}` : '3px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}>
              {t === 'days' ? 'Days' : t === 'foods' ? 'Foods' : '🧠 Coach'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 16px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 56, color: MUTED }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Loading your history…</div>
          </div>
        ) : allLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ fontSize: 60, fontWeight: 900, letterSpacing: -4, color: 'rgba(255,255,255,0.08)', marginBottom: 16 }}>
              EMPTY
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
              No history yet
            </div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              Go to the Fuel tab and log your first meal — every great athlete starts somewhere.
            </div>
          </div>
        ) : tab === 'days' ? (
          <>
            {/* Weekly chart */}
            {days.length > 0 && <WeeklyChart days={days} goalCal={goalCal} />}

            {/* Weight trend chart */}
            {weightEntries.length >= 2 && <WeightChart entries={weightEntries} units={units} />}

            {/* Stats summary */}
            {totalDays > 0 && (
              <StatsRow streak={streak} totalDays={totalDays} avgCal={avgCal} goalCal={goalCal} />
            )}

            {/* 7-day macro averages */}
            {days.length > 0 && (
              <MacroAverages
                days={days}
                targets={targets ? { calories: targets.calories, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG } : null}
              />
            )}

            {/* Streak milestone */}
            {streak >= 3 && <StreakMilestone streak={streak} />}

            {/* Day cards */}
            {days.map((day) => {
              const isOpen      = expanded === day.date;
              const pct         = Math.min(100, Math.round((day.totalCal / goalCal) * 100));
              const barColor    = pct >= 110 ? RED : pct >= 85 ? GREEN : ORANGE;       // direct color prop
              const barColorHex = pct >= 110 ? RED : pct >= 85 ? GREEN : ORANGE_HEX;  // hex — for template-literal opacity suffixes
              const perf        = pct >= 85 && pct <= 110 ? 'ON TARGET' : pct > 110 ? 'OVER' : 'UNDER';
              const perfCol     = pct >= 85 && pct <= 110 ? GREEN : pct > 110 ? RED : ORANGE;

              return (
                <div key={day.date} className="card-lift" style={{
                  background: `linear-gradient(135deg, ${barColorHex}18 0%, var(--surf) 50%)`,
                  borderRadius: 8, border: `1px solid ${barColorHex}20`,
                  marginBottom: 12, overflow: 'hidden', boxShadow: CARD_SHADOW,
                  borderLeft: `3px solid ${barColor}`,
                }}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : day.date)}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '15px 16px 13px', textAlign: 'left' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, letterSpacing: -0.5 }}>
                          {day.label}
                        </div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                          {new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {(() => { const n = day.items.filter(i => !i.removed).length; return ` · ${n} item${n === 1 ? '' : 's'}`; })()}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: barColor, letterSpacing: -1.5, lineHeight: 1 }}>
                          {day.totalCal.toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 3 }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: perfCol, letterSpacing: 0.5 }}>{perf}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>{pct}%</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1, height: 6, background: SURF2, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}80, ${barColor})`,
                          borderRadius: 4, transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>
                        of {goalCal.toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {(() => {
                        const tot = day.totalProtein * 4 + day.totalCarbs * 4 + day.totalFat * 9 || 1;
                        const pP  = Math.round(day.totalProtein * 4 / tot * 100);
                        const cP  = Math.round(day.totalCarbs   * 4 / tot * 100);
                        const fP  = 100 - pP - cP;
                        return (
                          <>
                            <MacroChip label="Pro" value={day.totalProtein} color={PROT}   pct={pP} />
                            <MacroChip label="Crb" value={day.totalCarbs}   color={YELLOW}   pct={cP} />
                            <MacroChip label="Fat" value={day.totalFat}     color={FAT_CLR} pct={fP} />
                          </>
                        );
                      })()}
                      {/* Supplement badge */}
                      {suppTotal > 0 && (() => {
                        const sd = suppByDate.get(day.date);
                        const taken = sd?.taken ?? 0;
                        const allDone = taken === suppTotal;
                        return (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            background: `${allDone ? GREEN : MUTED}15`,
                            border: `1px solid ${allDone ? GREEN : MUTED}30`,
                            borderRadius: 8, padding: '4px 7px',
                          }}>
                            <span style={{ fontSize: 10 }}>💊</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: allDone ? GREEN : MUTED }}>
                              {taken}/{suppTotal}
                            </span>
                          </div>
                        );
                      })()}
                      <div style={{ marginLeft: 'auto', color: MUTED, fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.22s' }}>›</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${EDGE}`, background: 'transparent' }}>
                      {day.items.filter((i) => !i.removed).map((item, idx, arr) => {
                        const hasIngs    = item.ingredients && item.ingredients.length > 1;
                        const isFoodOpen = expandedFood === item.id;
                        return (
                          <div key={item.id} style={{ borderBottom: idx < arr.length - 1 ? `1px solid ${EDGE}` : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.food_name}
                                </div>
                                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                                  {MEAL_LABEL[item.meal_type] ?? item.meal_type}
                                  {item.weight_grams ? ` · ${item.weight_grams}g` : ''}
                                  {hasIngs ? ` · ${item.ingredients!.length} items` : ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 900, color: ORANGE, letterSpacing: -0.5 }}>
                                  {Math.round(Number(item.calories))}
                                </div>
                                <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                                  <span style={{ fontSize: 9, color: PROT,    fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                                  <span style={{ fontSize: 9, color: YELLOW,  fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                                  <span style={{ fontSize: 9, color: FAT_CLR, fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                                </div>
                              </div>
                              {hasIngs && (
                                <button onClick={() => setExpandedFood(isFoodOpen ? null : item.id)} style={{
                                  width: 26, height: 26, borderRadius: 8,
                                  border: `1px solid ${isFoodOpen ? 'var(--accent)' : EDGE}`,
                                  background: isFoodOpen ? ORANGE_MUT : SURF2,
                                  color: isFoodOpen ? ORANGE : MUTED,
                                  fontWeight: 700, fontSize: 10, cursor: 'pointer', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {isFoodOpen ? '▲' : '▼'}
                                </button>
                              )}
                              <button onClick={() => handleRelog(item)} disabled={relogged === item.id}
                                title="Add to today's fuel"
                                style={{
                                  width: 30, height: 30, borderRadius: 9,
                                  border: `1px solid ${relogged === item.id ? GREEN : EDGE}`,
                                  background: relogged === item.id ? `${GREEN}15` : SURF2,
                                  color: relogged === item.id ? GREEN : ORANGE,
                                  fontWeight: 900, fontSize: 15, cursor: relogged === item.id ? 'default' : 'pointer',
                                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all 0.2s',
                                }}>
                                {relogged === item.id ? '✓' : '+'}
                              </button>
                            </div>
                            {isFoodOpen && hasIngs && (
                              <div style={{ background: SURF2, borderTop: `1px solid ${EDGE}`, padding: '4px 0 6px' }}>
                                {item.ingredients!.map((ing, i) => {
                                  const ingKey = `${item.id}-${i}`;
                                  return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px 7px 28px', borderBottom: i < item.ingredients!.length - 1 ? `1px solid ${EDGE}` : 'none' }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                                        <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{ing.amount}</div>
                                      </div>
                                      <div style={{ fontSize: 12, fontWeight: 800, color: ORANGE, flexShrink: 0 }}>{Math.round(ing.calories)}</div>
                                      <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                                        <span style={{ fontSize: 9, color: PROT,    fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                                        <span style={{ fontSize: 9, color: YELLOW,  fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
                                        <span style={{ fontSize: 9, color: FAT_CLR, fontWeight: 700 }}>F{Math.round(ing.fat)}</span>
                                      </div>
                                      <button onClick={() => handleRelogIngredient(ing, item.meal_type, ingKey)}
                                        disabled={reloggedIng === ingKey}
                                        style={{
                                          width: 26, height: 26, borderRadius: 8,
                                          border: `1px solid ${reloggedIng === ingKey ? GREEN : EDGE}`,
                                          background: reloggedIng === ingKey ? `${GREEN}15` : SURF,
                                          color: reloggedIng === ingKey ? GREEN : ORANGE,
                                          fontWeight: 900, fontSize: 13, cursor: reloggedIng === ingKey ? 'default' : 'pointer',
                                          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                        {reloggedIng === ingKey ? '✓' : '+'}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : tab === 'coach' ? (
          /* ── COACH TAB — AI weekly summary + body composition ── */
          <CoachTab
            days={days}
            weightEntries={weightEntries}
            targets={targets}
            streak={streak}
            weeklyLoad={weeklyLoad}
            summary={coachSummary}
            loading={coachLoading}
            error={coachError}
            onGenerate={async () => {
              if (days.length === 0) return;
              setCoachLoading(true); setCoachError(''); setCoachSummary(null);
              try {
                const avgCals  = Math.round(days.reduce((s, d) => s + d.totalCal, 0) / days.length);
                const avgProt  = Math.round(days.reduce((s, d) => s + d.totalProtein, 0) / days.length);
                const avgCarb  = Math.round(days.reduce((s, d) => s + d.totalCarbs, 0) / days.length);
                const avgFat   = Math.round(days.reduce((s, d) => s + d.totalFat, 0) / days.length);
                // Build training types from weeklyLoad sessions
                const typeSet = new Set<string>();
                (weeklyLoad?.strengthSessions ?? []).forEach(ss => typeSet.add(ss.label ?? 'Strength'));
                if ((weeklyLoad?.totalRunKm ?? 0) > 0) typeSet.add('Cardio');
                const types = typeSet.size > 0 ? [...typeSet] : ['mixed'];
                const s = await getWeeklySummary({
                  days: days.length, avgCalories: avgCals, avgProtein: avgProt,
                  avgCarbs: avgCarb, avgFat: avgFat,
                  targetCalories: targets?.calories ?? 2200,
                  targetProtein: targets?.proteinG ?? 170,
                  trainingTypes: types,
                  totalRunKm: weeklyLoad?.totalRunKm ?? 0,
                  totalStrengthSessions: weeklyLoad?.totalStrengthSets ?? 0,
                  streak,
                });
                setCoachSummary(s);
              } catch (e: unknown) { setCoachError(e instanceof Error ? e.message : 'AI request failed'); }
              finally { setCoachLoading(false); }
            }}
          />
        ) : (
          /* ── FOODS TAB — deduplicated food directory ── */
          <>
            {/* Search bar */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <input
                value={foodSearch}
                onChange={(e) => setFoodSearch(e.target.value)}
                placeholder={`Search ${foodDir.length} foods…`}
                style={{
                  width: '100%', background: SURF, border: `1px solid ${EDGE}`,
                  borderRadius: 8, color: TEXT, fontSize: 14, fontWeight: 600,
                  padding: '12px 40px 12px 16px', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              {foodSearch ? (
                <button onClick={() => setFoodSearch('')} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer',
                }}>×</button>
              ) : (
                <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: MUTED }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
                </div>
              )}
            </div>

            {filteredDir.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 24px', color: MUTED }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 6 }}>
                  {foodSearch ? 'No foods match your search' : 'No foods logged yet'}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  {foodSearch ? 'Try a different name' : 'Log meals in the Fuel tab to build your food library'}
                </div>
              </div>
            ) : (
              <div style={{ background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
                {filteredDir.map((entry, idx) => {
                  const logDate = entry.lastLogged.slice(0, 10);
                  const timeStr = new Date(entry.lastLogged).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  const logId   = entry.latestLog.id;
                  const hasIngs = entry.latestLog.ingredients && entry.latestLog.ingredients.length > 1;
                  const isFoodOpen = expandedFood === logId;
                  return (
                    <div key={entry.name} style={{ borderTop: idx === 0 ? 'none' : `1px solid ${EDGE}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.name}
                            </div>
                            {entry.count > 1 && (
                              <div style={{
                                fontSize: 9, fontWeight: 800, color: ORANGE,
                                background: ORANGE_MUT, border: '1px solid var(--accent)',
                                borderRadius: 10, padding: '2px 7px', flexShrink: 0, letterSpacing: 0.3,
                              }}>
                                ×{entry.count}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                            Last: {dateLabel(logDate)} {timeStr}
                            {entry.latestLog.weight_grams ? ` · ${entry.latestLog.weight_grams}g` : ''}
                            {hasIngs ? ` · ${entry.latestLog.ingredients!.length} items` : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                            <span style={{ fontSize: 9, color: PROT,    fontWeight: 700, background: `${PROT}10`,   borderRadius: 5, padding: '1px 5px' }}>P{entry.protein}g</span>
                            <span style={{ fontSize: 9, color: YELLOW,  fontWeight: 700, background: `${YELLOW}10`,  borderRadius: 5, padding: '1px 5px' }}>C{entry.carbs}g</span>
                            <span style={{ fontSize: 9, color: FAT_CLR, fontWeight: 700, background: `${FAT_CLR}10`, borderRadius: 5, padding: '1px 5px' }}>F{entry.fat}g</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: ORANGE, letterSpacing: -1.5, lineHeight: 1 }}>
                            {entry.calories}
                          </div>
                          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 2 }}>kcal</div>
                        </div>
                        {hasIngs && (
                          <button onClick={() => setExpandedFood(isFoodOpen ? null : logId)} style={{
                            width: 28, height: 28, borderRadius: 8,
                            border: `1px solid ${isFoodOpen ? 'var(--accent)' : EDGE}`,
                            background: isFoodOpen ? ORANGE_MUT : SURF2,
                            color: isFoodOpen ? ORANGE : MUTED,
                            fontWeight: 700, fontSize: 11, cursor: 'pointer', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isFoodOpen ? '▲' : '▼'}
                          </button>
                        )}
                        <button onClick={() => handleRelog(entry.latestLog)} disabled={relogged === logId}
                          title="Add to today's fuel"
                          style={{
                            width: 32, height: 32, borderRadius: 10,
                            border: `1px solid ${relogged === logId ? GREEN : 'var(--accent)'}`,
                            background: relogged === logId ? `${GREEN}15` : ORANGE_MUT,
                            color: relogged === logId ? GREEN : ORANGE,
                            fontWeight: 900, fontSize: 16, cursor: relogged === logId ? 'default' : 'pointer',
                            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                          }}>
                          {relogged === logId ? '✓' : '+'}
                        </button>
                      </div>

                      {isFoodOpen && hasIngs && (
                        <div style={{ borderTop: `1px solid ${EDGE}`, background: SURF2, padding: '4px 0 6px' }}>
                          {entry.latestLog.ingredients!.map((ing, i) => {
                            const ingKey = `dir-${logId}-${i}`;
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px 7px 24px', borderBottom: i < entry.latestLog.ingredients!.length - 1 ? `1px solid ${EDGE}` : 'none' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{ing.amount}</div>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, flexShrink: 0 }}>{Math.round(ing.calories)}</div>
                                <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                                  <span style={{ fontSize: 9, color: PROT,    fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                                  <span style={{ fontSize: 9, color: YELLOW,  fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
                                  <span style={{ fontSize: 9, color: FAT_CLR, fontWeight: 700 }}>F{Math.round(ing.fat)}</span>
                                </div>
                                <button onClick={() => handleRelogIngredient(ing, entry.latestLog.meal_type, ingKey)}
                                  disabled={reloggedIng === ingKey}
                                  style={{
                                    width: 26, height: 26, borderRadius: 8,
                                    border: `1px solid ${reloggedIng === ingKey ? GREEN : EDGE}`,
                                    background: reloggedIng === ingKey ? `${GREEN}15` : SURF,
                                    color: reloggedIng === ingKey ? GREEN : ORANGE,
                                    fontWeight: 900, fontSize: 13, cursor: reloggedIng === ingKey ? 'default' : 'pointer',
                                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                  {reloggedIng === ingKey ? '✓' : '+'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
