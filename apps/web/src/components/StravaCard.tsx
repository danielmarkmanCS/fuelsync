import { useState, useEffect, useRef } from 'react';
import { getStravaStats, getStravaAuthUrl, disconnectStrava } from '../api/strava';
import { useNutritionStore } from '../store/nutritionStore';
import { shareRunCard } from '../utils/runShareCard';
import type { StravaStats, StravaRun, StravaData } from '../api/strava';

const STRAVA = '#FC4C02';
const RED    = '#FF3B30';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function RunRow({ run, onLogged }: { run: StravaRun; onLogged: (id: number) => void }) {
  const addRunKm    = useNutritionStore((s) => s.addRunKm);
  const removeRunKm = useNutritionStore((s) => s.removeRunKm);
  const loggedRuns  = useNutritionStore((s) => s.weeklyLoad.loggedRuns ?? []);
  const logged      = loggedRuns.some((r) => r.source === 'strava' && r.km === run.distanceKm && r.name === run.name);
  const [sharing,  setSharing]  = useState(false);
  const [shareOpt, setShareOpt] = useState(false);
  const fileRef    = useRef<HTMLInputElement>(null);

  const handleLog    = () => { addRunKm(run.distanceKm, run.name, 'strava'); onLogged(run.id); };
  const handleUnlog  = () => { removeRunKm(run.distanceKm, run.name); };

  const doShare = async (file?: File | null) => {
    setShareOpt(false);
    setSharing(true);
    try { await shareRunCard(run, file); } catch { /* user cancelled */ } finally { setSharing(false); }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    doShare(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 16px',
        borderLeft: `3px solid ${logged ? '#22c55e' : STRAVA}`,
        borderBottom: shareOpt ? 'none' : '1px solid #F5F5F5',
        background: logged ? 'rgba(34,197,94,0.025)' : 'transparent',
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <div style={{ minWidth: 44, flexShrink: 0 }}>
          <div style={{ color: logged ? '#22c55e' : STRAVA, fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
            {run.distanceKm}
          </div>
          <div style={{ color: '#CCCCCC', fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 1 }}>KM</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#111111', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: -0.2 }}>
            {run.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ color: '#BBBBBB', fontSize: 10 }}>{formatDate(run.date)}</span>
            <span style={{ color: '#E0E0E0', fontSize: 10 }}>·</span>
            <span style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700 }}>{run.pace}</span>
            {run.hrAvg && (
              <>
                <span style={{ color: '#E0E0E0', fontSize: 10 }}>·</span>
                <span style={{ color: RED, fontSize: 10, fontWeight: 700 }}>{run.hrAvg}bpm</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={logged ? handleUnlog : handleLog}
            title={logged ? 'Remove log' : 'Log run'}
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: logged ? 'rgba(34,197,94,0.1)' : `${STRAVA}10`,
              color: logged ? '#22c55e' : STRAVA,
              fontWeight: 800, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            {logged ? '✓' : '+'}
          </button>
          <button
            onClick={() => !sharing && setShareOpt((v) => !v)}
            disabled={sharing}
            title="Share"
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: shareOpt ? STRAVA : `${STRAVA}10`,
              color: shareOpt ? '#fff' : STRAVA,
              cursor: sharing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.18s',
            }}
          >
            {sharing ? '…' : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Share options row */}
      {shareOpt && (
        <div style={{
          display: 'flex', gap: 8,
          padding: '8px 16px 10px',
          borderLeft: `3px solid ${STRAVA}`,
          borderBottom: '1px solid #F5F5F5',
          background: `${STRAVA}05`,
        }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8,
              background: `${STRAVA}10`, border: `1px solid ${STRAVA}25`,
              color: STRAVA, fontWeight: 700, fontSize: 11, letterSpacing: 0.5,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            📷 Add photo
          </button>
          <button
            onClick={() => doShare(null)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8,
              background: 'rgba(0,0,0,0.04)', border: '1px solid #E5E5EA',
              color: '#888888', fontWeight: 700, fontSize: 11, letterSpacing: 0.5,
              cursor: 'pointer',
            }}
          >
            No photo →
          </button>
        </div>
      )}
    </div>
  );
}

export default function StravaCard() {
  const [data,         setData]         = useState<StravaStats | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [connecting,   setConnecting]   = useState(false);
  const [connectErr,   setConnectErr]   = useState('');
  const [loggedIds,    setLoggedIds]    = useState<Set<number>>(new Set());

  const load = () => {
    setLoading(true);
    getStravaStats()
      .then((d: StravaData) => { if (d.connected) setData(d as StravaStats); else setNotConnected(true); })
      .catch(() => setNotConnected(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleConnect = async () => {
    setConnecting(true); setConnectErr('');
    try {
      const { url } = await getStravaAuthUrl();
      window.location.href = url;
    } catch (e: unknown) {
      setConnectErr(e instanceof Error ? e.message : 'Strava not configured yet');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Strava?')) return;
    await disconnectStrava().catch(() => {});
    setData(null); setNotConnected(true);
  };

  if (loading) return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
      <div style={{ color: '#CCCCCC', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>STRAVA</div>
      <div style={{ color: '#DDDDDD', fontSize: 12, marginTop: 6 }}>Loading…</div>
    </div>
  );

  if (notConnected) return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14,
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{ borderLeft: `3px solid ${STRAVA}`, padding: '18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={STRAVA}>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          <div style={{ color: '#BBBBBB', fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>STRAVA</div>
        </div>
        <div style={{ color: '#888888', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          Connect Strava to log runs and share them.
        </div>
        {connectErr && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(255,59,48,0.06)', borderRadius: 8, border: '1px solid rgba(255,59,48,0.15)' }}>
            {connectErr}
          </div>
        )}
        <button onClick={handleConnect} disabled={connecting} style={{
          width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
          background: connecting ? '#F2F2F7' : STRAVA,
          color: connecting ? '#AAAAAA' : '#fff',
          fontWeight: 800, fontSize: 12, letterSpacing: 1.5,
          cursor: connecting ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          {connecting ? 'Redirecting…' : 'Connect Strava'}
        </button>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14,
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* ── Header ─── */}
      <div style={{
        padding: '13px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #F5F5F5',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: `${STRAVA}10`, border: `1px solid ${STRAVA}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill={STRAVA}>
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </div>
          <div>
            <div style={{ color: '#CCCCCC', fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>STRAVA</div>
            <div style={{ color: '#111111', fontSize: 13, fontWeight: 700, letterSpacing: -0.3 }}>{data.athlete.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: STRAVA, fontSize: 18, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>{data.weekly.km}</div>
            <div style={{ color: '#CCCCCC', fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 1 }}>KM WEEK</div>
          </div>
          <button onClick={load} style={{
            background: '#F5F5F5', border: 'none', borderRadius: 8,
            color: '#AAAAAA', fontSize: 11, fontWeight: 700,
            width: 30, height: 30, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>↻</button>
        </div>
      </div>

      {/* ── Run list ─── */}
      {data.recentRuns.length > 0 && (
        <div>
          {data.recentRuns.map((run) => (
            <RunRow key={run.id} run={run} onLogged={(id) => setLoggedIds((s) => new Set([...s, id]))} />
          ))}
        </div>
      )}

      {/* ── Footer ─── */}
      <div style={{
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: data.recentRuns.length > 0 ? 'none' : '1px solid #F5F5F5',
      }}>
        <div style={{ color: '#BBBBBB', fontSize: 10, fontWeight: 600 }}>
          {data.weekly.runs} runs · {data.ytd.km} km YTD
        </div>
        <button onClick={handleDisconnect} style={{
          background: 'none', border: 'none', color: '#DDDDDD',
          fontSize: 10, cursor: 'pointer', fontWeight: 600,
        }}>Disconnect</button>
      </div>
    </div>
  );
}
