import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllLogs, addLog, unremoveLog, getLogs, type FoodLog, type Ingredient } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';

const BG    = '#EEF4FF';
const SURF  = '#FFFFFF';
const SURF2 = '#E4EEFF';
const EDGE  = 'rgba(0,56,168,0.10)';
const TEXT  = '#0A1628';
const MUTED = '#6878A0';
const BLUE  = '#0038A8';
const GREEN = '#34c759';
const RED   = '#C62828';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack', other: 'Other',
};

interface DaySummary {
  date: string;
  label: string;
  totalCal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  items: FoodLog[];
}

function dateLabel(date: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function groupByDate(logs: FoodLog[]): DaySummary[] {
  const map = new Map<string, FoodLog[]>();
  for (const log of logs) {
    if (log.removed) continue; // excluded from day summaries
    const d = log.logged_at.slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(log);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      label: dateLabel(date),
      totalCal:     Math.round(items.reduce((s, i) => s + Number(i.calories), 0)),
      totalProtein: Math.round(items.reduce((s, i) => s + Number(i.protein),  0)),
      totalCarbs:   Math.round(items.reduce((s, i) => s + Number(i.carbs),    0)),
      totalFat:     Math.round(items.reduce((s, i) => s + Number(i.fat),      0)),
      items,
    }));
}

function MacroChip({ label, value, color, pct }: { label: string; value: number; color: string; pct: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: SURF2, borderRadius: 8, padding: '5px 10px', minWidth: 52 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color }}>{value}g</div>
      <div style={{ fontSize: 9, fontWeight: 700, color, marginTop: 1 }}>{pct}%</div>
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
        // Today's removed entry — restore in-place, no new row
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
      await addLog({
        food_name: ing.name,
        calories: ing.calories,
        protein: ing.protein,
        carbs: ing.carbs,
        fat: ing.fat,
        meal_type: mealType || 'snack',
      });
    } catch { /* silent */ }
    setTimeout(() => setReloggedIng(null), 1500);
  };

  const goalCal = targets?.calories ?? 2000;
  const totalDays = days.length;

  return (
    <div style={{ minHeight: '100%', background: BG }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '52px 22px 0', background: `linear-gradient(135deg, ${BLUE} 0%, #1a5fd4 100%)` }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textTransform: 'uppercase' }}>Fuel Log</div>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, color: '#fff' }}>History</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4, marginBottom: 20 }}>
          {totalDays > 0 ? `${totalDays} day${totalDays === 1 ? '' : 's'} · ${allLogs.length} items` : 'No entries yet'}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          {(['days', 'foods'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.45)',
              borderBottom: tab === t ? '2px solid #fff' : '2px solid transparent',
              transition: 'all 0.15s',
            }}>{t === 'days' ? 'Days' : 'Foods'}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading…</div>
        ) : allLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>No history yet</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Log food in the Fuel tab to start building your history.</div>
          </div>
        ) : tab === 'days' ? (

          /* ── DAYS TAB ── */
          days.map((day) => {
            const isOpen   = expanded === day.date;
            const pct      = Math.min(100, Math.round((day.totalCal / goalCal) * 100));
            const barColor = pct >= 110 ? '#e05050' : pct >= 90 ? '#34c759' : BLUE;

            return (
              <div key={day.date} style={{ background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`, marginBottom: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,56,168,0.06)' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : day.date)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px 12px', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, letterSpacing: -0.3 }}>{day.label}</div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                        {new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}{day.items.length} item{day.items.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: barColor, letterSpacing: -1 }}>{day.totalCal}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>of {goalCal} kcal</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 6, background: SURF2, borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: barColor, minWidth: 34, textAlign: 'right' }}>{pct}%</div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {(() => {
                      const tot = day.totalProtein * 4 + day.totalCarbs * 4 + day.totalFat * 9 || 1;
                      const pP  = Math.round(day.totalProtein * 4 / tot * 100);
                      const cP  = Math.round(day.totalCarbs   * 4 / tot * 100);
                      const fP  = 100 - pP - cP;
                      return (<>
                        <MacroChip label="Protein" value={day.totalProtein} color="#e05050" pct={pP} />
                        <MacroChip label="Carbs"   value={day.totalCarbs}   color="#f5a623" pct={cP} />
                        <MacroChip label="Fat"     value={day.totalFat}     color="#34c759" pct={fP} />
                      </>);
                    })()}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <div style={{ fontSize: 18, color: MUTED, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>›</div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: `1px solid ${EDGE}`, padding: '8px 0 4px' }}>
                    {day.items.map((item, idx) => {
                      const hasIngs    = item.ingredients && item.ingredients.length > 1;
                      const isFoodOpen = expandedFood === item.id;
                      return (
                        <div key={item.id} style={{ borderBottom: idx < day.items.length - 1 ? `1px solid ${EDGE}` : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food_name}</div>
                              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                                {MEAL_LABEL[item.meal_type] ?? item.meal_type}
                                {item.weight_grams ? ` · ${item.weight_grams}g` : ''}
                                {hasIngs ? ` · ${item.ingredients!.length} items` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: BLUE }}>{Math.round(Number(item.calories))}</div>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                                <span style={{ fontSize: 9, color: '#e05050', fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                                <span style={{ fontSize: 9, color: '#f5a623', fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                                <span style={{ fontSize: 9, color: '#34c759', fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                              </div>
                            </div>
                            {hasIngs && (
                              <button onClick={() => setExpandedFood(isFoodOpen ? null : item.id)} style={{
                                width: 26, height: 26, borderRadius: 8, border: `1px solid ${isFoodOpen ? BLUE : EDGE}`,
                                background: isFoodOpen ? `${BLUE}10` : SURF2, color: isFoodOpen ? BLUE : MUTED,
                                fontWeight: 700, fontSize: 10, cursor: 'pointer', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>{isFoodOpen ? '▲' : '▼'}</button>
                            )}
                            <button onClick={() => handleRelog(item)} disabled={relogged === item.id}
                              title="Add to today's fuel"
                              style={{
                              width: 28, height: 28, borderRadius: 8, border: `1px solid ${relogged === item.id ? GREEN : EDGE}`,
                              background: relogged === item.id ? `${GREEN}15` : SURF2,
                              color: relogged === item.id ? GREEN : BLUE,
                              fontWeight: 900, fontSize: 14, cursor: relogged === item.id ? 'default' : 'pointer', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {relogged === item.id ? '✓' : '+'}
                            </button>
                          </div>
                          {isFoodOpen && hasIngs && (
                            <div style={{ background: '#F8FBFF', borderTop: `1px solid ${EDGE}`, padding: '4px 0 6px' }}>
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
                                      <span style={{ fontSize: 9, color: '#e05050', fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                                      <span style={{ fontSize: 9, color: '#f5a623', fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
                                      <span style={{ fontSize: 9, color: '#34c759', fontWeight: 700 }}>F{Math.round(ing.fat)}</span>
                                    </div>
                                    <button onClick={() => handleRelogIngredient(ing, item.meal_type, ingKey)}
                                      disabled={reloggedIng === ingKey}
                                      title="Add to today's fuel"
                                      style={{
                                      width: 26, height: 26, borderRadius: 8, border: `1px solid ${reloggedIng === ingKey ? GREEN : EDGE}`,
                                      background: reloggedIng === ingKey ? `${GREEN}15` : SURF2,
                                      color: reloggedIng === ingKey ? GREEN : BLUE,
                                      fontWeight: 900, fontSize: 13, cursor: reloggedIng === ingKey ? 'default' : 'pointer', flexShrink: 0,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          })

        ) : (

          /* ── FOODS TAB ── */
          <div style={{ background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,56,168,0.06)' }}>
            {allLogs.map((item, idx) => {
              const isRemoved  = !!item.removed;
              const logDate    = item.logged_at.slice(0, 10);
              const timeStr    = new Date(item.logged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              const hasIngs    = item.ingredients && item.ingredients.length > 1;
              const isFoodOpen = expandedFood === item.id;
              return (
                <div key={item.id} style={{ borderTop: idx === 0 ? 'none' : `1px solid ${EDGE}`, opacity: isRemoved ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isRemoved ? MUTED : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isRemoved ? 'line-through' : 'none' }}>{item.food_name}</div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                        {isRemoved ? <span style={{ color: RED, fontWeight: 700 }}>removed · </span> : null}
                        {dateLabel(logDate)} {timeStr}
                        {' · '}{MEAL_LABEL[item.meal_type] ?? item.meal_type}
                        {item.weight_grams ? ` · ${item.weight_grams}g` : ''}
                        {hasIngs ? ` · ${item.ingredients!.length} foods` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: isRemoved ? MUTED : BLUE }}>{Math.round(Number(item.calories))} kcal</div>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                        <span style={{ fontSize: 9, color: '#e05050', fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                        <span style={{ fontSize: 9, color: '#f5a623', fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                        <span style={{ fontSize: 9, color: '#34c759', fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                      </div>
                    </div>
                    {hasIngs && !isRemoved && (
                      <button onClick={() => setExpandedFood(isFoodOpen ? null : item.id)} style={{
                        width: 28, height: 28, borderRadius: 8, border: `1px solid ${isFoodOpen ? BLUE : EDGE}`,
                        background: isFoodOpen ? `${BLUE}10` : SURF2, color: isFoodOpen ? BLUE : MUTED,
                        fontWeight: 700, fontSize: 11, cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{isFoodOpen ? '▲' : '▼'}</button>
                    )}
                    <button onClick={() => handleRelog(item)} disabled={relogged === item.id}
                      title="Add to today's fuel"
                      style={{
                        width: 28, height: 28, borderRadius: 8,
                        border: `1px solid ${relogged === item.id ? GREEN : EDGE}`,
                        background: relogged === item.id ? `${GREEN}15` : SURF2,
                        color: relogged === item.id ? GREEN : BLUE,
                        fontWeight: 900, fontSize: 14, cursor: relogged === item.id ? 'default' : 'pointer',
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      {relogged === item.id ? '✓' : '+'}
                    </button>
                  </div>

                  {/* Ingredient expansion */}
                  {isFoodOpen && hasIngs && !isRemoved && (
                    <div style={{ borderTop: `1px solid ${EDGE}`, background: '#F8FBFF', padding: '4px 0 6px' }}>
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
                              <span style={{ fontSize: 9, color: '#e05050', fontWeight: 700 }}>P{Math.round(ing.protein)}</span>
                              <span style={{ fontSize: 9, color: '#f5a623', fontWeight: 700 }}>C{Math.round(ing.carbs)}</span>
                              <span style={{ fontSize: 9, color: '#34c759', fontWeight: 700 }}>F{Math.round(ing.fat)}</span>
                            </div>
                            <button onClick={() => handleRelogIngredient(ing, item.meal_type, ingKey)}
                              disabled={reloggedIng === ingKey}
                              title="Add to today's fuel"
                              style={{
                              width: 26, height: 26, borderRadius: 8, border: `1px solid ${reloggedIng === ingKey ? GREEN : EDGE}`,
                              background: reloggedIng === ingKey ? `${GREEN}15` : SURF2,
                              color: reloggedIng === ingKey ? GREEN : BLUE,
                              fontWeight: 900, fontSize: 13, cursor: reloggedIng === ingKey ? 'default' : 'pointer', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
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
