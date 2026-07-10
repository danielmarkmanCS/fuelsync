import { useState, useEffect, useCallback } from 'react';
import {
  getRoutineItemsByCategory,
  getRoutineLogs,
  toggleRoutineLog,
  getAllStreaks,
  getRoutineCompletionPct,
} from '../lib/glowRoutine';
import type { GlowRoutineItem, GlowRoutineLog, RoutineCategory } from '../lib/db';

// ─── Category config ──────────────────────────────────────────────────────────

const CATS: { id: RoutineCategory; label: string; color: string }[] = [
  { id: 'SKIN',   label: 'Skin',    color: '#38BDF8' },
  { id: 'GROOM',  label: 'Groom',   color: '#F97316' },
  { id: 'HABITS', label: 'Habits',  color: '#4ADE80' },
  { id: 'MEWING', label: 'Posture', color: '#A78BFA' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompletionBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#4ADE80' : pct >= 50 ? '#FBBF24' : '#F87171';
  return (
    <div className="card a a1" style={{ padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)' }}>
          TODAY'S COMPLETION
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--surf2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 99,
          transition: 'width 0.6s var(--spring)',
          boxShadow: `0 0 10px ${color}55`,
        }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
        {pct === 100
          ? '✦ Perfect day — all habits done'
          : pct === 0
          ? 'Tap items below to start your routine'
          : `${pct >= 80 ? 'Almost there' : 'Keep going'} — stay consistent`}
      </div>
    </div>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
      color: '#FBBF24', background: 'rgba(251,191,36,0.12)',
      border: '1px solid rgba(251,191,36,0.25)',
      padding: '2px 6px', borderRadius: 99,
      flexShrink: 0,
    }}>
      🔥 {streak}d
    </span>
  );
}

function RoutineItem({
  item, done, streak, onToggle,
}: {
  item: GlowRoutineItem;
  done: boolean;
  streak: number;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="press card-lift"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        background: done ? 'rgba(74,222,128,0.05)' : 'var(--surf)',
        border: `1px solid ${done ? 'rgba(74,222,128,0.20)' : 'var(--edge)'}`,
        borderRadius: 14, padding: '12px 14px',
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      {/* Checkbox */}
      <div style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
        border: `2px solid ${done ? '#4ADE80' : 'var(--edge2)'}`,
        background: done ? '#4ADE80' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.18s var(--spring)',
        boxShadow: done ? '0 0 8px rgba(74,222,128,0.40)' : 'none',
      }}>
        {done && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#07080F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Icon */}
      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>

      {/* Label */}
      <span style={{
        flex: 1, fontSize: 14, fontWeight: 600,
        color: done ? 'var(--muted)' : 'var(--text)',
        textDecoration: done ? 'line-through' : 'none',
        transition: 'color 0.15s ease',
      }}>
        {item.name}
      </span>

      <StreakBadge streak={streak} />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoutineChecklist() {
  const today = new Date().toISOString().split('T')[0];

  const [activeCat, setActiveCat] = useState<RoutineCategory>('SKIN');
  const [items,     setItems]     = useState<GlowRoutineItem[]>([]);
  const [logs,      setLogs]      = useState<GlowRoutineLog[]>([]);
  const [streaks,   setStreaks]   = useState<Record<number, number>>({});
  const [pct,       setPct]       = useState(0);

  const reload = useCallback(async () => {
    const [catItems, dayLogs, dayPct] = await Promise.all([
      getRoutineItemsByCategory(activeCat),
      getRoutineLogs(today),
      getRoutineCompletionPct(today),
    ]);
    setItems(catItems);
    setLogs(dayLogs);
    setPct(dayPct);
    const ids = catItems.map(i => i.id!).filter(Boolean);
    if (ids.length > 0) {
      const s = await getAllStreaks(ids);
      setStreaks(s);
    }
  }, [activeCat, today]);

  useEffect(() => { reload(); }, [reload]);

  const doneSet = new Set(logs.filter(l => l.done).map(l => l.item_id));

  const handleToggle = async (item: GlowRoutineItem) => {
    const id   = item.id!;
    const done = doneSet.has(id);
    // Optimistic update
    setLogs(prev => {
      const existing = prev.find(l => l.item_id === id && l.date === today);
      if (existing) return prev.map(l => l.item_id === id && l.date === today ? { ...l, done: !done } : l);
      return [...prev, { item_id: id, date: today, done: true, logged_at: new Date().toISOString() }];
    });
    await toggleRoutineLog(id, today, done);
    const newPct = await getRoutineCompletionPct(today);
    setPct(newPct);
  };

  const catColor = CATS.find(c => c.id === activeCat)?.color ?? 'var(--accent)';

  return (
    <div style={{ paddingBottom: 8 }}>
      {/* Completion bar */}
      <CompletionBar pct={pct} />

      {/* Category tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 16,
        background: 'var(--surf)', borderRadius: 14, padding: 5,
        border: '1px solid var(--edge)',
      }}>
        {CATS.map(cat => {
          const active = cat.id === activeCat;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className="press"
              style={{
                flex: 1, padding: '7px 4px',
                background: active ? `${cat.color}18` : 'transparent',
                border: `1px solid ${active ? `${cat.color}40` : 'transparent'}`,
                borderRadius: 10,
                fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                color: active ? cat.color : 'var(--muted)',
                cursor: 'pointer',
                transition: 'all 0.18s var(--spring)',
                boxShadow: active ? `0 0 14px ${cat.color}30` : 'none',
              }}
            >
              {cat.label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Section label */}
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.15em',
        color: catColor, marginBottom: 10,
      }}>
        {CATS.find(c => c.id === activeCat)?.label.toUpperCase()} ROUTINE
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <RoutineItem
            key={item.id}
            item={item}
            done={doneSet.has(item.id!)}
            streak={streaks[item.id!] ?? 0}
            onToggle={() => handleToggle(item)}
          />
        ))}
        {items.length === 0 && (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: 'var(--muted)', fontSize: 13,
          }}>
            No items in this category
          </div>
        )}
      </div>
    </div>
  );
}
