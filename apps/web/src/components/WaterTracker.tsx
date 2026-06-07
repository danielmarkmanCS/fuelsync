import { useState, useEffect, useCallback } from 'react';
import { getWaterTotal, getWaterGoal, addWater, removeLastWater, setWaterGoal } from '../lib/waterLog';

const QUICK_ADD = [200, 330, 500, 750];

interface Props {
  date: string;
}

export default function WaterTracker({ date }: Props) {
  const [total,       setTotal]       = useState(0);
  const [goal,        setGoal]        = useState(getWaterGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput,   setGoalInput]   = useState('');
  const [adding,      setAdding]      = useState(false);
  const [customMl,    setCustomMl]    = useState('');

  const reload = useCallback(() => {
    getWaterTotal(date).then(setTotal);
  }, [date]);

  useEffect(() => { reload(); }, [reload]);

  const pct    = goal > 0 ? Math.min(total / goal, 1) : 0;
  const filled = Math.round(pct * 8);
  const over   = total > goal && goal > 0;

  async function handleQuick(ml: number) {
    await addWater(date, ml);
    reload();
  }

  async function handleCustom() {
    const v = parseInt(customMl, 10);
    if (!v || v < 1 || v > 3000) return;
    await addWater(date, v);
    setCustomMl('');
    setAdding(false);
    reload();
  }

  async function handleUndo() {
    await removeLastWater(date);
    reload();
  }

  function saveGoal() {
    const v = parseInt(goalInput, 10);
    if (v >= 500 && v <= 6000) {
      setGoal(v);
      setWaterGoal(v);
    }
    setEditingGoal(false);
  }

  const liters = (total / 1000).toFixed(1);
  const goalL  = (goal  / 1000).toFixed(1);

  return (
    <div style={{
      background: 'var(--surf)', border: '1px solid var(--edge)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Water</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
            background: over ? '#EF444420' : pct >= 1 ? 'var(--accent-muted)' : 'var(--edge)',
            color: over ? '#EF4444' : pct >= 1 ? 'var(--accent)' : 'var(--muted)',
          }}>
            {liters}L / {goalL}L
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {total > 0 && (
            <button
              onClick={handleUndo}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
              title="Undo last"
            >↩</button>
          )}
          <button
            onClick={() => { setEditingGoal(true); setGoalInput(String(goal)); }}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >Goal</button>
        </div>
      </div>

      {/* Goal editor */}
      {editingGoal && (
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            autoFocus type="number" min={500} max={6000} value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
            placeholder="ml / day"
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 6, background: 'var(--surf2)',
              border: '1px solid var(--accent)', color: 'var(--text)', fontSize: 13,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button
            onClick={saveGoal}
            style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >Save</button>
        </div>
      )}

      {/* Wave progress bar */}
      <div style={{ margin: '0 14px 10px', height: 6, background: 'var(--edge)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3, background: over ? '#EF4444' : '#38BDF8',
          width: `${pct * 100}%`, transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Cup icons */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 10px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 20, borderRadius: 3,
            background: i < filled ? '#38BDF8' : 'var(--edge)',
            opacity: i < filled ? 1 : 0.35,
            transition: 'background 0.3s ease',
          }} />
        ))}
      </div>

      {/* Quick-add row */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 12px', flexWrap: 'wrap' }}>
        {QUICK_ADD.map(ml => (
          <button
            key={ml}
            onClick={() => handleQuick(ml)}
            style={{
              padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: 'var(--edge)', border: '1px solid var(--border)',
              color: 'var(--text)',
              transition: 'background 0.15s',
            }}
          >+{ml}ml</button>
        ))}
        <button
          onClick={() => setAdding(a => !a)}
          style={{
            padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700,
            background: adding ? 'var(--accent-muted)' : 'var(--edge)',
            border: `1px solid ${adding ? 'var(--accent)' : 'var(--border)'}`,
            color: adding ? 'var(--accent)' : 'var(--muted)',
          }}
        >Custom</button>
      </div>

      {/* Custom ml input */}
      {adding && (
        <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px' }}>
          <input
            autoFocus type="number" min={1} max={3000} value={customMl}
            onChange={e => setCustomMl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCustom(); }}
            placeholder="ml"
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 6, background: 'var(--surf2)',
              border: '1px solid var(--edge)', color: 'var(--text)', fontSize: 13,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button
            onClick={handleCustom}
            style={{ padding: '7px 16px', borderRadius: 6, background: '#38BDF8', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >Add</button>
        </div>
      )}
    </div>
  );
}
