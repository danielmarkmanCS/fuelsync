import { useState, useEffect, useCallback } from 'react';
import { getAllLogs, type FoodLog } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';

const BG    = '#EEF4FF';
const SURF  = '#FFFFFF';
const SURF2 = '#E4EEFF';
const EDGE  = 'rgba(0,56,168,0.10)';
const TEXT  = '#0A1628';
const MUTED = '#6878A0';
const BLUE  = '#0038A8';

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

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: SURF2, borderRadius: 8, padding: '5px 10px', minWidth: 52 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color }}>{value}g</div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: MUTED, textTransform: 'uppercase', marginTop: 1 }}>{label}</div>
    </div>
  );
}

export default function HistoryScreen() {
  const { targets } = useNutrition();
  const [days, setDays]       = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getAllLogs()
      .then((logs) => setDays(groupByDate(logs)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const goalCal = targets?.calories ?? 2000;

  return (
    <div style={{ minHeight: '100%', background: BG }}>
      {/* Header */}
      <div style={{
        padding: '52px 22px 20px',
        background: `linear-gradient(135deg, ${BLUE} 0%, #1a5fd4 100%)`,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textTransform: 'uppercase' }}>Fuel Log</div>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, color: '#fff' }}>History</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
          {days.length > 0 ? `${days.length} day${days.length === 1 ? '' : 's'} logged` : 'No entries yet'}
        </div>
      </div>

      <div style={{ padding: '16px 16px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading…</div>
        ) : days.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>No history yet</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Log food in the Fuel tab to start building your history.</div>
          </div>
        ) : (
          days.map((day) => {
            const isOpen = expanded === day.date;
            const pct    = Math.min(100, Math.round((day.totalCal / goalCal) * 100));
            const barColor = pct >= 110 ? '#e05050' : pct >= 90 ? '#34c759' : BLUE;

            return (
              <div key={day.date} style={{ background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`, marginBottom: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,56,168,0.06)' }}>
                {/* Day header row */}
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
                      <div style={{ fontSize: 22, fontWeight: 900, color: BLUE, letterSpacing: -1 }}>{day.totalCal}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>kcal</div>
                    </div>
                  </div>

                  {/* Calorie bar */}
                  <div style={{ height: 4, background: SURF2, borderRadius: 2, marginBottom: 10 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.4s' }} />
                  </div>

                  {/* Macro chips */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <MacroChip label="Protein" value={day.totalProtein} color="#e05050" />
                    <MacroChip label="Carbs"   value={day.totalCarbs}   color="#f5a623" />
                    <MacroChip label="Fat"     value={day.totalFat}     color="#34c759" />
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <div style={{ fontSize: 18, color: MUTED, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>›</div>
                    </div>
                  </div>
                </button>

                {/* Expanded items */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${EDGE}`, padding: '8px 0 4px' }}>
                    {day.items.map((item, idx) => (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 16px',
                        borderBottom: idx < day.items.length - 1 ? `1px solid ${EDGE}` : 'none',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.food_name}</div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                            {MEAL_LABEL[item.meal_type] ?? item.meal_type}
                            {item.weight_grams ? ` · ${item.weight_grams}g` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: BLUE }}>{Math.round(Number(item.calories))}</div>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                            <span style={{ fontSize: 9, color: '#e05050', fontWeight: 700 }}>P{Math.round(Number(item.protein))}</span>
                            <span style={{ fontSize: 9, color: '#f5a623', fontWeight: 700 }}>C{Math.round(Number(item.carbs))}</span>
                            <span style={{ fontSize: 9, color: '#34c759', fontWeight: 700 }}>F{Math.round(Number(item.fat))}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
