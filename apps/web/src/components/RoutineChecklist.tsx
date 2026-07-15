import { useState, useEffect, useCallback } from 'react';
import {
  getRoutineItems,
  getRoutineLogs,
  toggleRoutineLog,
  getAllStreaks,
  getRoutineCompletionPct,
} from '../lib/glowRoutine';
import type { GlowRoutineItem, GlowRoutineLog } from '../lib/db';
import type { GlowProfile, GlowGoal } from '../lib/glowProfile';

// ─── Time-of-day config ───────────────────────────────────────────────────────

type TimeSlot = 'morning' | 'day' | 'evening';

const TIME_SLOTS: { id: TimeSlot; label: string; emoji: string; color: string; tip: string }[] = [
  { id: 'morning', label: 'Morning', emoji: '🌅', color: '#FB8C00', tip: 'Quick essentials before you head out — aim to finish in 10–15 min.' },
  { id: 'day',     label: 'Day',     emoji: '☀️', color: '#1E88E5', tip: 'Work-friendly habits. Posture checks cost 0 sec. Water + steps = passive wins.' },
  { id: 'evening', label: 'Evening', emoji: '🌙', color: '#7E57C2', tip: 'Wind-down mode. These seal in your progress and set up tomorrow.' },
];

const ITEM_TIME: Record<string, TimeSlot> = {
  'Brush teeth (AM)':         'morning',
  'Morning cleanse':          'morning',
  'Cold face rinse (30s)':    'morning',
  'Vitamin C serum (AM)':     'morning',
  'SPF 30+ applied':          'morning',
  'Hot shower + cold finish': 'morning',
  'Mewing practice (15m)':    'morning',
  'Hair mask (2×/week)':      'morning',

  'Hit water target':         'day',
  'Walk 8k+ steps':           'day',
  'No processed food':        'day',
  'Upright posture check':    'day',
  'No forward head (desk)':   'day',
  'Chin tucks ×20':           'day',

  'Brush teeth (PM)':         'evening',
  'Floss':                    'evening',
  'Gua sha (3 min face)':     'evening',
  'Night moisturizer':        'evening',
  'Retinol/Niacinamide (PM)': 'evening',
  'Screens off by 10pm':      'evening',
  '8h sleep target':          'evening',
  'Dead hang (60s)':          'evening',
  'Beard / stubble clean':    'evening',
  'Nails clean':              'evening',
  'Eyebrow grooming':         'evening',
};

function getDefaultTime(): TimeSlot {
  const h = new Date().getHours();
  if (h < 11) return 'morning';
  if (h < 18) return 'day';
  return 'evening';
}

// ─── Goal → priority items ────────────────────────────────────────────────────

const GOAL_PRIORITY_ITEMS: Record<GlowGoal, string[]> = {
  glow_skin:    ['Cold face rinse (30s)', 'Vitamin C serum (AM)', 'SPF 30+ applied', 'Gua sha (3 min face)', 'Night moisturizer', 'Retinol/Niacinamide (PM)'],
  clear_acne:   ['Morning cleanse', 'Cold face rinse (30s)', 'SPF 30+ applied', 'No processed food', 'Hit water target', 'Screens off by 10pm'],
  hair_growth:  ['Hair mask (2×/week)', 'Hot shower + cold finish', 'Hit water target', 'No processed food', '8h sleep target'],
  jawline:      ['Mewing practice (15m)', 'Chin tucks ×20', 'Dead hang (60s)', 'Upright posture check', 'No forward head (desk)'],
  lose_fat:     ['Walk 8k+ steps', 'Hot shower + cold finish', 'Screens off by 10pm', '8h sleep target', 'No processed food'],
  build_muscle: ['8h sleep target', 'Hit water target', 'No processed food', 'Hot shower + cold finish'],
};

const GOAL_BANNER: Record<GlowGoal, { emoji: string; label: string; tip: string; color: string }> = {
  glow_skin:    { emoji: '✨', label: 'Glow skin focus', tip: 'SPF every morning is worth more than any serum. Cold rinse + Vitamin C = the core pair.', color: '#1E88E5' },
  clear_acne:   { emoji: '🧴', label: 'Clear skin focus', tip: 'Cleansing consistency beats product quality. No processed food = fewer insulin spikes = less sebum.', color: '#43A047' },
  hair_growth:  { emoji: '💇', label: 'Hair growth focus', tip: 'Scalp massage 4 min/day increased hair growth 68% in studies. Do it in the shower.', color: '#FB8C00' },
  jawline:      { emoji: '🫦', label: 'Jawline & posture focus', tip: 'Daily mewing + dead hangs resets anterior chain. 15 min mewing = your most impactful daily habit.', color: '#7E57C2' },
  lose_fat:     { emoji: '🔥', label: 'Fat loss focus', tip: '8k+ steps burns more than most people think. Pair it with screens off by 10pm for GH peak sleep.', color: '#E53935' },
  build_muscle: { emoji: '💪', label: 'Muscle building focus', tip: 'GH peaks at 11pm–1am in deep sleep. 8h sleep + protein = free anabolic window. Don\'t waste it.', color: '#0091EA' },
};

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
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 99, transition: 'width 0.6s var(--spring)',
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
      padding: '2px 6px', borderRadius: 99, flexShrink: 0,
    }}>
      🔥 {streak}d
    </span>
  );
}

function RoutineItem({
  item, done, streak, onToggle, priority,
}: {
  item: GlowRoutineItem;
  done: boolean;
  streak: number;
  onToggle: () => void;
  priority?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="press card-lift"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        background: done ? 'rgba(74,222,128,0.05)' : priority ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'var(--surf)',
        border: `1px solid ${done ? 'rgba(74,222,128,0.20)' : priority && !done ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'var(--edge)'}`,
        borderRadius: 14, padding: '12px 14px',
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
        border: `2px solid ${done ? '#4ADE80' : priority ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--edge2)'}`,
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
      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
      <span style={{
        flex: 1, fontSize: 14, fontWeight: priority ? 700 : 600,
        color: done ? 'var(--muted)' : 'var(--text)',
        textDecoration: done ? 'line-through' : 'none',
        transition: 'color 0.15s ease',
      }}>
        {item.name}
      </span>
      {priority && !done && (
        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', padding: '2px 6px', borderRadius: 99, flexShrink: 0, letterSpacing: 0.3 }}>
          FOR YOU
        </span>
      )}
      <StreakBadge streak={streak} />
    </button>
  );
}

function XPToast({ msg, visible }: { msg: string; visible: boolean }) {
  return (
    <div style={{
      position: 'fixed', top: 80, left: '50%', transform: `translateX(-50%) translateY(${visible ? 0 : -20}px)`,
      opacity: visible ? 1 : 0, transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
      background: '#43A047', color: '#fff', padding: '8px 18px', borderRadius: 99,
      fontSize: 13, fontWeight: 800, zIndex: 9999, pointerEvents: 'none',
      boxShadow: '0 4px 16px rgba(67,160,71,0.4)',
    }}>
      {msg}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RoutineChecklist({ profile }: { profile?: GlowProfile | null }) {
  const today        = new Date().toISOString().split('T')[0];
  const priorityItems: Set<string> = profile ? new Set(GOAL_PRIORITY_ITEMS[profile.goal]) : new Set();
  const banner       = profile ? GOAL_BANNER[profile.goal] : null;

  const [activeTime, setActiveTime] = useState<TimeSlot>(getDefaultTime);
  const [allItems,   setAllItems]   = useState<GlowRoutineItem[]>([]);
  const [logs,       setLogs]       = useState<GlowRoutineLog[]>([]);
  const [streaks,    setStreaks]     = useState<Record<number, number>>({});
  const [pct,        setPct]        = useState(0);
  const [toast,      setToast]      = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });

  function showToast(msg: string) {
    setToast({ msg, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2200);
  }

  const reload = useCallback(async () => {
    const [fetchedItems, dayLogs, dayPct] = await Promise.all([
      getRoutineItems(),
      getRoutineLogs(today),
      getRoutineCompletionPct(today),
    ]);
    setAllItems(fetchedItems);
    setLogs(dayLogs);
    setPct(dayPct);
    const ids = fetchedItems.map(i => i.id!).filter(Boolean);
    if (ids.length > 0) setStreaks(await getAllStreaks(ids));
  }, [today]);

  useEffect(() => { reload(); }, [reload]);

  const doneSet = new Set(logs.filter(l => l.done).map(l => l.item_id));
  const items   = allItems.filter(i => (ITEM_TIME[i.name] ?? 'morning') === activeTime);

  const handleToggle = async (item: GlowRoutineItem) => {
    const id   = item.id!;
    const done = doneSet.has(id);
    setLogs(prev => {
      const existing = prev.find(l => l.item_id === id && l.date === today);
      if (existing) return prev.map(l => l.item_id === id && l.date === today ? { ...l, done: !done } : l);
      return [...prev, { item_id: id, date: today, done: true, logged_at: new Date().toISOString() }];
    });
    const result = await toggleRoutineLog(id, today, done);
    if (result.fullRoutineComplete) showToast('🏆 Full routine! +50 XP');
    else if (result.categoryComplete) showToast(`✅ Section done! +20 XP`);
    else if (result.xpGranted > 0) showToast(`+${result.xpGranted} XP`);
    const newPct = await getRoutineCompletionPct(today);
    setPct(newPct);
    window.dispatchEvent(new CustomEvent('fs_routine_updated'));
  };

  const slot      = TIME_SLOTS.find(s => s.id === activeTime)!;
  const slotDone  = items.filter(i => doneSet.has(i.id!)).length;
  const slotTotal = items.length;

  return (
    <div style={{ paddingBottom: 8 }}>
      <XPToast msg={toast.msg} visible={toast.visible} />

      {/* Personalized banner */}
      {banner && (
        <div style={{
          marginBottom: 14, padding: '12px 14px', borderRadius: 14,
          background: `${banner.color}0E`, border: `1px solid ${banner.color}28`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color: banner.color, marginBottom: 4, textTransform: 'uppercase' }}>
            {banner.emoji} {banner.label}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{banner.tip}</div>
        </div>
      )}

      {/* Completion bar */}
      <CompletionBar pct={pct} />

      {/* Time-of-day tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 14,
        background: 'var(--surf)', borderRadius: 14, padding: 5,
        border: '1px solid var(--edge)',
      }}>
        {TIME_SLOTS.map(s => {
          const active = s.id === activeTime;
          return (
            <button
              key={s.id}
              onClick={() => setActiveTime(s.id)}
              className="press"
              style={{
                flex: 1, padding: '8px 4px',
                background: active ? `${s.color}18` : 'transparent',
                border: `1px solid ${active ? `${s.color}40` : 'transparent'}`,
                borderRadius: 10, cursor: 'pointer',
                transition: 'all 0.18s var(--spring)',
                boxShadow: active ? `0 0 14px ${s.color}30` : 'none',
              }}
            >
              <div style={{ fontSize: 16, lineHeight: 1, marginBottom: 2 }}>{s.emoji}</div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: active ? s.color : 'var(--muted)' }}>
                {s.label.toUpperCase()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Section header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', color: slot.color }}>
            {slot.emoji} {slot.label.toUpperCase()} ROUTINE
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: slotDone === slotTotal && slotTotal > 0 ? '#4ADE80' : 'var(--muted)' }}>
            {slotDone}/{slotTotal} done
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{slot.tip}</div>
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
            priority={priorityItems.has(item.name)}
          />
        ))}
        {items.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No items for this time slot
          </div>
        )}
      </div>
    </div>
  );
}
