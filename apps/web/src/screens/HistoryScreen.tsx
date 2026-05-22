import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllLogs, addLog, unremoveLog, type FoodLog, type Ingredient } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';

const BG      = '#0A0A0A';
const SURF    = '#141414';
const SURF2   = '#1E1E1E';
const EDGE    = 'rgba(255,255,255,0.08)';
const TEXT    = '#F0F0F0';
const MUTED   = '#707070';
const MUTED2  = '#3A3A3A';
const ORANGE  = '#FF8000';
const YELLOW  = '#F5C518';
const GREEN   = '#22C55E';
const RED     = '#EF4444';
const BLUE    = '#FF8000';  // alias — orange in McLaren
const FAT_CLR = '#AAAAAA';
const CARD_SHADOW = '0 2px 16px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack', other: 'Other',
};

interface DaySummary {
  date: string; label: string;
  totalCal: number; totalProtein: number; totalCarbs: number; totalFat: number;
  items: FoodLog[];
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
    { min: 7,  label: 'ON FIRE',       color: ORANGE,    msg: '7 day streak — a perfect week of fuel tracking.' },
    { min: 3,  label: 'BUILDING',      color: YELLOW,     msg: '3 day streak — momentum is everything. Keep going.' },
  ];
  const m = milestones.find((x) => streak >= x.min)!;
  return (
    <div className="milestone-in" style={{
      background: `linear-gradient(135deg, ${m.color}18, ${m.color}06)`,
      border: `1px solid ${m.color}40`,
      borderRadius: 20, padding: '18px 20px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: `0 4px 24px ${m.color}18`,
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: `${m.color}20`, border: `2px solid ${m.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
      background: SURF, borderRadius: 20, padding: '18px 16px 14px',
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
          borderTop: `1.5px dashed ${ORANGE}60`,
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
        <div style={{ width: 16, height: 0, borderTop: `2px dashed ${ORANGE}70` }} />
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
        { label: 'Day Streak', value: streak, unit: streak === 1 ? 'day' : 'days', color: streak >= 7 ? ORANGE : streak >= 3 ? GREEN : ORANGE, highlight: streak >= 3 },
        { label: 'Days Logged', value: totalDays, unit: 'total', color: YELLOW, highlight: false },
        { label: 'Avg Daily', value: goalPct, unit: `% of goal`, color: goalPct >= 85 && goalPct <= 115 ? GREEN : goalPct > 115 ? RED : ORANGE, highlight: goalPct >= 85 && goalPct <= 115 },
      ].map(({ label, value, unit, color, highlight }) => (
        <div key={label} style={{
          background: highlight ? `${color}08` : SURF,
          borderRadius: 16, padding: '14px 12px',
          border: `1px solid ${highlight ? color + '25' : EDGE}`,
          borderTop: `3px solid ${color}`,
          boxShadow: highlight ? `0 4px 16px ${color}14` : CARD_SHADOW,
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
  const relogRef = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    getAllLogs()
      .then((logs) => {
        const sorted = [...logs].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
        setAllLogs(sorted);
        setDays(groupByDate(logs));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
        });
      }
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

  const goalCal   = targets?.calories ?? 2000;
  const totalDays = days.length;
  const streak    = calcStreak(days);
  const avgCal    = totalDays > 0 ? Math.round(days.reduce((s, d) => s + d.totalCal, 0) / totalDays) : 0;

  return (
    <div style={{ minHeight: '100%', background: BG }}>

      {/* ── HEADER ── */}
      <div style={{
        background: 'linear-gradient(180deg, #1A1A1A 0%, #0A0A0A 100%)',
        padding: '32px 16px 0', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: MUTED, marginBottom: 4, textTransform: 'uppercase' }}>
              History
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1.5, color: ORANGE }}>
              Your Journey
            </div>
          </div>
          {streak >= 2 && (
            <div style={{
              background: `${ORANGE}20`, border: `1px solid ${ORANGE}40`,
              borderRadius: 20, padding: '4px 12px',
              fontSize: 11, fontWeight: 800, color: ORANGE,
            }}>
              {streak} day streak
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, fontWeight: 700 }}>
          {totalDays > 0
            ? `${totalDays} days · ${allLogs.length} entries · avg ${avgCal.toLocaleString()} kcal`
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
              const isOpen   = expanded === day.date;
              const pct      = Math.min(100, Math.round((day.totalCal / goalCal) * 100));
              const barColor = pct >= 110 ? RED : pct >= 85 ? GREEN : ORANGE;
              const perf     = pct >= 85 && pct <= 110 ? 'ON TARGET' : pct > 110 ? 'OVER' : 'UNDER';
              const perfCol  = pct >= 85 && pct <= 110 ? GREEN : pct > 110 ? RED : ORANGE;

              return (
                <div key={day.date} className="card-lift" style={{
                  background: `linear-gradient(135deg, ${barColor}18 0%, ${SURF} 50%)`,
                  borderRadius: 20, border: `1px solid ${barColor}18`,
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
                          {' · '}{day.items.length} item{day.items.length === 1 ? '' : 's'}
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
                            <MacroChip label="Pro" value={day.totalProtein} color={BLUE}   pct={pP} />
                            <MacroChip label="Crb" value={day.totalCarbs}   color={YELLOW}   pct={cP} />
                            <MacroChip label="Fat" value={day.totalFat}     color={FAT_CLR} pct={fP} />
                          </>
                        );
                      })()}
                      <div style={{ marginLeft: 'auto', color: MUTED, fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.22s' }}>›</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${EDGE}`, background: `${ORANGE}02` }}>
                      {(() => {
                        // Suppress a removed entry when an active entry with the same name exists in the same day
                        const activeNames = new Set(day.items.filter((i) => !i.removed).map((i) => i.food_name.toLowerCase()));
                        return day.items.filter((item) => !item.removed || !activeNames.has(item.food_name.toLowerCase()));
                      })().map((item, idx, arr) => {
                        const isRemoved  = !!item.removed;
                        const hasIngs    = !isRemoved && item.ingredients && item.ingredients.length > 1;
                        const isFoodOpen = expandedFood === item.id;
                        return (
                          <div key={item.id} style={{ borderBottom: idx < arr.length - 1 ? `1px solid ${EDGE}` : 'none', opacity: isRemoved ? 0.55 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: isRemoved ? MUTED : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isRemoved ? 'line-through' : 'none' }}>
                                    {item.food_name}
                                  </div>
                                  {isRemoved && (
                                    <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.5, color: RED, background: `${RED}12`, border: `1px solid ${RED}25`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                                      REMOVED
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                                  {MEAL_LABEL[item.meal_type] ?? item.meal_type}
                                  {item.weight_grams ? ` · ${item.weight_grams}g` : ''}
                                  {hasIngs ? ` · ${item.ingredients!.length} items` : ''}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: 15, fontWeight: 900, color: isRemoved ? MUTED : ORANGE, letterSpacing: -0.5, textDecoration: isRemoved ? 'line-through' : 'none' }}>
                                  {Math.round(Number(item.calories))}
                                </div>
                                <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                                  <span style={{ fontSize: 9, color: BLUE,   fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                                  <span style={{ fontSize: 9, color: GREEN,  fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                                  <span style={{ fontSize: 9, color: FAT_CLR,fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                                </div>
                              </div>
                              {hasIngs && (
                                <button onClick={() => setExpandedFood(isFoodOpen ? null : item.id)} style={{
                                  width: 26, height: 26, borderRadius: 8,
                                  border: `1px solid ${isFoodOpen ? ORANGE : EDGE}`,
                                  background: isFoodOpen ? `${ORANGE}10` : SURF2,
                                  color: isFoodOpen ? ORANGE : MUTED,
                                  fontWeight: 700, fontSize: 10, cursor: 'pointer', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {isFoodOpen ? '▲' : '▼'}
                                </button>
                              )}
                              <button onClick={() => handleRelog(item)} disabled={relogged === item.id}
                                title={isRemoved ? 'Re-add to today' : "Add to today's fuel"}
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
                                        <span style={{ fontSize: 9, color: BLUE,   fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                                        <span style={{ fontSize: 9, color: GREEN,  fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
                                        <span style={{ fontSize: 9, color: FAT_CLR,fontWeight: 700 }}>F{Math.round(ing.fat)}</span>
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
          /* ── FOODS TAB ── */
          <div style={{ background: SURF, borderRadius: 20, border: `1px solid ${EDGE}`, overflow: 'hidden', boxShadow: CARD_SHADOW }}>
            {allLogs.map((item, idx) => {
              const isRemoved  = !!item.removed;
              const logDate    = item.logged_at.slice(0, 10);
              const timeStr    = new Date(item.logged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              const hasIngs    = item.ingredients && item.ingredients.length > 1;
              const isFoodOpen = expandedFood === item.id;
              return (
                <div key={item.id} style={{ borderTop: idx === 0 ? 'none' : `1px solid ${EDGE}`, opacity: isRemoved ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: isRemoved ? MUTED : TEXT,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: isRemoved ? 'line-through' : 'none',
                      }}>
                        {item.food_name}
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                        {isRemoved ? <span style={{ color: RED, fontWeight: 700 }}>removed · </span> : null}
                        {dateLabel(logDate)} {timeStr}
                        {' · '}{MEAL_LABEL[item.meal_type] ?? item.meal_type}
                        {item.weight_grams ? ` · ${item.weight_grams}g` : ''}
                        {hasIngs ? ` · ${item.ingredients!.length} foods` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: isRemoved ? MUTED : ORANGE, letterSpacing: -0.5 }}>
                        {Math.round(Number(item.calories))} kcal
                      </div>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                        <span style={{ fontSize: 9, color: BLUE,   fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                        <span style={{ fontSize: 9, color: GREEN,  fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                        <span style={{ fontSize: 9, color: FAT_CLR,fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                      </div>
                    </div>
                    {hasIngs && !isRemoved && (
                      <button onClick={() => setExpandedFood(isFoodOpen ? null : item.id)} style={{
                        width: 28, height: 28, borderRadius: 8,
                        border: `1px solid ${isFoodOpen ? ORANGE : EDGE}`,
                        background: isFoodOpen ? `${ORANGE}10` : SURF2, color: isFoodOpen ? ORANGE : MUTED,
                        fontWeight: 700, fontSize: 11, cursor: 'pointer', flexShrink: 0,
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

                  {isFoodOpen && hasIngs && !isRemoved && (
                    <div style={{ borderTop: `1px solid ${EDGE}`, background: SURF2, padding: '4px 0 6px' }}>
                      {item.ingredients!.map((ing, i) => {
                        const ingKey = `${item.id}-${i}`;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px 7px 24px', borderBottom: i < item.ingredients!.length - 1 ? `1px solid ${EDGE}` : 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{ing.amount}</div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, flexShrink: 0 }}>{Math.round(ing.calories)}</div>
                            <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                              <span style={{ fontSize: 9, color: RED,    fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                              <span style={{ fontSize: 9, color: YELLOW,   fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
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
    </div>
  );
}
