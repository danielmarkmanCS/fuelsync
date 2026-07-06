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
  const [notifPerm,   setNotifPerm]   = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const load = useCallback(async () => {
    const [all, log] = await Promise.all([
      db.supplements.toArray(),
      db.supplement_logs.where('date').equals(today).toArray(),
    ]);
    setSupplements(all.filter(s => s.active !== false));
    setLogs(log);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const isTaken   = (id: number) => logs.some(l => l.supplement_id === id && l.taken);
  const isSkipped = (id: number) => logs.some(l => l.supplement_id === id && l.skipped && !l.taken);

  const toggleSkipped = async (supp: Supplement) => {
    const id = supp.id!;
    const existing = logs.find(l => l.supplement_id === id);
    const now = new Date().toISOString();
    if (existing) {
      const newSkipped = !existing.skipped;
      await db.supplement_logs.update(existing.id!, { skipped: newSkipped, taken: false, logged_at: now });
    } else {
      const syncId = crypto.randomUUID();
      await db.supplement_logs.add({ sync_id: syncId, supplement_id: id, date: today, taken: false, skipped: true, logged_at: now });
    }
    load();
  };

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

  const takenCount   = supplements.filter(s => isTaken(s.id!)).length;
  const skippedCount = supplements.filter(s => isSkipped(s.id!)).length;
  const allDone      = supplements.length > 0 && (takenCount + skippedCount) === supplements.length;

  const handleEnableReminders = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') {
      // Schedule one notification per timing group based on time-of-day
      const TIMING_HOURS: Record<Supplement['timing'], number> = {
        morning: 8, 'pre-workout': 13, 'post-workout': 15, evening: 20, anytime: 12,
      };
      const timingsPresent = [...new Set(supplements.map(s => s.timing))];
      for (const timing of timingsPresent) {
        const hour = TIMING_HOURS[timing];
        const now = new Date();
        const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0);
        if (fire <= now) fire.setDate(fire.getDate() + 1);
        const delay = fire.getTime() - now.getTime();
        setTimeout(() => {
          const suppsForTiming = supplements.filter(s => s.timing === timing && !isTaken(s.id!));
          if (suppsForTiming.length === 0) return;
          new Notification('Supplement reminder', {
            body: suppsForTiming.map(s => `${s.name} ${s.dose}${s.unit}`).join(', '),
            icon: '/icons/icon-192.png',
            tag: `supp-${timing}`,
          });
        }, delay);
      }
      setSyncMsg('✓ Reminders enabled for today');
      setTimeout(() => setSyncMsg(''), 3000);
    }
  };

  // Show congrats once per calendar day when all supplements are marked
  useEffect(() => {
    if (!allDone) return;
    const key = `fs_supp_congrats_${today}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setShowCongrats(true);
    }
  }, [allDone, today]);

  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  const handleToggleTaken = async (s: Supplement) => {
    const wasUntaken = !isTaken(s.id!);
    if (wasUntaken) setCheckedIds(prev => new Set(prev).add(s.id!));
    await toggleTaken(s);
    if (wasUntaken) setTimeout(() => setCheckedIds(prev => { const n = new Set(prev); n.delete(s.id!); return n; }), 400);
  };

  const takenPct = supplements.length ? (takenCount / supplements.length) * 100 : 0;

  return (
    <div style={{ minHeight: '100%', background: BG, padding: '16px 16px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: syncMsg ? 10 : 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: -0.5 }}>Supplements</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: takenCount > 0 ? ACCENT : MUTED }}>{takenCount}</span>
            <span style={{ color: MUTED }}> of {supplements.length} taken today</span>
            {skippedCount > 0 && <span style={{ marginLeft: 6, color: '#FBBF24' }}>· {skippedCount} skipped</span>}
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
          {typeof Notification !== 'undefined' && notifPerm !== 'granted' && supplements.length > 0 && (
            <button onClick={handleEnableReminders} title="Enable reminders"
              style={{ background: 'none', border: `1px solid ${EDGE}`, borderRadius: 8, padding: '7px 10px', color: MUTED, fontSize: 13, cursor: 'pointer' }}>
              🔔
            </button>
          )}
          {notifPerm === 'granted' && <span title="Reminders on" style={{ fontSize: 14 }}>🔔</span>}
          <button
            onClick={() => { setAdding(true); setEditId(null); setName(''); setDose(''); setUnit('mg'); setTiming('morning'); }}
            style={{
              background: ACCENT, border: 'none', borderRadius: 12, padding: '9px 16px',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(157,126,255,0.30)',
            }}
          >+ Add</button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div style={{
          marginBottom: 14, padding: '8px 12px', borderRadius: 10,
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
          <div style={{ height: 4, background: EDGE, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: `linear-gradient(90deg, ${ACCENT}, var(--accent-dim))`,
              boxShadow: '0 0 10px rgba(157,126,255,0.35)',
              width: `${takenPct}%`,
              transition: 'width 0.45s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
        </div>
      )}

      {/* Supplement list grouped by timing */}
      {TIMINGS.filter(t => supplements.some(s => s.timing === t)).map(t => (
        <div key={t} style={{ marginBottom: 20 }}>
          {/* Timing group header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: MUTED, whiteSpace: 'nowrap' }}>
              {TIMING_LABEL[t]}
            </div>
            <div style={{ flex: 1, height: 1, background: EDGE }} />
          </div>
          <div style={{ background: SURF, borderRadius: 18, overflow: 'hidden', border: `1px solid ${EDGE}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            {supplements.filter(s => s.timing === t).map((s, i, arr) => {
              const taken   = isTaken(s.id!);
              const skipped = isSkipped(s.id!);
              const popping = checkedIds.has(s.id!);
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', padding: '0 16px', gap: 14,
                  minHeight: 72,
                  borderBottom: i < arr.length - 1 ? `1px solid ${EDGE}` : 'none',
                  opacity: skipped ? 0.5 : 1,
                  transition: 'opacity 0.2s ease',
                }}>
                  {/* Circle checkbox with pop animation */}
                  <button
                    onClick={() => handleToggleTaken(s)}
                    className={popping ? 'check-pop' : ''}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${taken ? ACCENT : skipped ? '#FBBF24' : 'var(--edge2)'}`,
                      background: taken ? ACCENT : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.18s ease, border-color 0.18s ease',
                      boxShadow: taken ? '0 0 10px rgba(157,126,255,0.30)' : 'none',
                    }}
                  >
                    {taken && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    {skipped && !taken && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="2" y1="5" x2="8" y2="5" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round"/></svg>}
                  </button>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 500, color: taken ? MUTED : TEXT,
                      transition: 'color 0.2s ease',
                      textDecoration: taken ? 'line-through' : skipped ? 'line-through' : 'none',
                      opacity: taken ? 0.5 : 1,
                    }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                      {s.dose} {s.unit}
                      {skipped && <span style={{ marginLeft: 6, color: '#FBBF24', fontWeight: 700 }}>· Skipped</span>}
                    </div>
                  </div>

                  {/* Time chip + actions */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: MUTED,
                      background: 'var(--surf2)', borderRadius: 6, padding: '3px 7px',
                      border: `1px solid ${EDGE}`,
                    }}>
                      {TIMING_LABEL[t].split('-')[0]}
                    </span>
                    <button
                      onClick={() => toggleSkipped(s)}
                      title={skipped ? 'Undo skip' : 'Skip today'}
                      style={{ background: skipped ? '#FBBF2418' : 'none', border: skipped ? '1px solid #FBBF2430' : 'none', borderRadius: 6, color: skipped ? '#FBBF24' : MUTED, cursor: 'pointer', fontSize: 13, padding: '4px 7px' }}
                    >
                      {skipped ? '↩' : '–'}
                    </button>
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
            background: SURF, borderRadius: '20px 20px 0 0', padding: '24px 20px 40px',
            width: '100%', maxWidth: 480,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT, marginBottom: 20 }}>
              {editId != null ? 'Edit Supplement' : 'Add Supplement'}
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 6 }}>Name</div>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Creatine, Vitamin D…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 8, border: `1.5px solid ${name ? ACCENT : EDGE}`, background: BG, color: TEXT, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>

            {/* Dose + Unit */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 6 }}>Dose</div>
                <input
                  value={dose} onChange={e => setDose(e.target.value)}
                  placeholder="5"
                  type="number" min="0"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 8, border: `1.5px solid ${dose ? ACCENT : EDGE}`, background: BG, color: TEXT, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 6 }}>Unit</div>
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
              <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 10 }}>
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

      {/* ── Full-screen celebration — all supplements done ── */}
      {showCongrats && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(16px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 32px',
        }} onClick={() => setShowCongrats(false)}>
          <div className="celeb-in" style={{ textAlign: 'center', maxWidth: 360, width: '100%' }} onClick={e => e.stopPropagation()}>
            {/* Glow ring */}
            <div style={{
              width: 120, height: 120, borderRadius: '50%', margin: '0 auto 28px',
              background: 'var(--accent-muted)',
              border: '2px solid var(--accent)',
              boxShadow: '0 0 40px rgba(157,126,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 52,
            }}>🔥</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: TEXT, letterSpacing: -1, marginBottom: 12 }}>
              All done!
            </div>
            <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.7, marginBottom: 36 }}>
              Every supplement logged. Consistency compounds — this is what separates good athletes from elite ones.
            </div>
            <button
              onClick={() => setShowCongrats(false)}
              style={{
                width: '100%', height: 52, borderRadius: 14,
                background: ACCENT, border: 'none',
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(157,126,255,0.35)',
              }}
            >Keep going 💪</button>
          </div>
        </div>
      )}
    </div>
  );
}
