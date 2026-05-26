import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllLogs, addLog, unremoveLog, clearPullCache, type FoodLog, type Ingredient } from '../api/localFood';
import { playFoodLogSound } from '../utils/sounds';
import { useNutrition } from '../hooks/useNutrition';
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

type Tab = 'days' | 'foods';

export default function HistoryScreen() {
  const { targets } = useNutrition();
  const [tab,          setTab]          = useState<Tab>('days');
  const [days,         setDays]         = useState<DaySummary[]>([]);
  const [allLogs,      setAllLogs]      = useState<FoodLog[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [relogged,     setRelogged]     = useState<string | null>(null);
  const [expandedFood, setExpandedFood] = useState<string | null>(null);
  const [reloggedIng,  setReloggedIng]  = useState<string | null>(null);
  const [foodSearch,   setFoodSearch]   = useState('');
  const relogRef = useRef<Set<string>>(new Set());

  // Supplement data: { date → { taken, total } }
  const [suppByDate,  setSuppByDate]  = useState<Map<string, { taken: number; total: number }>>(new Map());
  const [suppTotal,   setSuppTotal]   = useState(0);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      getAllLogs(),
      db.supplements.toArray().then(all => all.filter(s => s.active !== false).length),
      db.supplement_logs.toArray(),
    ])
      .then(([logs, total, suppLogs]) => {
        const sorted = [...logs].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
        setAllLogs(sorted);
        setDays(groupByDate(logs));
        setSuppTotal(total);
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
          {(['days', 'foods'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase',
              color: tab === t ? ORANGE : MUTED,
              borderBottom: tab === t ? `3px solid ${ORANGE}` : '3px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}>
              {t === 'days' ? 'Days' : 'Foods'}
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

            {/* Stats summary */}
            {totalDays > 0 && (
              <StatsRow streak={streak} totalDays={totalDays} avgCal={avgCal} goalCal={goalCal} />
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
