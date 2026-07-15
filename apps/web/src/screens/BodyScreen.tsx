import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/db';
import type { WeightLog, WaterLog } from '../lib/db';
import { getSleep, logSleep, sleepQualityLabel, sleepQualityColor } from '../lib/sleep';
import {
  getWaterTotal, getWaterGoal, addWater, removeLastWater, removeWaterById,
  getWaterLogs, setWaterGoal, parseWaterAI, parseWaterDescription,
} from '../lib/waterLog';
import { grantDailyXP, grantXP } from '../lib/xp';
import { useThemeStore } from '../store/themeStore';
import { syncWeightLog, getSyncToken } from '../api/syncClient';

// ─── Color tokens ─────────────────────────────────────────────────────────────
const BODY_COLOR  = 'var(--c-body)';     // sky — hydration
const PROT_COLOR  = 'var(--prot)';       // blue
const RED_COLOR   = 'var(--red)';
const MOON_COLOR  = '#A855F7';           // purple — sleep

// ─── Weight goal ─────────────────────────────────────────────────────────────
const WEIGHT_GOAL_KEY = 'fs_weight_goal_v1';
type WeightGoal = 'lose' | 'maintain' | 'gain';

function getWeightGoalType(): WeightGoal {
  return (localStorage.getItem(WEIGHT_GOAL_KEY) as WeightGoal) ?? 'maintain';
}
function saveWeightGoalType(g: WeightGoal) { localStorage.setItem(WEIGHT_GOAL_KEY, g); }

const GOAL_CONFIG: Record<WeightGoal, { label: string; color: string; emoji: string; desc: string }> = {
  lose:     { label: 'Cut',      color: RED_COLOR,  emoji: '🔥', desc: 'Lose fat' },
  maintain: { label: 'Maintain', color: PROT_COLOR, emoji: '⚖️', desc: 'Stay lean' },
  gain:     { label: 'Build',    color: '#22C55E',  emoji: '💪', desc: 'Gain mass' },
};

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ values, color, height = 44, width = 100 }: { values: number[]; color: string; height?: number; width?: number }) {
  if (values.length < 2) return null;
  const pad = 5;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 0.1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  const last = pts[pts.length - 1].split(',');
  const area = `M${pts[0]} ${pts.slice(1).map(p => `L${p}`).join(' ')} L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill={color}
        style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
    </svg>
  );
}

// ─── Weight section ───────────────────────────────────────────────────────────
function WeightSection() {
  const units = useThemeStore(s => s.units);
  const [entries,    setEntries]    = useState<WeightLog[]>([]);
  const [logging,    setLogging]    = useState(false);
  const [input,      setInput]      = useState('');
  const [goalType,   setGoalType]   = useState<WeightGoal>(() => getWeightGoalType());
  const [progressMsg, setProgressMsg] = useState<{ text: string; positive: boolean } | null>(null);

  const load = useCallback(async () => {
    const all = await db.weight_logs.orderBy('date').reverse().limit(30).toArray();
    setEntries(all.reverse());
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleGoalChange(g: WeightGoal) { setGoalType(g); saveWeightGoalType(g); }

  const latest    = entries[entries.length - 1];
  const prev      = entries[entries.length - 2];
  const display   = (kg: number) => units === 'imperial' ? (kg * 2.20462).toFixed(1) : kg.toFixed(1);
  const unitLabel = units === 'imperial' ? 'lbs' : 'kg';
  const sparkVals = entries.slice(-14).map(e => units === 'imperial' ? e.weightKg * 2.20462 : e.weightKg);
  const cfg       = GOAL_CONFIG[goalType];

  const diffFromPrev = latest && prev ? (latest.weightKg - prev.weightKg) : null;
  const dispDiff     = diffFromPrev !== null
    ? (units === 'imperial' ? Math.abs(diffFromPrev * 2.20462).toFixed(1) : Math.abs(diffFromPrev).toFixed(1))
    : null;
  const trendUp = diffFromPrev !== null && diffFromPrev > 0.05;
  const trendDown = diffFromPrev !== null && diffFromPrev < -0.05;

  async function handleLog() {
    const v = parseFloat(input);
    if (isNaN(v) || v < 20 || v > 400) return;
    const kg = units === 'imperial' ? v / 2.20462 : v;
    const today = new Date().toISOString().split('T')[0];
    const existing = await db.weight_logs.where('date').equals(today).first();
    const loggedAt = new Date().toISOString();
    const isNewLog = !existing;
    let syncId = existing?.sync_id;

    if (existing?.id) {
      await db.weight_logs.update(existing.id, { weightKg: kg, logged_at: loggedAt });
    } else {
      syncId = crypto.randomUUID();
      await db.weight_logs.add({ sync_id: syncId, date: today, weightKg: kg, logged_at: loggedAt });
    }
    if (getSyncToken() && syncId) {
      syncWeightLog({ id: syncId, weight_kg: kg, date: today, logged_at: loggedAt }).catch(() => {});
    }
    grantDailyXP('LOG_WEIGHT');
    if (isNewLog && latest) {
      const diff = kg - latest.weightKg;
      const d = units === 'imperial' ? Math.abs(diff * 2.20462).toFixed(1) : Math.abs(diff).toFixed(1);
      let msg = '';
      if (goalType === 'lose' && diff < -0.05)        { grantXP('weight_progress_today', 10); msg = `↓${d}${unitLabel} toward goal +10 XP 🎯`; }
      else if (goalType === 'gain' && diff > 0.05)    { grantXP('weight_progress_today', 10); msg = `↑${d}${unitLabel} toward goal +10 XP 💪`; }
      else if (goalType === 'maintain' && Math.abs(diff) < 0.4) { grantXP('weight_progress_today', 5); msg = `Maintaining well +5 XP ✓`; }
      else if (goalType === 'lose' && diff > 0.3)     { msg = `Weight up — stay disciplined. +5 XP for logging.`; }
      else if (goalType === 'gain' && diff < -0.3)    { msg = `Weight down — eat more. +5 XP for logging.`; }
      if (msg) setProgressMsg({ text: msg, positive: msg.includes('+10') || msg.includes('✓') });
    }
    setLogging(false); setInput(''); load();
  }

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 22,
      border: `1.5px solid ${cfg.color}28`,
      boxShadow: `0 0 40px ${cfg.color}14, var(--inner-glow)`,
      padding: '20px', marginBottom: 12, position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient top-right glow */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 150, height: 150,
        borderRadius: '50%', background: `radial-gradient(circle, ${cfg.color}22 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Goal selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(Object.entries(GOAL_CONFIG) as [WeightGoal, typeof cfg][]).map(([key, c]) => (
          <button key={key} onClick={() => handleGoalChange(key)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 12,
            border: `1px solid ${goalType === key ? c.color + '55' : 'var(--edge)'}`,
            background: goalType === key ? c.color + '16' : 'var(--surf2)',
            color: goalType === key ? c.color : 'var(--muted)',
            fontSize: 11, fontWeight: 800, cursor: 'pointer',
            transition: 'all 0.18s',
            boxShadow: goalType === key ? `0 0 14px ${c.color}22` : 'none',
          }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{c.emoji}</div>
            <div>{c.desc}</div>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            Body Weight
          </div>
          {latest ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontSize: 52, fontWeight: 900, color: cfg.color,
                  letterSpacing: -2.5, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: `0 0 30px ${cfg.color}44`,
                }}>
                  {display(latest.weightKg)}
                </span>
                <span style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 700 }}>{unitLabel}</span>
              </div>
              {dispDiff && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: trendDown ? '#22C55E' : trendUp ? RED_COLOR : 'var(--muted)',
                  }}>
                    {trendUp ? '↑' : trendDown ? '↓' : '→'} {dispDiff}{unitLabel}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>vs last</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Log your first weigh-in today<br />
              <span style={{ color: cfg.color, fontWeight: 700 }}>+5 XP</span> for logging
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          {sparkVals.length >= 2 && <Sparkline values={sparkVals} color={cfg.color} width={110} height={48} />}
          <button
            onClick={() => { setLogging(l => !l); setInput(latest ? display(latest.weightKg) : ''); setProgressMsg(null); }}
            style={{
              padding: '8px 16px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: logging ? cfg.color + '22' : 'var(--surf2)',
              border: `1px solid ${logging ? cfg.color + '55' : 'var(--edge)'}`,
              color: logging ? cfg.color : 'var(--text)',
              transition: 'all 0.18s',
            }}>
            {logging ? 'Cancel' : latest?.date === new Date().toISOString().split('T')[0] ? '✏️ Update' : '+ Log today'}
          </button>
        </div>
      </div>

      {logging && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <input
            autoFocus type="number" step="0.1" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLog(); }}
            placeholder={`Weight in ${unitLabel}`}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 14,
              background: 'var(--surf2)', border: `1.5px solid ${cfg.color}44`,
              color: 'var(--text)', fontSize: 18, fontFamily: 'inherit',
              outline: 'none', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
            }}
          />
          <button onClick={handleLog} style={{
            padding: '12px 20px', borderRadius: 14,
            background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}CC)`,
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: `0 4px 16px ${cfg.color}44`,
          }}>Save +5 XP</button>
        </div>
      )}

      {progressMsg && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 12,
          background: progressMsg.positive ? 'rgba(34,197,94,0.10)' : 'rgba(251,146,60,0.10)',
          border: `1px solid ${progressMsg.positive ? 'rgba(34,197,94,0.28)' : 'rgba(251,146,60,0.28)'}`,
          fontSize: 12, fontWeight: 600,
          color: progressMsg.positive ? '#22C55E' : '#FB923C',
        }}>
          {progressMsg.text}
        </div>
      )}
    </div>
  );
}

// ─── Water section ────────────────────────────────────────────────────────────
function WaterSection() {
  const today = new Date().toISOString().split('T')[0];
  const [total,     setTotal]     = useState(0);
  const [goal,      setGoal]      = useState(getWaterGoal);
  const [editGoal,  setEditGoal]  = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [showLog,   setShowLog]   = useState(false);
  const [desc,      setDesc]      = useState('');
  const [parsed,    setParsed]    = useState<{ ml: number; label: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [t, logs] = await Promise.all([getWaterTotal(today), getWaterLogs(today)]);
    setTotal(t); setWaterLogs(logs);
  }, [today]);
  useEffect(() => {
    reload();
    window.addEventListener('fs_water_updated', reload);
    return () => window.removeEventListener('fs_water_updated', reload);
  }, [reload]);

  const pct    = goal > 0 ? Math.min(total / goal, 1) : 0;
  const over   = total > goal && goal > 0;
  const color  = over ? RED_COLOR : BODY_COLOR;
  const liters = (total / 1000).toFixed(1);
  const goalL  = (goal  / 1000).toFixed(1);

  // 8 glass segments
  const segments = 8;
  const filled = Math.round(pct * segments);

  const notifyWater = () => window.dispatchEvent(new CustomEvent('fs_water_updated'));
  async function add(ml: number) { await addWater(today, ml); reload(); notifyWater(); if (total + ml >= goal) grantDailyXP('HIT_WATER'); }
  async function undo() { await removeLastWater(today); reload(); notifyWater(); }
  async function handleDelete(id: number) { await removeWaterById(id); reload(); notifyWater(); }
  function saveGoal() {
    const v = parseInt(goalInput, 10);
    if (v >= 500 && v <= 8000) { setGoal(v); setWaterGoal(v); }
    setEditGoal(false);
  }
  async function analyze() {
    if (!desc.trim()) return;
    setAiError(null);
    const local = parseWaterDescription(desc.trim());
    if (local) { setParsed(local); return; }
    setAnalyzing(true);
    try { setParsed(await parseWaterAI(desc.trim())); }
    catch { setAiError('Could not estimate — try "2 glasses", "500ml bottle", etc.'); }
    finally { setAnalyzing(false); }
  }
  async function logFromAI() {
    if (!parsed) return;
    await addWater(today, parsed.ml, parsed.label);
    setDesc(''); setParsed(null); setAiError(null);
    reload(); notifyWater();
    if (total + parsed.ml >= goal) grantDailyXP('HIT_WATER');
  }
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 22,
      border: `1.5px solid ${over ? 'rgba(239,68,68,0.25)' : 'rgba(14,165,233,0.18)'}`,
      boxShadow: `0 0 40px ${over ? 'rgba(239,68,68,0.10)' : 'rgba(14,165,233,0.10)'}, var(--inner-glow)`,
      padding: '20px', marginBottom: 12, position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 130, height: 130,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${over ? 'rgba(239,68,68,0.18)' : 'rgba(14,165,233,0.18)'} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            Hydration
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{
              fontSize: 52, fontWeight: 900, color,
              letterSpacing: -2.5, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              textShadow: `0 0 30px ${over ? 'rgba(239,68,68,0.4)' : 'rgba(14,165,233,0.4)'}`,
            }}>{liters}</span>
            <div>
              <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>litres</div>
              <div style={{ fontSize: 11, color: 'var(--muted2)' }}>of {goalL}L</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {waterLogs.length > 0 && (
            <button onClick={() => setShowLog(s => !s)} style={{
              background: showLog ? 'rgba(14,165,233,0.15)' : 'var(--surf2)',
              border: `1px solid ${showLog ? 'rgba(14,165,233,0.35)' : 'var(--edge)'}`,
              borderRadius: 99, padding: '5px 10px', fontSize: 11, fontWeight: 700,
              color: showLog ? BODY_COLOR : 'var(--muted)', cursor: 'pointer',
            }}>
              {showLog ? 'Hide' : `Log (${waterLogs.length})`}
            </button>
          )}
          {total > 0 && (
            <button onClick={undo} style={{
              background: 'var(--surf2)', border: '1px solid var(--edge)',
              borderRadius: 99, padding: '5px 10px', fontSize: 11, fontWeight: 700,
              color: 'var(--muted)', cursor: 'pointer',
            }}>↩</button>
          )}
          <button onClick={() => { setEditGoal(g => !g); setGoalInput(String(goal)); }} style={{
            background: 'var(--surf2)', border: '1px solid var(--edge)',
            borderRadius: 99, padding: '5px 10px', fontSize: 11, fontWeight: 700,
            color: 'var(--muted)', cursor: 'pointer',
          }}>Goal</button>
        </div>
      </div>

      {/* Goal editor */}
      {editGoal && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input autoFocus type="number" value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGoal(); }}
            placeholder="Daily goal (ml)"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 12,
              background: 'var(--surf2)', border: '1px solid var(--edge2)',
              color: 'var(--text)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={saveGoal} style={{
            padding: '10px 18px', borderRadius: 12,
            background: BODY_COLOR, border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Save</button>
        </div>
      )}

      {/* Glass segments */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 8, borderRadius: 4,
            background: i < filled ? color : 'var(--edge2)',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
            boxShadow: i < filled ? `0 0 8px ${over ? 'rgba(239,68,68,0.5)' : 'rgba(14,165,233,0.5)'}` : 'none',
          }} />
        ))}
      </div>

      {/* Log entries */}
      {showLog && waterLogs.length > 0 && (
        <div style={{ marginBottom: 14, background: 'var(--surf2)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--edge)' }}>
          {waterLogs.map((log, i) => (
            <div key={log.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 14px',
              borderBottom: i < waterLogs.length - 1 ? '1px solid var(--edge)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, width: 40 }}>{formatTime(log.logged_at)}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: BODY_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                  {log.ml >= 1000 ? `${(log.ml / 1000).toFixed(2).replace(/\.?0+$/, '')}L` : `${log.ml}ml`}
                </span>
                {log.note && <span style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.note}</span>}
              </div>
              <button onClick={() => handleDelete(log.id!)} style={{ background: 'none', border: 'none', color: RED_COLOR, cursor: 'pointer', padding: '4px 6px', opacity: 0.6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick add */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {[200, 300, 500, 750, 1000].map(ml => (
          <button key={ml} onClick={() => add(ml)} className="press" style={{
            padding: '8px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.25)', color: BODY_COLOR,
            transition: 'all 0.15s',
          }}>+{ml >= 1000 ? '1L' : `${ml}ml`}</button>
        ))}
      </div>

      {/* AI describe */}
      <div style={{ background: 'var(--surf2)', borderRadius: 14, padding: '14px', border: '1px solid var(--edge)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
          AI Describe Your Intake
        </div>
        <textarea
          placeholder='"walked to class with a 500ml bottle, 2 glasses at lunch, coffee…"'
          value={desc}
          onChange={e => { setDesc(e.target.value); setParsed(null); setAiError(null); }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyze(); }}
          rows={2}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: '1px solid var(--edge2)', background: 'var(--surf)', color: 'var(--text)',
            fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box',
            lineHeight: 1.5, fontFamily: 'inherit',
          }}
        />
        {parsed && (
          <div style={{ margin: '8px 0 0', padding: '10px 14px', borderRadius: 10, background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: BODY_COLOR }}>{parsed.ml}ml estimated</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{parsed.label}</div>
          </div>
        )}
        {aiError && <div style={{ fontSize: 12, color: RED_COLOR, marginTop: 6 }}>{aiError}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={parsed ? logFromAI : analyze}
            disabled={analyzing || !desc.trim()}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 12, border: 'none',
              background: analyzing || !desc.trim() ? 'var(--edge2)' : BODY_COLOR,
              color: analyzing || !desc.trim() ? 'var(--muted)' : '#fff',
              fontWeight: 700, fontSize: 13, cursor: analyzing || !desc.trim() ? 'default' : 'pointer',
              transition: 'all 0.2s',
            }}>
            {analyzing ? 'Estimating…' : parsed ? '+ Log it' : '✨ Estimate with AI'}
          </button>
          {parsed && (
            <button onClick={() => { setParsed(null); setDesc(''); }} style={{
              padding: '10px 16px', borderRadius: 12,
              border: '1px solid var(--edge)', background: 'none',
              color: 'var(--muted)', fontSize: 13, cursor: 'pointer',
            }}>Clear</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sleep section ────────────────────────────────────────────────────────────
function SleepSection() {
  const today = new Date().toISOString().split('T')[0];
  const [entry,   setEntry]   = useState<Awaited<ReturnType<typeof getSleep>>>(null);
  const [hours,   setHours]   = useState(7.5);
  const [quality, setQuality] = useState<1|2|3|4|5>(3);
  const [editing, setEditing] = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    getSleep(today).then(s => {
      if (s) { setEntry(s); setHours(s.hours); setQuality(s.quality); }
      else setEditing(true);
    });
  }, [today]);

  async function handleSave() {
    await logSleep(today, hours, quality);
    grantDailyXP('LOG_SLEEP');
    const s = await getSleep(today);
    setEntry(s); setEditing(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const qColor = sleepQualityColor(quality);
  const STARS  = ['😴', '😔', '😐', '😊', '⭐'];

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 22,
      border: `1.5px solid ${MOON_COLOR}25`,
      boxShadow: `0 0 40px ${MOON_COLOR}12, var(--inner-glow)`,
      padding: '20px', marginBottom: 12, position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 120, height: 120,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${MOON_COLOR}22 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 11,
            background: `${MOON_COLOR}18`, border: `1px solid ${MOON_COLOR}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }}>🌙</div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Sleep
            </div>
          </div>
        </div>
        {entry && !editing && (
          <button onClick={() => setEditing(true)} style={{
            padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: `${MOON_COLOR}18`, border: `1px solid ${MOON_COLOR}35`, color: MOON_COLOR,
          }}>Edit</button>
        )}
      </div>

      {!editing && entry ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{
                fontSize: 52, fontWeight: 900, color: MOON_COLOR,
                letterSpacing: -2.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                textShadow: `0 0 30px ${MOON_COLOR}44`,
              }}>{entry.hours.toFixed(1)}</span>
              <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 700 }}>hrs</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: sleepQualityColor(entry.quality), marginTop: 5 }}>
              {sleepQualityLabel(entry.quality)}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {/* Quality dots */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: i <= entry.quality ? sleepQualityColor(entry.quality) : 'var(--edge2)',
                  boxShadow: i <= entry.quality ? `0 0 6px ${sleepQualityColor(entry.quality)}` : 'none',
                  transition: 'all 0.2s',
                }} />
              ))}
            </div>
            {/* Duration bar */}
            <div style={{ height: 6, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: `linear-gradient(90deg, ${MOON_COLOR}99, ${MOON_COLOR})`,
                width: `${Math.min((entry.hours / 10) * 100, 100)}%`,
                transition: 'width 0.7s var(--ease)',
              }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>8h target</div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Hours slept</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: MOON_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                {hours.toFixed(1)}h
              </span>
            </div>
            <input type="range" min={0} max={12} step={0.5} value={hours}
              onChange={e => setHours(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: MOON_COLOR, height: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--muted2)' }}>0h</span>
              <span style={{ fontSize: 10, color: 'var(--muted2)' }}>12h</span>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>Quality</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([1,2,3,4,5] as const).map(q => (
                <button key={q} onClick={() => setQuality(q)} style={{
                  flex: 1, padding: '10px 4px', borderRadius: 12,
                  border: `1.5px solid ${quality >= q ? sleepQualityColor(q) + '55' : 'var(--edge)'}`,
                  background: quality >= q ? sleepQualityColor(q) + '18' : 'var(--surf2)',
                  cursor: 'pointer', fontSize: 18, lineHeight: 1,
                  boxShadow: quality >= q ? `0 0 10px ${sleepQualityColor(q)}22` : 'none',
                  transition: 'all 0.15s',
                }}>
                  {quality >= q ? '⭐' : '☆'}
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: qColor, fontWeight: 700 }}>
              {sleepQualityLabel(quality)}
            </div>
          </div>

          <button onClick={handleSave} style={{
            width: '100%', padding: '14px', borderRadius: 14,
            background: `linear-gradient(135deg, ${MOON_COLOR}, ${MOON_COLOR}BB)`,
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: `0 4px 20px ${MOON_COLOR}44`,
          }}>
            {saved ? '✓ Saved! +8 XP' : '💤 Log sleep +8 XP'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BodyScreen() {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 100 }}>
      <div style={{ padding: '20px 16px 0' }}>
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
            {dateStr}
          </div>
          <div style={{
            fontSize: 34, fontWeight: 900, letterSpacing: -1.2,
            background: 'linear-gradient(135deg, var(--c-body), var(--prot))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Body</div>
        </div>

        <WeightSection />
        <WaterSection />
        <SleepSection />
      </div>
    </div>
  );
}
