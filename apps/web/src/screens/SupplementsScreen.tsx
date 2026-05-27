import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/db';
import type { Supplement, SupplementLog } from '../lib/db';
import { getSyncToken, syncSupplement, deleteSyncSupplement, syncSupplementLog, fetchSupplements, fetchSupplementLogs } from '../api/syncClient';

const BG      = 'var(--bg)';
const SURF    = 'var(--surf)';
const EDGE    = 'var(--edge)';
const ACCENT  = 'var(--accent)';
const TEXT    = 'var(--text)';
const MUTED   = 'var(--muted)';
const RED     = '#FF4444';

const TIMINGS: Supplement['timing'][] = ['morning', 'pre-workout', 'post-workout', 'evening', 'anytime'];
const TIMING_LABEL: Record<Supplement['timing'], string> = {
  morning: 'Morning', 'pre-workout': 'Pre-workout', 'post-workout': 'Post-workout',
  evening: 'Evening', anytime: 'Anytime',
};
const COMMON_UNITS = ['mg', 'g', 'IU', 'mcg', 'caps', 'ml', 'tbsp'];

export default function SupplementsScreen() {
  const today = new Date().toISOString().split('T')[0];

  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [logs,        setLogs]        = useState<SupplementLog[]>([]);
  const [adding,      setAdding]      = useState(false);
  const [name,        setName]        = useState('');
  const [dose,        setDose]        = useState('');
  const [unit,        setUnit]        = useState('mg');
  const [timing,      setTiming]      = useState<Supplement['timing']>('morning');
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState('');
  const [editId,      setEditId]      = useState<number | null>(null);
  const [showCongrats, setShowCongrats] = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [syncMsg,     setSyncMsg]     = useState('');

  const load = useCallback(async () => {
    const [all, log] = await Promise.all([
      db.supplements.toArray(),
      db.supplement_logs.where('date').equals(today).toArray(),
    ]);
    setSupplements(all.filter(s => s.active !== false));
    setLogs(log);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const isTaken = (id: number) => logs.some(l => l.supplement_id === id && l.taken);

  const toggleTaken = async (supp: Supplement) => {
    const id = supp.id!;
    const existing = logs.find(l => l.supplement_id === id);
    const now = new Date().toISOString();
    if (existing) {
      const newTaken = !existing.taken;
      await db.supplement_logs.update(existing.id!, { taken: newTaken, logged_at: now });
      if (getSyncToken() && supp.sync_id && existing.sync_id) {
        syncSupplementLog({ id: existing.sync_id, supplement_id: supp.sync_id, date: today, taken: newTaken, logged_at: now }).catch(() => {});
      }
    } else {
      const syncId = crypto.randomUUID();
      await db.supplement_logs.add({ sync_id: syncId, supplement_id: id, date: today, taken: true, logged_at: now });
      if (getSyncToken() && supp.sync_id) {
        syncSupplementLog({ id: syncId, supplement_id: supp.sync_id, date: today, taken: true, logged_at: now }).catch(() => {});
      }
    }
    load();
  };

  const handleSave = async () => {
    if (!name.trim() || !dose.trim()) return;
    setSaving(true); setSaveError('');
    try {
      if (editId != null) {
        const existing = await db.supplements.get(editId);
        const syncId = existing?.sync_id ?? crypto.randomUUID();
        await db.supplements.update(editId, { name: name.trim(), dose: dose.trim(), unit, timing, sync_id: syncId });
        if (getSyncToken()) {
          syncSupplement({ id: syncId, name: name.trim(), dose: dose.trim(), unit, timing, active: true }).catch(() => {});
        }
      } else {
        const syncId = crypto.randomUUID();
        await db.supplements.add({ sync_id: syncId, name: name.trim(), dose: dose.trim(), unit, timing, active: true });
        if (getSyncToken()) {
          syncSupplement({ id: syncId, name: name.trim(), dose: dose.trim(), unit, timing, active: true }).catch(() => {});
        }
      }
      setAdding(false); setEditId(null); setName(''); setDose(''); setUnit('mg'); setTiming('morning');
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save — try closing other tabs and retry.');
      console.error('[Supplements] save failed:', e);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Remove this supplement?')) return;
    const supp = await db.supplements.get(id);
    await db.supplements.update(id, { active: false });
    if (supp?.sync_id && getSyncToken()) {
      deleteSyncSupplement(supp.sync_id).catch(() => {});
    }
    load();
  };

  const startEdit = (s: Supplement) => {
    setEditId(s.id!); setName(s.name); setDose(s.dose); setUnit(s.unit); setTiming(s.timing);
    setAdding(true);
  };

  const handleSync = async () => {
    if (!getSyncToken()) { setSyncMsg('Connect Google account first (Profile tab)'); setTimeout(() => setSyncMsg(''), 3000); return; }
    setSyncing(true); setSyncMsg('');
    try {
      // Push all local supplements that have no sync_id yet
      const localSupps = await db.supplements.toArray();
      for (const ls of localSupps.filter(s => !s.sync_id && s.active !== false)) {
        const syncId = crypto.randomUUID();
        await db.supplements.update(ls.id!, { sync_id: syncId });
        await syncSupplement({ id: syncId, name: ls.name, dose: ls.dose, unit: ls.unit, timing: ls.timing, active: true });
      }
      // Push supplements that have sync_id (keep remote in sync)
      const allLocal = await db.supplements.toArray();
      for (const ls of allLocal.filter(s => s.sync_id && s.active !== false)) {
        await syncSupplement({ id: ls.sync_id!, name: ls.name, dose: ls.dose, unit: ls.unit, timing: ls.timing, active: true }).catch(() => {});
      }
      // Pull from D1 and merge
      type RemoteSupp = { id: string; name: string; dose: string; unit: string; timing: string; active: boolean; deleted_at: string | null };
      const remote = await fetchSupplements() as RemoteSupp[];
      let pulled = 0;
      for (const rs of remote) {
        if (rs.deleted_at) continue;
        const existing = await db.supplements.where('sync_id').equals(rs.id).first();
        if (!existing) {
          await db.supplements.add({ sync_id: rs.id, name: rs.name, dose: rs.dose, unit: rs.unit, timing: rs.timing as Supplement['timing'], active: !!rs.active });
          pulled++;
        }
      }
      // Pull today's supplement logs
      type RemoteSuppLog = { id: string; supplement_id: string; date: string; taken: boolean; logged_at: string };
      const remoteLogs = await fetchSupplementLogs(today) as RemoteSuppLog[];
      for (const rl of remoteLogs) {
        const localSupp = await db.supplements.where('sync_id').equals(rl.supplement_id).first();
        if (!localSupp?.id) continue;
        const existingLog = await db.supplement_logs.where('supplement_id').equals(localSupp.id).and(l => l.date === rl.date).first();
        if (!existingLog) {
          await db.supplement_logs.add({ sync_id: rl.id, supplement_id: localSupp.id, date: rl.date, taken: rl.taken, logged_at: rl.logged_at });
        }
      }
      setSyncMsg(pulled > 0 ? `✓ Synced — ${pulled} new supplement${pulled !== 1 ? 's' : ''} pulled` : '✓ All up to date');
      load();
    } catch (e) {
      setSyncMsg(`⚠ Sync failed: ${e instanceof Error ? e.message : 'network error'}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  const takenCount = supplements.filter(s => isTaken(s.id!)).length;
  const allDone    = supplements.length > 0 && takenCount === supplements.length;

  // Show congrats once per calendar day when all supplements are marked
  useEffect(() => {
    if (!allDone) return;
    const key = `fs_supp_congrats_${today}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setShowCongrats(true);
    }
  }, [allDone, today]);

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '16px 16px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: syncMsg ? 10 : 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: -0.5 }}>Supplements</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            {takenCount}/{supplements.length} taken today
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncing && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          )}
          <button
            onClick={() => { setAdding(true); setEditId(null); setName(''); setDose(''); setUnit('mg'); setTiming('morning'); }}
            style={{
              background: ACCENT, border: 'none', borderRadius: 6, padding: '8px 14px',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >+ Add</button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div style={{
          marginBottom: 14, padding: '8px 12px', borderRadius: 8,
          background: syncMsg.startsWith('⚠') ? `${RED}12` : `${ACCENT}12`,
          border: `1px solid ${syncMsg.startsWith('⚠') ? RED : ACCENT}30`,
          fontSize: 12, fontWeight: 600,
          color: syncMsg.startsWith('⚠') ? RED : ACCENT,
        }}>
          {syncMsg}
        </div>
      )}

      {/* Progress bar */}
      {supplements.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 4, background: EDGE, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: ACCENT, borderRadius: 2,
              width: `${supplements.length ? (takenCount / supplements.length) * 100 : 0}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Supplement list grouped by timing */}
      {TIMINGS.filter(t => supplements.some(s => s.timing === t)).map(t => (
        <div key={t} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            {TIMING_LABEL[t]}
          </div>
          <div style={{ background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
            {supplements.filter(s => s.timing === t).map((s, i, arr) => {
              const taken = isTaken(s.id!);
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 14,
                  borderBottom: i < arr.length - 1 ? `1px solid ${EDGE}` : 'none',
                }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTaken(s)}
                    style={{
                      width: 24, height: 24, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${taken ? ACCENT : EDGE}`,
                      background: taken ? ACCENT : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {taken && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: taken ? MUTED : TEXT, transition: 'color 0.2s' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
                      {s.dose} {s.unit}
                    </div>
                  </div>

                  {/* Edit/delete */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => startEdit(s)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✎</button>
                    <button onClick={() => handleDelete(s.id!)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {supplements.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: MUTED }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.5 }}>
            <path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7"/>
            <circle cx="17" cy="17" r="5"/><path d="M14.5 19.5l5-5"/>
          </svg>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No supplements yet</div>
          <div style={{ fontSize: 12 }}>Tap + Add to track your daily supplements</div>
        </div>
      )}

      {/* Add/Edit modal */}
      {adding && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) { setAdding(false); setEditId(null); } }}>
          <div style={{
            background: SURF, borderRadius: '8px 8px 0 0', padding: '24px 20px 40px',
            width: '100%', maxWidth: 480, border: `1px solid ${EDGE}`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 20 }}>
              {editId != null ? 'Edit Supplement' : 'Add Supplement'}
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Name</div>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Creatine, Vitamin D…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 8, border: `1.5px solid ${name ? ACCENT : EDGE}`, background: BG, color: TEXT, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>

            {/* Dose + Unit */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Dose</div>
                <input
                  value={dose} onChange={e => setDose(e.target.value)}
                  placeholder="5"
                  type="number" min="0"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 8, border: `1.5px solid ${dose ? ACCENT : EDGE}`, background: BG, color: TEXT, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Unit</div>
                <select
                  value={unit} onChange={e => setUnit(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: 8, border: `1.5px solid ${EDGE}`, background: BG, color: TEXT, fontSize: 15, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
                >
                  {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Timing — checkbox list */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                Time of Day
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TIMINGS.map(t => {
                  const sel = timing === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTiming(t)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${sel ? ACCENT : EDGE}`,
                        background: sel ? 'var(--accent-muted)' : BG,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${sel ? ACCENT : EDGE}`,
                        background: sel ? ACCENT : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}>
                        {sel && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <polyline points="2,5 4.5,7.5 8,2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: sel ? 700 : 500,
                        color: sel ? ACCENT : TEXT,
                        transition: 'color 0.15s ease',
                        fontFamily: 'inherit',
                      }}>
                        {TIMING_LABEL[t]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {saveError && (
              <div style={{ color: RED, fontSize: 12, fontWeight: 600, marginBottom: 10, padding: '8px 10px', background: `${RED}15`, borderRadius: 8 }}>
                ⚠️ {saveError}
              </div>
            )}
            <button
              onClick={handleSave} disabled={saving || !name.trim() || !dose.trim()}
              style={{
                width: '100%', padding: '14px', borderRadius: 8,
                background: (!name.trim() || !dose.trim()) ? EDGE : ACCENT,
                border: 'none', color: (!name.trim() || !dose.trim()) ? MUTED : '#fff',
                fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{saving ? 'Saving…' : editId != null ? 'Save Changes' : 'Add Supplement'}</button>
          </div>
        </div>
      )}

      {/* ── Congrats overlay — all supplements taken for the day ── */}
      {showCongrats && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }} onClick={() => setShowCongrats(false)}>
          <div style={{
            background: SURF, borderRadius: 8, padding: '32px 28px',
            border: `1px solid ${ACCENT}`,
            textAlign: 'center', maxWidth: 340, width: '100%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: TEXT, letterSpacing: -0.5, marginBottom: 8 }}>
              All Done!
            </div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBottom: 24 }}>
              Every supplement logged today. Consistency compounds — you're building the habits that separate good athletes from elite ones.
            </div>
            <button
              onClick={() => setShowCongrats(false)}
              style={{
                width: '100%', padding: '13px', borderRadius: 8,
                background: ACCENT, border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Let's Go 💪</button>
          </div>
        </div>
      )}
    </div>
  );
}
