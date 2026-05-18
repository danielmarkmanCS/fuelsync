import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllLogs, addLog, unremoveLog, type FoodLog, type Ingredient } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';

const BG     = '#F0F5FF';
const SURF   = '#FFFFFF';
const SURF2  = '#E6EEFF';
const EDGE   = 'rgba(30,64,220,0.09)';
const TEXT   = '#080F30';
const MUTED  = '#5E71A8';
const BLUE   = '#1E40DC';
const BLUE2  = '#4B6FFF';
const GREEN  = '#05C56B';
const ORANGE = '#FF8B00';
const PURPLE = '#8034E0';
const CYAN   = '#00BDD0';
const RED    = '#EF3340';
const CARD_SHADOW = '0 2px 16px rgba(30,64,220,0.07), 0 1px 3px rgba(0,0,0,0.04)';

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
    if (log.removed) continue;
    const d = log.logged_at.slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(log);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date, label: dateLabel(date),
      totalCal:     Math.round(items.reduce((s, i) => s + Number(i.calories), 0)),
      totalProtein: Math.round(items.reduce((s, i) => s + Number(i.protein),  0)),
      totalCarbs:   Math.round(items.reduce((s, i) => s + Number(i.carbs),    0)),
      totalFat:     Math.round(items.reduce((s, i) => s + Number(i.fat),      0)),
      items,
    }));
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

// ── WEEKLY BAR CHART ──────────────────────────────────────────────
function WeeklyChart({ days, goalCal }: { days: DaySummary[]; goalCal: number }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const dayMap = new Map(days.map(d => [d.date, d]));
  const maxCal = Math.max(goalCal * 1.2, ...week.map(d => dayMap.get(d)?.totalCal ?? 0), 1);
  const CHART_H = 80;

  return (
    <div style={{
      background: SURF, borderRadius: 20, padding: '18px 16px 14px',
      border: `1px solid ${EDGE}`, marginBottom: 16, boxShadow: CARD_SHADOW,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>
        This Week
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
            const color = pct >= 110 ? RED : pct >= 85 ? GREEN : pct > 0 ? BLUE2 : 'rgba(30,64,220,0.12)';
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
                    background: isToday
                      ? `linear-gradient(180deg, ${color}CC 0%, ${color} 100%)`
                      : color,
                    borderRadius: '5px 5px 3px 3px',
                    boxShadow: isToday ? `0 0 12px ${color}50` : 'none',
                    opacity: isToday ? 1 : 0.72,
                    transition: 'height 0.6s cubic-bezier(0.4,0,0.2,1)',
                  }} />
                </div>
                <div style={{
                  fontSize: 8, fontWeight: isToday ? 800 : 600,
                  color: isToday ? BLUE : MUTED, marginTop: 7, letterSpacing: 0.5,
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
        <div style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>
          Goal {goalCal.toLocaleString()} kcal
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {[[GREEN, '85–110%'], [RED, '110%+']].map(([c, lbl]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: c }} />
              <div style={{ fontSize: 8, color: MUTED, fontWeight: 600 }}>{lbl}</div>
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
        { label: 'Day Streak', value: streak, unit: streak === 1 ? 'day' : 'days', color: streak >= 7 ? ORANGE : streak >= 3 ? GREEN : BLUE, highlight: streak >= 3 },
        { label: 'Days Logged', value: totalDays, unit: 'total', color: CYAN, highlight: false },
        { label: 'Avg Daily', value: goalPct, unit: `% of goal`, color: goalPct >= 85 && goalPct <= 115 ? GREEN : goalPct > 115 ? RED : BLUE, highlight: goalPct >= 85 && goalPct <= 115 },
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
          <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, marginTop: 3 }}>
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
        background: 'linear-gradient(145deg, #080F30 0%, #1E40DC 50%, #4B6FFF 100%)',
        padding: '52px 22px 0', position: 'relative', overflow: 'hidden',
      }}>
        <div className="orb1" style={{ position: 'absolute', top: -20, right: 10, width: 140, height: 140, borderRadius: '50%', background: 'rgba(75,111,255,0.10)' }} />
        <div className="orb2" style={{ position: 'absolute', bottom: 20, left: -10, width: 100, height: 100, borderRadius: '50%', background: 'rgba(30,64,220,0.08)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.55)', marginBottom: 5, textTransform: 'uppercase' }}>
            Fuel History
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -2, color: '#fff' }}>
              Your Journey
            </div>
            {streak >= 2 && (
              <div className="notif-pop" style={{
                background: 'rgba(255,139,0,0.2)', border: '1px solid rgba(255,139,0,0.4)',
                borderRadius: 20, padding: '5px 12px',
                fontSize: 12, fontWeight: 800, color: '#FFCA70',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>🔥</span> {streak} day streak
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20, fontWeight: 500 }}>
            {totalDays > 0
              ? `${totalDays} day${totalDays === 1 ? '' : 's'} · ${allLogs.length} entries · avg ${avgCal.toLocaleString()} kcal`
              : 'Log food in the Fuel tab to build your history'}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.15)', position: 'relative', zIndex: 1 }}>
          {(['days', 'foods'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.4)',
              borderBottom: tab === t ? '3px solid #fff' : '3px solid transparent',
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>Loading your history…</div>
          </div>
        ) : allLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ fontSize: 60, fontWeight: 900, letterSpacing: -4, color: 'rgba(30,64,220,0.07)', marginBottom: 16 }}>
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

            {/* Day cards */}
            {days.map((day) => {
              const isOpen   = expanded === day.date;
              const pct      = Math.min(100, Math.round((day.totalCal / goalCal) * 100));
              const barColor = pct >= 110 ? RED : pct >= 85 ? GREEN : BLUE;
              const perf     = pct >= 85 && pct <= 110 ? 'ON TARGET' : pct > 110 ? 'OVER' : 'UNDER';
              const perfCol  = pct >= 85 && pct <= 110 ? GREEN : pct > 110 ? RED : BLUE;

              return (
                <div key={day.date} style={{
                  background: SURF, borderRadius: 20, border: `1px solid ${EDGE}`,
                  marginBottom: 12, overflow: 'hidden', boxShadow: CARD_SHADOW,
                  borderLeft: `4px solid ${barColor}`,
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
                          <div style={{ fontSize: 9, fontWeight: 600, color: MUTED }}>{pct}%</div>
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
                      <div style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>
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
                            <MacroChip label="Pro" value={day.totalProtein} color={RED}    pct={pP} />
                            <MacroChip label="Crb" value={day.totalCarbs}   color={CYAN}   pct={cP} />
                            <MacroChip label="Fat" value={day.totalFat}     color={PURPLE} pct={fP} />
                          </>
                        );
                      })()}
                      <div style={{ marginLeft: 'auto', color: MUTED, fontSize: 18, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.22s' }}>›</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${EDGE}`, background: `${BLUE}02` }}>
                      {day.items.map((item, idx) => {
                        const hasIngs    = item.ingredients && item.ingredients.length > 1;
                        const isFoodOpen = expandedFood === item.id;
                        return (
                          <div key={item.id} style={{ borderBottom: idx < day.items.length - 1 ? `1px solid ${EDGE}` : 'none' }}>
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
                                <div style={{ fontSize: 15, fontWeight: 900, color: BLUE, letterSpacing: -0.5 }}>
                                  {Math.round(Number(item.calories))}
                                </div>
                                <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                                  <span style={{ fontSize: 9, color: RED,    fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                                  <span style={{ fontSize: 9, color: CYAN,   fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                                  <span style={{ fontSize: 9, color: PURPLE, fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                                </div>
                              </div>
                              {hasIngs && (
                                <button onClick={() => setExpandedFood(isFoodOpen ? null : item.id)} style={{
                                  width: 26, height: 26, borderRadius: 8,
                                  border: `1px solid ${isFoodOpen ? BLUE : EDGE}`,
                                  background: isFoodOpen ? `${BLUE}10` : SURF2,
                                  color: isFoodOpen ? BLUE : MUTED,
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
                                  color: relogged === item.id ? GREEN : BLUE,
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
                                        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                                        <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{ing.amount}</div>
                                      </div>
                                      <div style={{ fontSize: 12, fontWeight: 800, color: BLUE, flexShrink: 0 }}>{Math.round(ing.calories)}</div>
                                      <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                                        <span style={{ fontSize: 9, color: RED,    fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                                        <span style={{ fontSize: 9, color: CYAN,   fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
                                        <span style={{ fontSize: 9, color: PURPLE, fontWeight: 700 }}>F{Math.round(ing.fat)}</span>
                                      </div>
                                      <button onClick={() => handleRelogIngredient(ing, item.meal_type, ingKey)}
                                        disabled={reloggedIng === ingKey}
                                        style={{
                                          width: 26, height: 26, borderRadius: 8,
                                          border: `1px solid ${reloggedIng === ingKey ? GREEN : EDGE}`,
                                          background: reloggedIng === ingKey ? `${GREEN}15` : SURF,
                                          color: reloggedIng === ingKey ? GREEN : BLUE,
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
                      <div style={{ fontSize: 15, fontWeight: 900, color: isRemoved ? MUTED : BLUE, letterSpacing: -0.5 }}>
                        {Math.round(Number(item.calories))} kcal
                      </div>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                        <span style={{ fontSize: 9, color: RED,    fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                        <span style={{ fontSize: 9, color: CYAN,   fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                        <span style={{ fontSize: 9, color: PURPLE, fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                      </div>
                    </div>
                    {hasIngs && !isRemoved && (
                      <button onClick={() => setExpandedFood(isFoodOpen ? null : item.id)} style={{
                        width: 28, height: 28, borderRadius: 8,
                        border: `1px solid ${isFoodOpen ? BLUE : EDGE}`,
                        background: isFoodOpen ? `${BLUE}10` : SURF2, color: isFoodOpen ? BLUE : MUTED,
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
                        color: relogged === item.id ? GREEN : BLUE,
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
                              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{ing.amount}</div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: BLUE, flexShrink: 0 }}>{Math.round(ing.calories)}</div>
                            <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                              <span style={{ fontSize: 9, color: RED,    fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                              <span style={{ fontSize: 9, color: CYAN,   fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
                              <span style={{ fontSize: 9, color: PURPLE, fontWeight: 700 }}>F{Math.round(ing.fat)}</span>
                            </div>
                            <button onClick={() => handleRelogIngredient(ing, item.meal_type, ingKey)}
                              disabled={reloggedIng === ingKey}
                              style={{
                                width: 26, height: 26, borderRadius: 8,
                                border: `1px solid ${reloggedIng === ingKey ? GREEN : EDGE}`,
                                background: reloggedIng === ingKey ? `${GREEN}15` : SURF,
                                color: reloggedIng === ingKey ? GREEN : BLUE,
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
