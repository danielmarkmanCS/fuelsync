import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/db';
import type { WeightLog, BodyMeasurement } from '../lib/db';
import { getMeasurements, saveMeasurement } from '../lib/bodyMeasurements';
import { getSleep, logSleep, sleepQualityLabel, sleepQualityColor } from '../lib/sleep';
import { getWaterTotal, getWaterGoal, addWater, removeLastWater, setWaterGoal } from '../lib/waterLog';
import { grantDailyXP } from '../lib/xp';
import { useThemeStore } from '../store/themeStore';

const PROT  = '#1E88E5';
const CARB  = '#43A047';
const RED   = '#E53935';
const PURP  = '#0091EA';
const AMBER = '#FB8C00';

type MeasurementField = 'waist_cm' | 'chest_cm' | 'arms_cm' | 'hips_cm' | 'thighs_cm' | 'neck_cm' | 'body_fat_pct';

const MEASURE_CONFIG: Array<{ key: MeasurementField; label: string; unit: string; color: string; icon: string }> = [
  { key: 'waist_cm',    label: 'Waist',    unit: 'cm', color: AMBER,    icon: '📏' },
  { key: 'chest_cm',    label: 'Chest',    unit: 'cm', color: PROT,     icon: '💪' },
  { key: 'arms_cm',     label: 'Arms',     unit: 'cm', color: '#E65100',icon: '🦾' },
  { key: 'hips_cm',     label: 'Hips',     unit: 'cm', color: '#EC4899',icon: '📐' },
  { key: 'thighs_cm',   label: 'Thighs',   unit: 'cm', color: CARB,     icon: '🦵' },
  { key: 'neck_cm',     label: 'Neck',     unit: 'cm', color: '#7E57C2',icon: '🔵' },
  { key: 'body_fat_pct',label: 'Body Fat', unit: '%',  color: RED,      icon: '🎯' },
];

// Mini SVG sparkline — pure inline, no library
function Sparkline({ values, color, height = 36 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return null;
  const W = 80;
  const H = height;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  });
  const area = `M${pts[0]} ${pts.slice(1).map(p => `L${p}`).join(' ')} L${W - pad},${H - pad} L${pad},${H - pad} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3" fill={color} />
    </svg>
  );
}

function TrendArrow({ cur, prev, color }: { cur: number; prev: number; color: string }) {
  const diff = cur - prev;
  if (Math.abs(diff) < 0.1) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>;
  const up = diff > 0;
  return (
    <span style={{ color: up ? RED : CARB, fontSize: 11, fontWeight: 700 }}>
      {up ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}
    </span>
  );
}

// ── Weight section ────────────────────────────────────────────────────────────
function WeightSection() {
  const units = useThemeStore(s => s.units);
  const [entries, setEntries] = useState<WeightLog[]>([]);
  const [logging, setLogging] = useState(false);
  const [input, setInput]     = useState('');

  const load = useCallback(async () => {
    const all = await db.weight_logs.orderBy('date').reverse().limit(30).toArray();
    setEntries(all.reverse());
  }, []);

  useEffect(() => { load(); }, [load]);

  const latest = entries[entries.length - 1];
  const prev   = entries[entries.length - 2];
  const display = (kg: number) => units === 'imperial' ? (kg * 2.20462).toFixed(1) : kg.toFixed(1);
  const unitLabel = units === 'imperial' ? 'lbs' : 'kg';

  async function handleLog() {
    const v = parseFloat(input);
    if (isNaN(v) || v < 20 || v > 400) return;
    const kg = units === 'imperial' ? v / 2.20462 : v;
    const today = new Date().toISOString().split('T')[0];
    const existing = await db.weight_logs.where('date').equals(today).first();
    if (existing?.id) await db.weight_logs.update(existing.id, { weightKg: kg, logged_at: new Date().toISOString() });
    else await db.weight_logs.add({ date: today, weightKg: kg, logged_at: new Date().toISOString() });
    grantDailyXP('LOG_WEIGHT');
    setLogging(false);
    setInput('');
    load();
  }

  const sparkValues = entries.slice(-14).map(e => units === 'imperial' ? e.weightKg * 2.20462 : e.weightKg);

  return (
    <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '20px 20px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>Body weight</div>
          {latest ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 900, color: PROT, letterSpacing: -2, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {display(latest.weightKg)}
              </span>
              <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>{unitLabel}</span>
            </div>
          ) : (
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--muted2)' }}>—</div>
          )}
          {latest && prev && (
            <div style={{ marginTop: 4 }}>
              <TrendArrow cur={latest.weightKg} prev={prev.weightKg} color={PROT} />
              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>vs last</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {sparkValues.length >= 2 && <Sparkline values={sparkValues} color={PROT} />}
          <button onClick={() => { setLogging(l => !l); setInput(latest ? display(latest.weightKg) : ''); }}
            style={{
              padding: '7px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: logging ? PROT + '22' : 'var(--surf2)', border: `1px solid ${logging ? PROT + '55' : 'var(--edge)'}`,
              color: logging ? PROT : 'var(--text)',
            }}>
            {logging ? 'Cancel' : 'Log weight'}
          </button>
        </div>
      </div>
      {logging && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <input
            autoFocus type="number" step="0.1" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLog(); }}
            placeholder={`Weight in ${unitLabel}`}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 12, background: 'var(--surf2)',
              border: '1px solid var(--edge)', color: 'var(--text)', fontSize: 16, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={handleLog} style={{
            padding: '10px 20px', borderRadius: 12, background: PROT, border: 'none',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>Save</button>
        </div>
      )}
    </div>
  );
}

// ── Measurements section ──────────────────────────────────────────────────────
function MeasurementsSection() {
  const [history, setHistory]     = useState<BodyMeasurement[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<Partial<Record<MeasurementField, string>>>({});
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    const all = await getMeasurements(30);
    setHistory(all);
  }, []);

  useEffect(() => { load(); }, [load]);

  const latest = history[0];
  const prev   = history[1];

  function setField(k: MeasurementField, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const fields: Omit<BodyMeasurement, 'id' | 'date' | 'logged_at'> = {};
    for (const { key } of MEASURE_CONFIG) {
      const v = parseFloat(form[key] ?? '');
      if (!isNaN(v) && v > 0) (fields as unknown as Record<string, number>)[key] = v;
    }
    await saveMeasurement(today, fields);
    grantDailyXP('LOG_MEASUREMENT');
    setSaving(false);
    setShowForm(false);
    setForm({});
    load();
  }

  function getHistory(key: MeasurementField): number[] {
    return history.slice(0, 10).reverse()
      .map(m => (m as unknown as Record<string, number | undefined>)[key] ?? 0)
      .filter(v => v > 0);
  }

  return (
    <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Measurements</div>
        <button onClick={() => {
          setShowForm(f => !f);
          if (!showForm && latest) {
            const f: Partial<Record<MeasurementField, string>> = {};
            for (const { key } of MEASURE_CONFIG) {
              const v = (latest as unknown as Record<string, number | undefined>)[key];
              if (v) f[key] = String(v);
            }
            setForm(f);
          }
        }} style={{
          padding: '7px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          background: showForm ? PURP + '22' : 'var(--surf2)', border: `1px solid ${showForm ? PURP + '55' : 'var(--edge)'}`,
          color: showForm ? PURP : 'var(--text)',
        }}>
          {showForm ? 'Cancel' : latest ? 'Update' : 'Log now'}
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {MEASURE_CONFIG.map(({ key, label, unit, color }) => (
              <div key={key}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label} ({unit})</div>
                <input
                  type="number" step="0.1" value={form[key] ?? ''} onChange={e => setField(key, e.target.value)}
                  placeholder="—"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 10, background: 'var(--surf2)',
                    border: `1px solid ${color}44`, color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>
          <button onClick={handleSave} disabled={saving} style={{
            width: '100%', padding: '12px', borderRadius: 12, background: PURP, border: 'none',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save measurements +10 XP'}
          </button>
        </div>
      )}

      {/* Grid of current values */}
      {!showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {MEASURE_CONFIG.map(({ key, label, unit, color, icon }) => {
            const cur  = latest ? (latest as unknown as Record<string, number | undefined>)[key] : undefined;
            const prv  = prev   ? (prev as unknown as Record<string, number | undefined>)[key] : undefined;
            const hist = getHistory(key);
            return (
              <div key={key} style={{
                background: `${color}0E`, borderRadius: 14, padding: '12px 12px 10px',
                border: `1px solid ${color}25`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{icon} {label}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
                      {cur != null ? cur.toFixed(key === 'body_fat_pct' ? 1 : 1) : '—'}
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)', marginLeft: 2 }}>{unit}</span>
                    </div>
                  </div>
                  {hist.length >= 2 && <Sparkline values={hist} color={color} height={30} />}
                </div>
                {cur != null && prv != null && (
                  <div style={{ marginTop: 4 }}>
                    <TrendArrow cur={cur} prev={prv} color={color} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!showForm && !latest && (
        <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>No measurements logged yet</div>
        </div>
      )}
    </div>
  );
}

// ── Water section ─────────────────────────────────────────────────────────────
function WaterSection() {
  const today = new Date().toISOString().split('T')[0];
  const [total, setTotal] = useState(0);
  const [goal,  setGoal]  = useState(getWaterGoal);
  const [editGoal, setEditGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const reload = useCallback(() => { getWaterTotal(today).then(setTotal); }, [today]);
  useEffect(() => { reload(); }, [reload]);

  const pct   = goal > 0 ? Math.min(total / goal, 1) : 0;
  const over  = total > goal && goal > 0;
  const color = over ? RED : PROT;

  async function add(ml: number) {
    await addWater(today, ml);
    reload();
    if ((total + ml) >= goal) grantDailyXP('HIT_WATER');
  }

  async function undo() { await removeLastWater(today); reload(); }

  function saveGoal() {
    const v = parseInt(goalInput, 10);
    if (v >= 500 && v <= 8000) { setGoal(v); setWaterGoal(v); }
    setEditGoal(false);
  }

  const liters = (total / 1000).toFixed(1);
  const goalL  = (goal / 1000).toFixed(1);
  const segments = 8;
  const filled = Math.round(pct * segments);

  return (
    <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>💧 Hydration</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 900, color, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums' }}>{liters}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>/ {goalL}L</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {total > 0 && (
            <button onClick={undo} style={{ background: 'var(--surf2)', border: '1px solid var(--edge)', borderRadius: 99, padding: '6px 12px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>↩ Undo</button>
          )}
          <button onClick={() => { setEditGoal(g => !g); setGoalInput(String(goal)); }}
            style={{ background: 'var(--surf2)', border: '1px solid var(--edge)', borderRadius: 99, padding: '6px 12px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>Goal</button>
        </div>
      </div>

      {editGoal && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input autoFocus type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGoal(); }}
            placeholder="Daily goal (ml)"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 10, background: 'var(--surf2)', border: '1px solid var(--accent)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          />
          <button onClick={saveGoal} style={{ padding: '8px 16px', borderRadius: 10, background: PROT, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>
      )}

      {/* Segment bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 8, borderRadius: 4,
            background: i < filled ? color : 'var(--edge2)',
            transition: 'background 0.3s ease',
            boxShadow: i < filled ? `0 0 6px ${color}60` : 'none',
          }} />
        ))}
      </div>

      {/* Quick add buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[200, 300, 500, 750, 1000].map(ml => (
          <button key={ml} onClick={() => add(ml)} style={{
            padding: '8px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: `${PROT}18`, border: `1px solid ${PROT}44`, color: PROT,
            transition: 'all 0.15s ease',
          }}>+{ml >= 1000 ? '1L' : `${ml}ml`}</button>
        ))}
      </div>
    </div>
  );
}

// ── Sleep section ─────────────────────────────────────────────────────────────
function SleepSection() {
  const today = new Date().toISOString().split('T')[0];
  const [entry, setEntry]       = useState<Awaited<ReturnType<typeof getSleep>>>(null);
  const [hours, setHours]       = useState(7.5);
  const [quality, setQuality]   = useState<1|2|3|4|5>(3);
  const [editing, setEditing]   = useState(false);
  const [saved, setSaved]       = useState(false);

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
    setEntry(s);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const qColor = sleepQualityColor(quality);
  const MOON   = '#7E57C2';

  return (
    <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>🌙 Sleep</div>
        {entry && !editing && (
          <button onClick={() => setEditing(true)} style={{
            padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: MOON + '22', border: `1px solid ${MOON}44`, color: MOON,
          }}>Edit</button>
        )}
      </div>

      {/* Current value or edit form */}
      {!editing && entry ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 38, fontWeight: 900, color: MOON, letterSpacing: -1.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {entry.hours.toFixed(1)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>hours</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: sleepQualityColor(entry.quality) }}>
              {sleepQualityLabel(entry.quality)}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: i <= entry.quality ? sleepQualityColor(entry.quality) : 'var(--edge2)',
                }} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* Hours slider */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Hours slept</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: MOON, fontVariantNumeric: 'tabular-nums' }}>{hours.toFixed(1)}h</span>
            </div>
            <input type="range" min={0} max={12} step={0.5} value={hours} onChange={e => setHours(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: MOON }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--muted2)' }}>0h</span>
              <span style={{ fontSize: 10, color: 'var(--muted2)' }}>12h</span>
            </div>
          </div>

          {/* Quality stars */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>Quality</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([1,2,3,4,5] as const).map(q => (
                <button key={q} onClick={() => setQuality(q)} style={{
                  flex: 1, padding: '8px 4px', borderRadius: 10, border: `1px solid ${quality >= q ? sleepQualityColor(q) + '55' : 'var(--edge)'}`,
                  background: quality >= q ? sleepQualityColor(q) + '18' : 'var(--surf2)',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1,
                }}>
                  {quality >= q ? '★' : '☆'}
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: qColor, fontWeight: 600 }}>
              {sleepQualityLabel(quality)}
            </div>
          </div>

          <button onClick={handleSave} style={{
            width: '100%', padding: '12px', borderRadius: 12, background: MOON, border: 'none',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            {saved ? '✓ Saved! +5 XP' : 'Log sleep +5 XP'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main BodyScreen ───────────────────────────────────────────────────────────
export default function BodyScreen() {
  return (
    <div style={{ position: 'relative', background: 'var(--bg)', minHeight: '100%', paddingBottom: 100, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '28px 16px 0' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text)', letterSpacing: -1 }}>Body</div>
        </div>

        <WeightSection />
        <MeasurementsSection />
        <WaterSection />
        <SleepSection />
      </div>
    </div>
  );
}
