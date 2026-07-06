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
const GREEN      = '#4ADE80';   // emerald — carbs
const ORANGE     = 'var(--accent)';  // CSS var — use only for direct color props, NOT hex-suffix template literals
const ORANGE_HEX = '#9D7EFF';        // violet accent hex — for template literal opacity suffix
const ORANGE_MUT = 'var(--accent-muted)';
const YELLOW     = '#4ADE80';   // carbs (alias)
const PROT    = '#38BDF8';   // sky blue — protein
const RED     = '#EF4444';
const FAT_CLR = '#FBBF24';   // amber — fat

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
    { min: 30, label: 'Elite athlete', color: '#C8A200', msg: '1 full month of consistency. You are in rare company.' },
    { min: 14, label: 'Committed',     color: GREEN,     msg: '2 weeks straight. Fuel tracking is becoming your identity.' },
    { min: 7,  label: 'On fire',       color: ORANGE_HEX, msg: '7 day streak — a perfect week of fuel tracking.' },
    { min: 3,  label: 'Building',      color: YELLOW,     msg: '3 day streak — momentum is everything. Keep going.' },
  ];
  const m = milestones.find((x) => streak >= x.min)!;
  return (
    <div className="milestone-in" style={{
      background: SURF,
      borderRadius: 16, padding: '18px 20px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, background: `${m.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: m.color, letterSpacing: -1 }}>{streak}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: m.color, marginBottom: 3 }}>
          {streak}-day streak · {m.label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, lineHeight: 1.4 }}>
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
  const W = 320, H = 110, PAD = 14;
  const xs = sorted.map((_, i) => PAD + (i / (sorted.length - 1)) * (W - PAD * 2));
  const ys = vals.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2));
  const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const fillPath = `M${xs[0]},${H} ` + xs.map((x, i) => `L${x},${ys[i]}`).join(' ') + ` L${xs[xs.length-1]},${H} Z`;
  const latest   = vals[vals.length - 1];
  const first    = vals[0];
  const delta    = latest - first;
  const unitLabel = units === 'imperial' ? 'lb' : 'kg';

  const trendColor = delta <= 0 ? GREEN : RED;

  return (
    <div style={{ background: SURF, borderRadius: 20, padding: '18px 16px 14px', marginBottom: 16, border: `1px solid ${EDGE}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>Weight Trend</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: TEXT, letterSpacing: -1.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {latest.toFixed(1)}
            </span>
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>{unitLabel}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: trendColor, letterSpacing: -0.8, textShadow: `0 0 12px ${trendColor}50` }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unitLabel}
          </div>
          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 2 }}>
            vs {sorted.length} days ago
          </div>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORANGE_HEX} stopOpacity="0.35" />
            <stop offset="100%" stopColor={ORANGE_HEX} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#wg)" />
        <polyline points={polyline} fill="none" stroke={ORANGE_HEX} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${ORANGE_HEX}80)` }} />
        {/* All dots */}
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={i === xs.length - 1 ? 5 : 3}
            fill={i === xs.length - 1 ? ORANGE_HEX : SURF}
            stroke={ORANGE_HEX} strokeWidth={i === xs.length - 1 ? 0 : 1.5}
            style={{ filter: i === xs.length - 1 ? `drop-shadow(0 0 6px ${ORANGE_HEX})` : 'none' }}
          />
        ))}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>{sorted[0].date}</span>
        <span style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>{sorted[sorted.length-1].date}</span>
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
    <div style={{ background: SURF, borderRadius: 20, padding: '18px 16px', marginBottom: 16, border: `1px solid ${EDGE}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: MUTED, marginBottom: 16 }}>
        7-Day Averages · {logged.length} days
      </div>
      {macros.map(({ label, key, color, target }) => {
        const val = avg(key);
        const pct = target > 0 ? Math.min((val / target) * 100, 130) : 0;
        const over = val > target && target > 0;
        const c = over ? RED : color;
        return (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: c, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 10px ${c}40` }}>{val}g</span>
                {target > 0 && <span style={{ fontSize: 10, color: MUTED }}>/ {target}g</span>}
              </div>
            </div>
            <div style={{ height: 6, background: SURF2, borderRadius: 99, overflow: 'hidden' }}>
              <div className="bar-enter" style={{
                height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 99,
                background: `linear-gradient(90deg, ${c}, ${c}BB)`,
                boxShadow: `0 0 8px ${c}40`,
                transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
            {target > 0 && (
              <div style={{ fontSize: 10, color: over ? RED : c, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
                {Math.round(pct)}%{over ? ' over target' : ' of target'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── WEEKLY BAR CHART ──────────────────────────────────────────────
function WeeklyChart({ days, goalCal }: { days: DaySummary[]; goalCal: number }) {
  const [showPrev, setShowPrev] = useState(false);
  const [animated, setAnimated] = useState(false);
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  useEffect(() => { const id = setTimeout(() => setAnimated(true), 80); return () => clearTimeout(id); }, []);

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
  const prevWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });

  const dayMap      = new Map(days.map(d => [d.date, d]));
  const maxCal      = Math.max(goalCal * 1.25, ...week.map(d => dayMap.get(d)?.totalCal ?? 0), showPrev ? Math.max(...prevWeek.map(d => dayMap.get(d)?.totalCal ?? 0)) : 0, 1);
  const CHART_H     = 120;
  const weekTotal   = week.reduce((s, d) => s + (dayMap.get(d)?.totalCal ?? 0), 0);
  const daysLogged  = week.filter(d => (dayMap.get(d)?.totalCal ?? 0) > 0).length;
  const prevTotal   = prevWeek.reduce((s, d) => s + (dayMap.get(d)?.totalCal ?? 0), 0);
  const hasPrevData = prevTotal > 0;

  return (
    <div style={{ background: SURF, borderRadius: 20, padding: '20px 16px 16px', marginBottom: 16, border: `1px solid ${EDGE}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>This Week</div>
          {hasPrevData && (
            <button onClick={() => setShowPrev(v => !v)} style={{
              background: showPrev ? `${ORANGE_HEX}18` : 'none',
              border: `1px solid ${showPrev ? ORANGE_HEX + '40' : EDGE}`,
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: showPrev ? ORANGE : MUTED,
            }}>
              {showPrev ? '▲ Hide prev' : '▼ vs prev week'}
            </button>
          )}
        </div>
        {weekTotal > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1.5, color: TEXT, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {weekTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginTop: 3 }}>
              kcal · {daysLogged} day{daysLogged !== 1 ? 's' : ''}
              {showPrev && hasPrevData && (
                <span style={{ marginLeft: 8, color: weekTotal >= prevTotal ? GREEN : RED, fontWeight: 800 }}>
                  {weekTotal >= prevTotal ? '▲ ' : '▼ '}{Math.abs(weekTotal - prevTotal).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        {/* Goal dashed line */}
        {goalCal > 0 && (
          <div style={{
            position: 'absolute',
            top: CHART_H - (goalCal / maxCal) * CHART_H,
            left: 0, right: 0, height: 1,
            borderTop: `1.5px dashed ${ORANGE_HEX}80`,
            zIndex: 1, pointerEvents: 'none',
          }}>
            <span style={{ position: 'absolute', right: 0, top: -8, fontSize: 8, fontWeight: 700, color: ORANGE_HEX, background: SURF, paddingLeft: 4, opacity: 0.8 }}>
              GOAL
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: CHART_H, position: 'relative', zIndex: 2 }}>
          {week.map((date, idx) => {
            const ds    = dayMap.get(date);
            const cal   = ds?.totalCal ?? 0;
            const rawBarH = cal > 0 ? Math.max((cal / maxCal) * CHART_H, 8) : 4;
            const barH  = animated ? rawBarH : 0;
            const pct   = goalCal > 0 ? (cal / goalCal) * 100 : 0;
            const isToday = date === todayStr;
            const color = pct >= 110 ? RED : pct >= 85 ? GREEN : pct > 0 ? YELLOW : 'rgba(255,255,255,0.10)';
            const dayLbl = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' }).toUpperCase();
            const prevCal  = dayMap.get(prevWeek[idx])?.totalCal ?? 0;
            const prevBarH = showPrev && prevCal > 0 ? Math.max((prevCal / maxCal) * CHART_H, 3) : 0;

            return (
              <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: CHART_H, justifyContent: 'flex-end', position: 'relative' }}>
                  {prevBarH > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, width: '100%', height: prevBarH, background: `${MUTED2}35`, borderRadius: '5px 5px 3px 3px', border: `1px solid ${MUTED2}25` }} />
                  )}
                  {cal > 0 && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: isToday ? color : MUTED, marginBottom: 4, position: 'relative', zIndex: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2 }}>
                      {cal >= 1000 ? `${(cal / 1000).toFixed(1)}k` : cal}
                    </div>
                  )}
                  <div style={{
                    width: '100%', height: barH,
                    background: `linear-gradient(180deg, ${color}70 0%, ${color} 100%)`,
                    borderRadius: '6px 6px 4px 4px',
                    boxShadow: isToday
                      ? `0 0 18px ${color}60, 0 0 6px ${color}40, inset 0 1px 0 ${color}60`
                      : `0 2px 8px ${color}30`,
                    opacity: isToday ? 1 : cal > 0 ? 0.80 : 0.4,
                    transition: `height 0.65s cubic-bezier(0.4,0,0.2,1) ${idx * 50}ms`,
                    position: 'relative', zIndex: 1,
                  }} />
                </div>
                <div style={{
                  fontSize: isToday ? 9 : 8,
                  fontWeight: isToday ? 900 : 600,
                  color: isToday ? ORANGE_HEX : MUTED,
                  marginTop: 8, letterSpacing: 0.5,
                  textShadow: isToday ? `0 0 8px ${ORANGE_HEX}60` : 'none',
                }}>
                  {isToday ? 'Today' : dayLbl}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 16, height: 0, borderTop: `2px dashed ${ORANGE_HEX}80` }} />
        <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>Goal {goalCal.toLocaleString()} kcal</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {showPrev && hasPrevData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: MUTED2, opacity: 0.5 }} />
              <div style={{ fontSize: 8, color: MUTED, fontWeight: 700 }}>prev</div>
            </div>
          )}
          {[[GREEN, '85–110%'], [RED, '110%+']] .map(([c, lbl]) => (
            <div key={String(lbl)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: String(c) }} />
              <div style={{ fontSize: 8, color: MUTED, fontWeight: 700 }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── STATS ROW ─────────────────────────────────────────────────────
function StatsRow({ streak, totalDays, avgCal, goalCal, days }: { streak: number; totalDays: number; avgCal: number; goalCal: number; days: DaySummary[] }) {
  const goalPct = goalCal > 0 ? Math.round((avgCal / goalCal) * 100) : 0;

  // Goal hit streak: consecutive days ending today where calories were 85–110% of goal
  let goalStreak = 0;
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  for (const d of sorted) {
    const pct = goalCal > 0 ? d.totalCal / goalCal : 0;
    if (pct >= 0.85 && pct <= 1.10) goalStreak++;
    else break;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: EDGE, borderRadius: 20, overflow: 'hidden', marginBottom: 16 }}>
      {[
        { label: 'Streak',      value: streak,     unit: streak === 1 ? 'day' : 'days', color: streak >= 7 ? ORANGE_HEX : streak >= 3 ? GREEN : ORANGE_HEX, emoji: streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '📅' },
        { label: 'Goal streak', value: goalStreak, unit: goalStreak === 1 ? 'day' : 'days', color: goalStreak >= 5 ? '#FBBF24' : goalStreak >= 2 ? GREEN : MUTED, emoji: goalStreak >= 5 ? '🎯' : '✓' },
        { label: 'Days logged', value: totalDays,  unit: 'total',     color: PROT,       emoji: '📊' },
        { label: 'Avg daily',   value: goalPct,    unit: '% of goal', color: goalPct >= 85 && goalPct <= 115 ? GREEN : goalPct > 115 ? RED : ORANGE_HEX, emoji: goalPct >= 85 && goalPct <= 115 ? '✅' : '📈' },
      ].map(({ label, value, unit, color, emoji }) => (
        <div key={label} style={{
          padding: '16px 8px 14px', textAlign: 'center',
          background: `linear-gradient(180deg, ${color}08 0%, ${SURF} 60%)`,
        }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>{emoji}</div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -2, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 16px ${color}40` }}>
            {value}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.8 }}>
            {unit}
          </div>
          <div style={{ fontSize: 8, fontWeight: 600, color: MUTED, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
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
      background: SURF, borderRadius: 16, padding: '16px 16px', marginBottom: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
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

  const coachGoalCal = targets?.calories ?? 0;

  // Compute local insights from data
  const localInsights: { icon: string; text: string; color: string }[] = [];
  if (days.length >= 3) {
    const avgCal = days.reduce((s, d) => s + d.totalCal, 0) / days.length;
    const goalCal = coachGoalCal;
    if (goalCal > 0) {
      const pctOfGoal = Math.round((avgCal / goalCal) * 100);
      if (pctOfGoal >= 90 && pctOfGoal <= 110)
        localInsights.push({ icon: '✅', text: `Calorie accuracy: ${pctOfGoal}% of goal. Excellent consistency.`, color: GREEN });
      else if (pctOfGoal < 75)
        localInsights.push({ icon: '⚠️', text: `Averaging only ${pctOfGoal}% of calorie goal — you may be under-logging.`, color: ORANGE_HEX });
      else if (pctOfGoal > 120)
        localInsights.push({ icon: '⚠️', text: `Averaging ${pctOfGoal}% of goal — ${Math.round(avgCal - goalCal)} extra kcal/day over target.`, color: RED });
    }
    const protHits = days.filter(d => targets?.proteinG && d.totalProtein >= targets.proteinG * 0.9).length;
    const protRate = Math.round((protHits / days.length) * 100);
    if (protRate >= 80)
      localInsights.push({ icon: '💪', text: `Protein goal hit ${protRate}% of days — great muscle recovery support.`, color: PROT });
    else
      localInsights.push({ icon: '🥩', text: `Protein target only hit ${protRate}% of days — focus on adding a protein source to each meal.`, color: ORANGE_HEX });
    if (streak >= 7)
      localInsights.push({ icon: '🔥', text: `${streak}-day logging streak — consistency is your biggest asset.`, color: ORANGE_HEX });
    else if (streak >= 3)
      localInsights.push({ icon: '⚡', text: `${streak}-day streak — keep going to reach your next milestone!`, color: GREEN });
    const cals = days.map(d => d.totalCal);
    const mean = cals.reduce((s, c) => s + c, 0) / cals.length;
    const stdDev = Math.sqrt(cals.reduce((s, c) => s + (c - mean) ** 2, 0) / cals.length);
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
    if (cv < 8)
      localInsights.push({ icon: '📊', text: `Calorie variance is only ±${Math.round(stdDev)} kcal (CV ${cv.toFixed(0)}%) — elite consistency.`, color: GREEN });
    if (weightEntries.length >= 3) {
      const first = weightEntries[0].weightKg;
      const last  = weightEntries[weightEntries.length - 1].weightKg;
      const diff  = last - first;
      const weeks = Math.max(1, (new Date(weightEntries[weightEntries.length-1].date).getTime() - new Date(weightEntries[0].date).getTime()) / (7 * 86400000));
      const wkRate = diff / weeks;
      if (Math.abs(wkRate) > 0.05)
        localInsights.push({ icon: wkRate < 0 ? '⬇️' : '⬆️', text: `Weight trending ${wkRate < 0 ? 'down' : 'up'} at ${Math.abs(wkRate).toFixed(2)} kg/week over ${Math.round(weeks)} weeks.`, color: wkRate < 0 ? GREEN : ORANGE_HEX });
    }
  }

  return (
    <div>
      {/* Local pattern insights */}
      {localInsights.length > 0 && (
        <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
            Pattern Insights
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {localInsights.map((ins, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 11px', background: `${ins.color}0D`, borderRadius: 7, border: `1px solid ${ins.color}25` }}>
                <div style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{ins.icon}</div>
                <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>{ins.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body Composition */}
      <BodyCompositionCard weightEntries={weightEntries} days={days} />

      {/* Macro Cycling Efficiency */}
      {days.length >= 5 && (
        <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
            Macro Cycling Efficiency
          </div>
          {(() => {
            const history: Record<string, string> = (() => {
              try { return JSON.parse(localStorage.getItem('fs_training_type_history_v1') || '{}'); } catch { return {}; }
            })();
            const last7 = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(); d.setDate(d.getDate() - i);
              return d.toISOString().split('T')[0];
            });
            const dayMap = new Map(days.map(d => [d.date, d]));
            const pairs = last7.map(date => ({ date, tt: history[date], day: dayMap.get(date) }))
              .filter(p => p.tt && p.day && p.day.totalCal > 0);

            if (pairs.length < 3) return <div style={{ fontSize: 11, color: MUTED }}>Log 3+ days with training types to see cycling efficiency.</div>;

            const IDEAL_PROT_PCT: Record<string, [number, number]> = {
              rest: [20, 30], strength: [30, 40], cardio: [18, 28], hiit: [25, 35], hybrid: [28, 38],
            };

            const results = pairs.map(p => {
              const day = p.day!;
              const energy = day.totalProtein * 4 + day.totalCarbs * 4 + day.totalFat * 9 || 1;
              const protPct = Math.round((day.totalProtein * 4 / energy) * 100);
              const range = IDEAL_PROT_PCT[p.tt!] ?? [25, 35];
              const aligned = protPct >= range[0] && protPct <= range[1];
              return { date: p.date, tt: p.tt, protPct, aligned, range };
            });

            const alignedCount = results.filter(r => r.aligned).length;
            const alignRate    = Math.round((alignedCount / results.length) * 100);
            const alignColor   = alignRate >= 70 ? GREEN : alignRate >= 40 ? FAT_CLR : RED;

            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: alignColor, letterSpacing: -1 }}>
                    {alignRate}% <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>aligned</span>
                  </div>
                  <div style={{ fontSize: 10, color: MUTED }}>{alignedCount}/{results.length} days macro-cycling matches training</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {results.slice(0, 5).map(r => (
                    <div key={r.date} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, fontSize: 9, color: MUTED, fontWeight: 600 }}>
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' })}
                      </div>
                      <div style={{
                        fontSize: 9, fontWeight: 700, color: r.aligned ? GREEN : RED,
                        background: `${r.aligned ? GREEN : RED}10`, border: `1px solid ${r.aligned ? GREEN : RED}30`,
                        borderRadius: 4, padding: '2px 6px', minWidth: 58, textAlign: 'center',
                      }}>
                        {r.tt?.charAt(0).toUpperCase() + (r.tt?.slice(1) ?? '')}
                      </div>
                      <div style={{ flex: 1, fontSize: 9, color: MUTED }}>Prot {r.protPct}% (target {r.range[0]}–{r.range[1]}%)</div>
                      <div style={{ fontSize: 12, color: r.aligned ? GREEN : RED, fontWeight: 900 }}>{r.aligned ? '✓' : '!'}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Average macros by training type */}
      {days.length >= 5 && (
        <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
            Avg Intake by Training Type
          </div>
          {(() => {
            const history: Record<string, string> = (() => {
              try { return JSON.parse(localStorage.getItem('fs_training_type_history_v1') || '{}'); } catch { return {}; }
            })();
            const groups: Record<string, { cals: number[]; prot: number[]; carb: number[]; fat: number[] }> = {};
            days.filter(d => d.totalCal > 0 && history[d.date]).forEach(d => {
              const t = history[d.date];
              if (!groups[t]) groups[t] = { cals: [], prot: [], carb: [], fat: [] };
              groups[t].cals.push(d.totalCal);
              groups[t].prot.push(d.totalProtein);
              groups[t].carb.push(d.totalCarbs);
              groups[t].fat.push(d.totalFat);
            });
            const types = Object.keys(groups);
            if (types.length < 2) return <div style={{ fontSize: 11, color: MUTED }}>Need 2+ different training types logged to compare.</div>;
            const TYPE_COLORS: Record<string, string> = { rest: FAT_CLR, strength: PROT, cardio: GREEN, hybrid: '#C084FC', hiit: RED };
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {types.map(t => {
                  const g = groups[t];
                  const n = g.cals.length;
                  const avgCal  = Math.round(g.cals.reduce((s,v)=>s+v,0)/n);
                  const avgProt = Math.round(g.prot.reduce((s,v)=>s+v,0)/n);
                  const avgCarb = Math.round(g.carb.reduce((s,v)=>s+v,0)/n);
                  const avgFat  = Math.round(g.fat.reduce((s,v)=>s+v,0)/n);
                  const color   = TYPE_COLORS[t] ?? PROT;
                  return (
                    <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: `${color}11`, border: `1px solid ${color}33` }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'capitalize' }}>{t} <span style={{ fontSize: 8, color: MUTED }}>×{n} days</span></div>
                        <div style={{ fontSize: 9, color: MUTED }}>{avgCal} kcal</div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
                        <span style={{ color: PROT }}><b>{avgProt}g</b> P</span>
                        <span style={{ color: GREEN }}><b>{avgCarb}g</b> C</span>
                        <span style={{ color: FAT_CLR }}><b>{avgFat}g</b> F</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Recent 7-day summary stats */}
      {days.length >= 7 && (
        <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
            Last 7 Days — Quick Stats
          </div>
          {(() => {
            const last7 = days.slice(0, 7).filter(d => d.totalCal > 0);
            if (last7.length < 3) return <div style={{ fontSize: 11, color: MUTED }}>Log more days to see stats.</div>;
            const avgCal  = Math.round(last7.reduce((s,d)=>s+d.totalCal,0)/last7.length);
            const avgProt = Math.round(last7.reduce((s,d)=>s+d.totalProtein,0)/last7.length);
            const maxProt = Math.max(...last7.map(d => d.totalProtein));
            const maxCal  = Math.max(...last7.map(d => d.totalCal));
            const minCal  = Math.min(...last7.map(d => d.totalCal));
            const calRange = maxCal - minCal;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Avg Calories', val: avgCal, color: ORANGE_HEX },
                  { label: 'Avg Protein', val: `${avgProt}g`, color: PROT },
                  { label: 'Best Protein', val: `${Math.round(maxProt)}g`, color: GREEN },
                  { label: 'Peak Day', val: maxCal, color: RED },
                  { label: 'Lowest Day', val: minCal, color: FAT_CLR },
                  { label: 'Cal Range', val: calRange, color: MUTED },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: item.color }}>{item.val}</div>
                    <div style={{ fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Macro Hit/Miss Scorecard */}
      {days.length >= 5 && coachGoalCal > 0 && (
        <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
            Last 7 Days — Macro Scorecard
          </div>
          {(() => {
            const last7 = days.slice(0, 7);
            const calGoal = coachGoalCal;
            const protGoal = targets ? targets.proteinG : 0;
            const items = [
              { l: 'Cal on target', count: last7.filter(d => d.totalCal >= calGoal * 0.85 && d.totalCal <= calGoal * 1.1).length, color: ORANGE_HEX },
              { l: 'Cal under', count: last7.filter(d => d.totalCal < calGoal * 0.85).length, color: FAT_CLR },
              { l: 'Cal over', count: last7.filter(d => d.totalCal > calGoal * 1.1).length, color: RED },
              { l: 'Protein hit', count: protGoal > 0 ? last7.filter(d => d.totalProtein >= protGoal * 0.9).length : 0, color: PROT },
            ];
            return (
              <div style={{ display: 'flex', gap: 8 }}>
                {items.map(({ l, count, color }) => (
                  <div key={l} style={{ flex: 1, textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color }}>{count}<span style={{ fontSize: 10, color: MUTED }}>/7</span></div>
                    <div style={{ fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Top 3 Action Items */}
      {days.length >= 5 && (
        <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
            Top Action Items
          </div>
          {(() => {
            const last7 = days.slice(0, 7);
            const avgCal = last7.reduce((s, d) => s + d.totalCal, 0) / last7.length;
            const avgProt = last7.reduce((s, d) => s + d.totalProtein, 0) / last7.length;
            const avgCarbs = last7.reduce((s, d) => s + d.totalCarbs, 0) / last7.length;
            const items: { icon: string; text: string; color: string }[] = [];
            if (coachGoalCal > 0 && avgCal < coachGoalCal * 0.8) items.push({ icon: '⚡', text: `Increase daily intake — avg ${Math.round(coachGoalCal - avgCal)} kcal below goal`, color: ORANGE_HEX });
            if (coachGoalCal > 0 && avgCal > coachGoalCal * 1.15) items.push({ icon: '⚠', text: `Reduce portion sizes — avg ${Math.round(avgCal - coachGoalCal)} kcal over goal`, color: RED });
            if (targets && avgProt < targets.proteinG * 0.85) items.push({ icon: '💪', text: `Boost protein — avg ${Math.round(targets.proteinG - avgProt)}g short of target`, color: PROT });
            if (avgCarbs < 100) items.push({ icon: '🌾', text: 'Low carb intake — add complex carbs for energy', color: GREEN });
            const variance = Math.sqrt(last7.reduce((s, d) => s + Math.pow(d.totalCal - avgCal, 2), 0) / last7.length);
            if (variance > 500) items.push({ icon: '📊', text: `High calorie variability (±${Math.round(variance)} kcal) — aim for consistency`, color: FAT_CLR });
            if (items.length === 0) items.push({ icon: '✅', text: 'Great week! Calories and protein on track. Keep it up.', color: GREEN });
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.slice(0, 3).map(({ icon, text, color }, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'var(--bg)', borderRadius: 7, borderLeft: `3px solid ${color}` }}>
                    <span style={{ fontSize: 14 }}>{icon}</span>
                    <span style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Weekly PR vs Previous Week */}
      {days.length >= 10 && (
        <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
            This Week vs Last Week
          </div>
          {(() => {
            const thisWeek = days.slice(0, 7).filter(d => d.totalCal > 0);
            const lastWeek = days.slice(7, 14).filter(d => d.totalCal > 0);
            if (thisWeek.length < 2 || lastWeek.length < 2) return <div style={{ fontSize: 10, color: MUTED }}>Need 14 days of data.</div>;
            const thisAvgCal = Math.round(thisWeek.reduce((s, d) => s + d.totalCal, 0) / thisWeek.length);
            const lastAvgCal = Math.round(lastWeek.reduce((s, d) => s + d.totalCal, 0) / lastWeek.length);
            const thisAvgProt = Math.round(thisWeek.reduce((s, d) => s + d.totalProtein, 0) / thisWeek.length);
            const lastAvgProt = Math.round(lastWeek.reduce((s, d) => s + d.totalProtein, 0) / lastWeek.length);
            const rows = [
              { l: 'Avg Calories', a: thisAvgCal, b: lastAvgCal, unit: 'kcal', higherBetter: false, goalVal: coachGoalCal },
              { l: 'Avg Protein', a: thisAvgProt, b: lastAvgProt, unit: 'g', higherBetter: true, goalVal: targets?.proteinG ?? 0 },
              { l: 'Days logged', a: thisWeek.length, b: lastWeek.length, unit: 'd', higherBetter: true, goalVal: 7 },
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.map(({ l, a, b, unit, higherBetter }) => {
                  const diff = a - b;
                  const improved = higherBetter ? diff > 0 : Math.abs(a - coachGoalCal) < Math.abs(b - coachGoalCal);
                  return (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 80, fontSize: 9, color: MUTED }}>{l}</div>
                      <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{a}{unit}</div>
                      <div style={{ fontSize: 10, color: improved ? GREEN : RED, fontWeight: 700 }}>
                        {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '='}{unit}
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: MUTED }}>{b}{unit}</div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: MUTED, paddingTop: 4 }}>
                  <span>This week</span><span>Last week</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Weekly AI Summary */}
      <div style={{
        background: SURF, borderRadius: 16, padding: '16px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 3 }}>
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
              <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 6 }}>
                ✅ What went well
              </div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.well}</div>
            </div>
            <div style={sectionStyle(ORANGE_HEX)}>
              <div style={{ fontSize: 12, fontWeight: 700, color: ORANGE_HEX, marginBottom: 6 }}>
                ⚠️ What to watch
              </div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>{summary.watch}</div>
            </div>
            <div style={sectionStyle(PROT)}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PROT, marginBottom: 6 }}>
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
          <div style={{ padding: '12px', borderRadius: 8, background: '#EF444415', border: '1px solid #EF444440', marginBottom: 12 }}>
            <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 8 }}>{error}</div>
            <button
              onClick={onGenerate}
              style={{
                padding: '7px 14px', borderRadius: 6, border: '1px solid #EF444440',
                background: '#EF444420', color: '#EF4444', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >Try again</button>
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


// ─── Supplement Adherence ────────────────────────────────────────────────────
interface SuppEntry { taken: number; total: number }
function SupplementAdherenceCard({ suppByDate, suppTotal }: { suppByDate: Map<string, SuppEntry>; suppTotal: number }) {
  if (suppTotal === 0 || suppByDate.size === 0) return null;
  const today = new Date();
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });
  const data = last7.map(date => {
    const e = suppByDate.get(date);
    return { date, taken: e?.taken ?? 0, total: suppTotal };
  });
  const overallPct = Math.round(data.reduce((s, d) => s + (d.total > 0 ? d.taken / d.total : 0), 0) / 7 * 100);
  const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' }).toUpperCase();

  return (
    <div style={{ background: SURF, borderRadius: 16, padding: '16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>
          Supplement Adherence
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, color: overallPct >= 80 ? GREEN : overallPct >= 50 ? ORANGE_HEX : RED }}>
          {overallPct}%
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 48, marginBottom: 8 }}>
        {data.map(({ date, taken, total }) => {
          const pct = total > 0 ? taken / total : 0;
          const h   = Math.max(pct * 48, pct > 0 ? 4 : 2);
          const c   = pct >= 1 ? GREEN : pct >= 0.5 ? ORANGE_HEX : pct > 0 ? RED : EDGE;
          return (
            <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', height: h, background: c, borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease' }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: date === today.toISOString().split('T')[0] ? ORANGE_HEX : MUTED }}>
                {dayLabel(date)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>7-day average</div>
        <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>
          {suppTotal} supplement{suppTotal !== 1 ? 's' : ''} tracked
        </div>
      </div>
    </div>
  );
}

// ─── Calorie Trend (surplus / deficit) ──────────────────────────────────────
function CalorieTrendChart({ days, goalCal }: { days: DaySummary[]; goalCal: number }) {
  const today = new Date();
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    return d.toISOString().split('T')[0];
  });
  const dayMap = new Map(days.map(d => [d.date, d]));
  const dataPoints = last30.map(date => {
    const ds = dayMap.get(date);
    return ds ? ds.totalCal - goalCal : null;
  });
  const hasData = dataPoints.some(v => v !== null);
  if (!hasData) return null;

  const maxAbs = Math.max(...dataPoints.filter(Boolean).map(v => Math.abs(v!)), goalCal * 0.5, 1);
  const CHART_H = 60;
  const zeroY   = CHART_H / 2;

  // Rolling 7-day deficit
  const logsWithData = dataPoints.filter(v => v !== null) as number[];
  const totalDeficit  = logsWithData.reduce((s, v) => s + v, 0);
  const avgDelta      = logsWithData.length > 0 ? Math.round(totalDeficit / logsWithData.length) : 0;

  return (
    <div style={{ background: SURF, borderRadius: 16, padding: '16px 16px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 2 }}>30-Day Calorie Balance</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: avgDelta <= 0 ? GREEN : RED }}>
            Avg {avgDelta <= 0 ? 'deficit' : 'surplus'}: {Math.abs(avgDelta).toLocaleString()} kcal/day
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: GREEN }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>Deficit</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: RED }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>Surplus</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', height: CHART_H }}>
        {/* Zero line */}
        <div style={{
          position: 'absolute', top: zeroY, left: 0, right: 0, height: 1,
          borderTop: '1px dashed var(--edge)', zIndex: 1, pointerEvents: 'none',
        }} />
        {/* 7-day rolling average line overlay */}
        {(() => {
          const avgLine = dataPoints.map((_, i) => {
            const win = dataPoints.slice(Math.max(0, i - 6), i + 1).filter(x => x !== null) as number[];
            return win.length >= 3 ? win.reduce((s, x) => s + x, 0) / win.length : null;
          });
          if (!avgLine.some(v => v !== null)) return null;
          const W = 290;
          const pts = avgLine.map((v, i) => {
            if (v === null) return null;
            const x = (i / (last30.length - 1)) * W;
            const y = CHART_H / 2 - (v / maxAbs) * (CHART_H / 2 - 2);
            return `${x},${Math.max(2, Math.min(CHART_H - 2, y))}`;
          });
          const segs: string[] = [];
          let cur: string[] = [];
          for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur.join(' ')); cur = []; } }
          if (cur.length) segs.push(cur.join(' '));
          return (
            <svg width="100%" viewBox={`0 0 ${W} ${CHART_H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}>
              {segs.map((seg, i) => (
                <polyline key={i} points={seg} fill="none" stroke={PROT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" strokeDasharray="3 2" />
              ))}
            </svg>
          );
        })()}
        {/* Bars */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', height: '100%', position: 'relative', zIndex: 2 }}>
          {last30.map((date, i) => {
            const delta = dataPoints[i];
            if (delta === null) {
              return <div key={date} style={{ flex: 1, height: 2, background: EDGE, borderRadius: 1, alignSelf: 'center' }} />;
            }
            const isToday = date === today.toISOString().split('T')[0];
            const pct    = Math.min(Math.abs(delta) / maxAbs, 1);
            const barH   = Math.max(pct * (CHART_H / 2 - 2), 2);
            const color  = delta <= 0 ? GREEN : RED;
            const isNeg  = delta <= 0;
            return (
              <div key={date} style={{ flex: 1, height: CHART_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {/* Surplus bar (above zero) */}
                <div style={{ height: CHART_H / 2 - 1, display: 'flex', alignItems: 'flex-end' }}>
                  {!isNeg ? (
                    <div style={{ width: '100%', height: barH, background: color, borderRadius: '2px 2px 0 0', opacity: isToday ? 1 : 0.8 }} />
                  ) : <div style={{ height: 0 }} />}
                </div>
                <div style={{ height: 1 }} />
                {/* Deficit bar (below zero) */}
                <div style={{ height: CHART_H / 2 - 1, display: 'flex', alignItems: 'flex-start' }}>
                  {isNeg ? (
                    <div style={{ width: '100%', height: barH, background: color, borderRadius: '0 0 2px 2px', opacity: isToday ? 1 : 0.8 }} />
                  ) : <div style={{ height: 0 }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: MUTED }}>30 days ago</div>
        <div style={{ fontSize: 8, fontWeight: 700, color: MUTED }}>Today</div>
      </div>

      {/* Net total */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${EDGE}`, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>Net 30-day balance</div>
        <div style={{ fontSize: 12, fontWeight: 900, color: totalDeficit <= 0 ? GREEN : RED }}>
          {totalDeficit <= 0 ? '−' : '+'}{Math.abs(Math.round(totalDeficit)).toLocaleString()} kcal
        </div>
      </div>
    </div>
  );
}

// ─── Meal Timing Analysis ────────────────────────────────────────────────────
function MealTimingCard({ logs }: { logs: FoodLog[] }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const hourBuckets = new Array(24).fill(0);
  const hourCals    = new Array(24).fill(0);
  for (const log of logs) {
    if (log.removed) continue;
    const h = new Date(log.logged_at).getHours();
    hourBuckets[h]++;
    hourCals[h] += Number(log.calories);
  }
  const maxCount = Math.max(...hourBuckets, 1);
  const totalLogs = hourBuckets.reduce((s, v) => s + v, 0);
  if (totalLogs === 0) return null;

  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const formatHour = (h: number) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;

  // Aggregate into time windows for summary
  const windows = [
    { label: 'Morning', range: [5,  11], icon: '🌅' },
    { label: 'Midday',  range: [11, 15], icon: '☀️' },
    { label: 'Evening', range: [15, 20], icon: '🌇' },
    { label: 'Night',   range: [20, 24], icon: '🌙' },
  ];
  const windowData = windows.map(w => {
    const count = HOURS.slice(w.range[0], w.range[1]).reduce((s, h) => s + hourBuckets[h], 0);
    const cals  = HOURS.slice(w.range[0], w.range[1]).reduce((s, h) => s + hourCals[h],  0);
    return { ...w, count, cals, pct: totalLogs > 0 ? Math.round((count / totalLogs) * 100) : 0 };
  });

  return (
    <div style={{ background: SURF, borderRadius: 16, padding: '16px 16px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 14 }}>
        Meal Timing
      </div>

      {/* Hourly bar chart */}
      <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 40, marginBottom: 4 }}>
        {HOURS.map((h) => {
          const count = hourBuckets[h];
          const barH  = count > 0 ? Math.max((count / maxCount) * 40, 3) : 1;
          const isPeak = h === peakHour && count > 0;
          const isBreakfast = h >= 5  && h < 11;
          const isLunch     = h >= 11 && h < 15;
          const isEvening   = h >= 15 && h < 20;
          const color = isPeak ? '#FBBF24' : isBreakfast ? '#38BDF8' : isLunch ? '#4ADE80' : isEvening ? ORANGE_HEX : '#8B5CF6';
          return (
            <div key={h} style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                width: '100%', height: barH,
                background: count > 0 ? color : EDGE,
                borderRadius: count > 0 ? '2px 2px 0 0' : 1,
                opacity: count > 0 ? 0.9 : 0.3,
              }} />
            </div>
          );
        })}
      </div>

      {/* X-axis: show 6h interval labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        {[0, 6, 12, 18, 23].map(h => (
          <div key={h} style={{ fontSize: 7, fontWeight: 700, color: MUTED }}>{formatHour(h)}</div>
        ))}
      </div>

      {/* Window summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {windowData.map(w => (
          <div key={w.label} style={{
            background: SURF2, borderRadius: 10, padding: '10px 12px',
            border: `1px solid ${EDGE}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 14 }}>{w.icon}</span>
              <div style={{ fontSize: 10, fontWeight: 800, color: TEXT }}>{w.label}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: w.count > 0 ? ORANGE_HEX : MUTED, letterSpacing: -1, lineHeight: 1 }}>
              {w.count}
            </div>
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>
              logs · {w.pct}%{w.cals > 0 ? ` · ${Math.round(w.cals).toLocaleString()} kcal` : ''}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: MUTED, fontWeight: 700, textAlign: 'center' }}>
        Peak time: <span style={{ color: '#FBBF24' }}>{formatHour(peakHour)}</span> ({hourBuckets[peakHour]} logs)
      </div>
    </div>
  );
}

// ─── Best / Worst days ───────────────────────────────────────────────────────
function BestWorstCard({ days, goalCal }: { days: DaySummary[]; goalCal: number }) {
  if (days.length < 3) return null;
  const scored = days.map(d => ({
    ...d,
    score: Math.abs(d.totalCal - goalCal) / goalCal,
  })).filter(d => d.totalCal > 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.score - b.score);
  const best  = scored[0];
  const worst = scored[scored.length - 1];
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div style={{ background: SURF, borderRadius: 16, padding: '16px', marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 12 }}>
        Best & Worst Days
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Best Day', entry: best,  color: GREEN,  icon: '🏆' },
          { label: 'Worst Day', entry: worst, color: RED,    icon: '📉' },
        ].map(({ label, entry, color, icon }) => (
          <div key={label} style={{ background: `${color}10`, borderRadius: 10, padding: '12px', border: `1px solid ${color}30` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <div style={{ fontSize: 11, fontWeight: 600, color }}>{label}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 4 }}>{fmtDate(entry.date)}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: -1, lineHeight: 1 }}>{entry.totalCal.toLocaleString()}</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, marginTop: 2 }}>
              kcal · {entry.score <= 0.05 ? 'Perfect' : `${Math.round(entry.score * 100)}% off goal`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function loadEnergyRatings(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('fs_energy_ratings_v1') ?? '{}'); } catch { return {}; }
}
const ENERGY_ICON: Record<string, string>  = { low: '😴', medium: '😊', high: '⚡' };
const ENERGY_COLOR: Record<string, string> = { low: '#6B7280', medium: '#FBBF24', high: '#4ADE80' };

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
      <div style={{ background: BG, padding: '32px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: -1 }}>
            Your journey
          </div>
          {streak >= 2 && (
            <div style={{
              background: ORANGE_MUT, borderRadius: 20, padding: '4px 12px',
              fontSize: 11, fontWeight: 700, color: ORANGE,
            }}>
              {streak} day streak
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>
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
              fontSize: 13, fontWeight: 600,
              color: tab === t ? ORANGE : MUTED,
              borderBottom: tab === t ? `2px solid ${ORANGE}` : '2px solid transparent',
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
              <StatsRow streak={streak} totalDays={totalDays} avgCal={avgCal} goalCal={goalCal} days={days} />
            )}

            {/* 7-day macro averages */}
            {days.length > 0 && (
              <MacroAverages
                days={days}
                targets={targets ? { calories: targets.calories, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG } : null}
              />
            )}


            {/* Calorie trend chart */}
            {days.length >= 3 && <CalorieTrendChart days={days} goalCal={goalCal} />}


            {/* Best/Worst days */}
            {days.length >= 3 && <BestWorstCard days={days} goalCal={goalCal} />}


            {/* Supplement adherence */}
            {suppTotal > 0 && <SupplementAdherenceCard suppByDate={suppByDate} suppTotal={suppTotal} />}

            {/* Meal timing */}
            {allLogs.length > 5 && <MealTimingCard logs={allLogs} />}

            {/* Streak milestone */}
            {streak >= 3 && <StreakMilestone streak={streak} />}

            {/* Day cards */}
            {(() => {
              const energyRatings = loadEnergyRatings();
              return days.map((day) => {
              const isOpen      = expanded === day.date;
              const pct         = Math.min(100, Math.round((day.totalCal / goalCal) * 100));
              const barColor    = pct >= 110 ? RED : pct >= 85 ? GREEN : ORANGE;       // direct color prop
              const barColorHex = pct >= 110 ? RED : pct >= 85 ? GREEN : ORANGE_HEX;  // hex — for template-literal opacity suffixes
              const perf        = pct >= 85 && pct <= 110 ? 'ON TARGET' : pct > 110 ? 'OVER' : 'UNDER';
              const perfCol     = pct >= 85 && pct <= 110 ? GREEN : pct > 110 ? RED : ORANGE;
              const energy      = energyRatings[day.date] as string | undefined;

              return (
                <div key={day.date} className="card-lift" style={{
                  background: SURF,
                  borderRadius: 16,
                  marginBottom: 10, overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : day.date)}
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '15px 16px 13px', textAlign: 'left' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, letterSpacing: -0.5 }}>
                            {day.label}
                          </div>
                          {energy && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              padding: '2px 7px', borderRadius: 20,
                              background: `${ENERGY_COLOR[energy]}20`,
                              border: `1px solid ${ENERGY_COLOR[energy]}40`,
                            }}>
                              <span style={{ fontSize: 11 }}>{ENERGY_ICON[energy]}</span>
                              <span style={{ fontSize: 8, fontWeight: 700, color: ENERGY_COLOR[energy], textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {energy}
                              </span>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 0 }}>
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
                      <div style={{ flex: 1, height: 4, background: SURF2, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, background: barColor,
                          borderRadius: 2, transition: 'width 0.5s ease',
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

                  {isOpen && (() => {
                    // Read diary note for this date
                    let diaryNote = '';
                    try { diaryNote = JSON.parse(localStorage.getItem('fs_diary_notes_v1') ?? '{}')[day.date] ?? ''; } catch {}
                    return (
                    <div style={{ borderTop: `1px solid ${EDGE}`, background: 'transparent' }}>
                      {diaryNote ? (
                        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${EDGE}`, background: `${ORANGE_HEX}06` }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: ORANGE, textTransform: 'uppercase', marginBottom: 4 }}>📝 Note</div>
                          <div style={{ fontSize: 12, color: TEXT, fontWeight: 600, lineHeight: 1.5 }}>{diaryNote}</div>
                        </div>
                      ) : null}
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
                    );
                  })()}
                </div>
              );
            });
            })()}
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
            {/* Caloric density insights */}
            {foodDir.length >= 3 && !foodSearch && (() => {
              const withWeight = foodDir.filter(f => f.latestLog.weight_grams && f.latestLog.weight_grams > 10 && f.calories > 0);
              if (withWeight.length < 2) return null;
              const withDensity = withWeight.map(f => ({
                name: f.name,
                density: Math.round((f.calories / (f.latestLog.weight_grams!)) * 100),
                protein: f.protein,
                calories: f.calories,
                grams: f.latestLog.weight_grams!,
              })).sort((a, b) => a.density - b.density);
              const lean = withDensity.slice(0, 3);
              const dense = withDensity.slice(-3).reverse();
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                    Caloric Density
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Low Density</div>
                      {lean.map(f => (
                        <div key={f.name} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 9, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{f.name}</span>
                            <span style={{ fontSize: 9, color: GREEN, fontWeight: 700, flexShrink: 0 }}>{f.density} kcal</span>
                          </div>
                          <div style={{ fontSize: 7, color: MUTED }}>per 100g</div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>High Density</div>
                      {dense.map(f => (
                        <div key={f.name} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 9, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{f.name}</span>
                            <span style={{ fontSize: 9, color: RED, fontWeight: 700, flexShrink: 0 }}>{f.density} kcal</span>
                          </div>
                          <div style={{ fontSize: 7, color: MUTED }}>per 100g</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Top foods by frequency */}
            {foodDir.length >= 3 && !foodSearch && (() => {
              const top5 = [...foodDir].sort((a, b) => b.count - a.count).slice(0, 5);
              const maxCount = top5[0]?.count ?? 1;
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: MUTED }}>Most Logged Foods</span>
                    <span style={{ fontSize: 9, color: MUTED }}>{foodDir.length} unique</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {top5.map((f, i) => {
                      const eff = f.calories > 0 ? Math.round((f.protein / f.calories) * 100 * 10) / 10 : 0;
                      return (
                        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: i === 0 ? ORANGE_HEX : MUTED, width: 14, textAlign: 'right', flexShrink: 0 }}>#{i+1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{f.name}</span>
                              <span style={{ fontSize: 9, color: MUTED, flexShrink: 0 }}>{f.count}×</span>
                            </div>
                            <div style={{ height: 4, background: EDGE, borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(f.count / maxCount) * 100}%`, background: i === 0 ? ORANGE_HEX : PROT, borderRadius: 2 }} />
                            </div>
                          </div>
                          {eff > 0 && <div style={{ fontSize: 8, color: eff >= 10 ? PROT : MUTED, flexShrink: 0, width: 32, textAlign: 'right', fontWeight: 700 }}>{eff}g/c</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Food Hall of Fame ── */}
            {foodDir.length >= 5 && (() => {
              const withEff = foodDir
                .filter(e => e.calories > 50 && e.protein > 3)
                .map(e => ({ ...e, eff: (e.protein / e.calories) * 100 }))
                .sort((a, b) => b.eff - a.eff)
                .slice(0, 5);
              if (withEff.length < 3) return null;
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                    Hall of Fame — Protein Efficiency
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {withEff.map((e, i) => {
                      const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
                      return (
                        <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: i === 0 ? `${GREEN}08` : SURF2, borderRadius: 7, border: `1px solid ${i === 0 ? GREEN + '30' : EDGE}` }}>
                          <div style={{ fontSize: 14, minWidth: 20, textAlign: 'center' }}>{medals[i]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                            <div style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>{e.calories} kcal · P{e.protein}g · logged {e.count}×</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 900, color: PROT, letterSpacing: -0.3 }}>{e.eff.toFixed(1)}</div>
                            <div style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>g P/100kcal</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Food Frequency Analysis ── */}
            {foodDir.length >= 3 && (() => {
              const frequent = [...foodDir].sort((a, b) => b.count - a.count).slice(0, 5);
              const totalLogs = allLogs.filter(l => !l.removed).length;
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                    Most Logged Foods
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {frequent.map(e => {
                      const pct = Math.round((e.count / totalLogs) * 100);
                      return (
                        <div key={e.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{e.name}</span>
                            <span style={{ fontSize: 10, color: ORANGE_HEX, fontWeight: 700, flexShrink: 0 }}>{e.count}× ({pct}%)</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: SURF2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (e.count / frequent[0].count) * 100)}%`, background: ORANGE_HEX, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Worst Foods for Goals ── */}
            {foodDir.length >= 5 && (() => {
              const withCal = foodDir.filter(e => e.calories > 200).sort((a, b) => b.calories - a.calories).slice(0, 5);
              if (withCal.length < 2) return null;
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                    Highest Calorie Foods
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {withCal.map((e, i) => (
                      <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: i === 0 ? `${RED}11` : 'transparent', border: `1px solid ${i === 0 ? RED + '30' : EDGE}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                          <div style={{ fontSize: 8, color: MUTED }}>P{e.protein}g · C{e.carbs}g · F{e.fat}g</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: RED }}>{e.calories}</div>
                          <div style={{ fontSize: 7, color: MUTED }}>kcal</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Best Low-Calorie High-Volume Foods ── */}
            {foodDir.length >= 5 && (() => {
              const highVolume = foodDir.filter(f => {
                const wt = f.latestLog.weight_grams;
                return wt && wt >= 150 && f.calories < 200;
              }).sort((a, b) => {
                const aWt = a.latestLog.weight_grams ?? 0;
                const bWt = b.latestLog.weight_grams ?? 0;
                return (a.calories / aWt) - (b.calories / bWt);
              }).slice(0, 4);
              if (highVolume.length < 2) return null;
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                    High-Volume Low-Cal Foods 🥦
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {highVolume.map(f => {
                      const wt = f.latestLog.weight_grams ?? 1;
                      const density = Math.round((f.calories / wt) * 100);
                      return (
                        <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: TEXT, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{f.name}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>{density} kcal/100g</span>
                            <span style={{ fontSize: 9, color: MUTED }}>{Math.round(wt)}g serving</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Most Consistent Foods */}
            {foodDir.length >= 5 && !foodSearch && (() => {
              const consistent = [...foodDir].sort((a, b) => b.count - a.count).slice(0, 5);
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                    Most Logged Foods
                  </div>
                  {consistent.map((f, i) => (
                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: EDGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: [ORANGE_HEX, PROT, GREEN, FAT_CLR, RED][i] ?? MUTED, flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 8, color: MUTED }}>{f.calories} kcal · {f.protein}g P · avg per serving</div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: MUTED }}>{f.count}×</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Best Protein-per-Calorie Foods */}
            {foodDir.length >= 5 && !foodSearch && (() => {
              const scored = foodDir
                .filter(f => f.calories > 50 && f.protein > 3)
                .map(f => ({ ...f, ratio: (f.protein / f.calories) * 100 }))
                .sort((a, b) => b.ratio - a.ratio)
                .slice(0, 5);
              if (scored.length < 3) return null;
              return (
                <div style={{ background: SURF, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
                    Best Protein-per-Calorie
                  </div>
                  {scored.map(f => (
                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          <div style={{ height: 5, flex: Math.round(f.ratio), background: PROT, borderRadius: 3 }} />
                          <div style={{ height: 5, flex: Math.max(1, 10 - Math.round(f.ratio)), background: EDGE, borderRadius: 3 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 9, color: PROT, fontWeight: 800, minWidth: 50 }}>{f.ratio.toFixed(1)}g/100kcal</div>
                    </div>
                  ))}
                </div>
              );
            })()}

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
              <div style={{ background: SURF, borderRadius: 16, overflow: 'hidden' }}>
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
