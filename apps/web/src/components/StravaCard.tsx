import { useState, useEffect } from 'react';
import { getStravaStats, getStravaAuthUrl, disconnectStrava } from '../api/strava';
import { useNutritionStore } from '../store/nutritionStore';
import { shareRunCard } from '../utils/runShareCard';
import type { StravaStats, StravaRun } from '../api/strava';

const STRAVA = '#FC4C02';
const RED    = '#FF1C1C';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function RunRow({ run, onLogged }: { run: StravaRun; onLogged: (id: number) => void }) {
  const addRunKm  = useNutritionStore((s) => s.addRunKm);
  const [logged,  setLogged]  = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleLog = () => { addRunKm(run.distanceKm); setLogged(true); onLogged(run.id); };

  const handleShare = async () => {
    setSharing(true);
    try { await shareRunCard(run); } catch { /* user cancelled */ } finally { setSharing(false); }
  };

  return (
    <div style={{
      background: '#141414', borderRadius: 12,
      padding: 14, marginBottom: 10,
      border: '1px solid #1E1E1E',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `${STRAVA}15`, border: `1px solid ${STRAVA}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 16 }}>🏃</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {run.name}
          </div>
          <div style={{ color: '#333', fontSize: 11, marginTop: 2 }}>{formatDate(run.date)}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: STRAVA, fontSize: 18, fontWeight: 900, letterSpacing: -0.5 }}>{run.distanceKm}</div>
          <div style={{ color: '#333', fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>KM</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: run.pace,             color: '#06b6d4' },
          { label: run.duration,         color: '#a855f7' },
          { label: `↑${run.elevationM}m`, color: '#22c55e' },
          ...(run.hrAvg ? [{ label: `${run.hrAvg}bpm`, color: RED }] : []),
        ].map(({ label, color }, i) => (
          <div key={i} style={{
            background: `${color}10`, border: `1px solid ${color}25`,
            borderRadius: 6, padding: '3px 8px',
            color, fontSize: 11, fontWeight: 700,
          }}>{label}</div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleLog} disabled={logged} style={{
          flex: 1, padding: '9px 0', borderRadius: 8,
          background: logged ? 'rgba(34,197,94,0.08)' : 'rgba(255,28,28,0.08)',
          color: logged ? '#22c55e' : RED,
          fontWeight: 700, fontSize: 11, letterSpacing: 1,
          cursor: logged ? 'default' : 'pointer',
          border: `1px solid ${logged ? 'rgba(34,197,94,0.2)' : 'rgba(255,28,28,0.2)'}`,
          transition: 'all 0.2s',
        }}>
          {logged ? '✓ LOGGED' : '+ LOG RUN'}
        </button>
        <button onClick={handleShare} disabled={sharing} style={{
          flex: 1, padding: '9px 0', borderRadius: 8,
          border: `1px solid ${STRAVA}25`,
          background: `${STRAVA}10`, color: STRAVA,
          fontWeight: 700, fontSize: 11, letterSpacing: 1,
          cursor: sharing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {sharing ? '…' : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              SHARE
            </>
          )}
        </button>
      </div>
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
      .then((d) => { if (d.connected) setData(d as StravaStats); else setNotConnected(true); })
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
    <div style={{ background: '#141414', borderRadius: 14, padding: 16, border: '1px solid #1E1E1E' }}>
      <div style={{ color: '#2A2A2A', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>STRAVA</div>
      <div style={{ color: '#222', fontSize: 12, marginTop: 8 }}>Loading…</div>
    </div>
  );

  if (notConnected) return (
    <div style={{
      background: '#141414', borderRadius: 14, padding: 16,
      border: '1px solid #1E1E1E', borderTop: `2px solid ${STRAVA}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill={STRAVA}>
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        <div style={{ color: '#444', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>STRAVA</div>
      </div>
      <div style={{ color: '#444', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
        Connect Strava to log runs directly into FuelSync and share them to Instagram.
      </div>
      {connectErr && (
        <div style={{ color: RED, fontSize: 12, marginBottom: 10, padding: '8px 12px', background: 'rgba(255,28,28,0.06)', borderRadius: 8, border: '1px solid rgba(255,28,28,0.15)' }}>
          {connectErr}
        </div>
      )}
      <button onClick={handleConnect} disabled={connecting} style={{
        width: '100%', padding: 13, borderRadius: 10, border: 'none',
        background: connecting ? '#1A1A1A' : STRAVA,
        color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: 1.5,
        cursor: connecting ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        {connecting ? 'Redirecting…' : 'Connect Strava'}
      </button>
    </div>
  );

  if (!data) return null;

  return (
    <div style={{
      background: '#141414', borderRadius: 14, padding: 16,
      border: '1px solid #1E1E1E', borderTop: `2px solid ${STRAVA}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={STRAVA}>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          <div>
            <div style={{ color: '#333', fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>STRAVA</div>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{data.athlete.name}</div>
          </div>
        </div>
        <button onClick={load} style={{
          background: 'none', border: 'none', color: '#333',
          fontSize: 11, cursor: 'pointer', fontWeight: 700, letterSpacing: 1,
        }}>↻ SYNC</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'RUNS', value: data.weekly.runs,     color: STRAVA },
          { label: 'KM',   value: `${data.weekly.km}`, color: '#06b6d4' },
          { label: 'TIME', value: data.weekly.duration, color: '#a855f7' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#0C0C0C', borderRadius: 10,
            padding: '10px 8px', textAlign: 'center',
            border: '1px solid #1E1E1E',
          }}>
            <div style={{ color, fontSize: 18, fontWeight: 900, letterSpacing: -0.5 }}>{value}</div>
            <div style={{ color: '#2A2A2A', fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', background: '#0C0C0C', borderRadius: 10,
        padding: '10px 16px', marginBottom: 16,
        border: '1px solid #1E1E1E', justifyContent: 'space-around',
      }}>
        {[
          { label: 'YTD KM',   value: `${data.ytd.km}`,      color: STRAVA },
          { label: 'YTD RUNS', value: data.ytd.runs,          color: '#555' },
          { label: 'ALL TIME', value: `${data.allTime.km}km`, color: '#333' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ color, fontSize: 15, fontWeight: 900, letterSpacing: -0.5 }}>{value}</div>
            <div style={{ color: '#2A2A2A', fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {data.recentRuns.length > 0 && (
        <div>
          <div style={{ color: '#333', fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>RECENT RUNS</div>
          {data.recentRuns.map((run) => (
            <RunRow key={run.id} run={run} onLogged={(id) => setLoggedIds((s) => new Set([...s, id]))} />
          ))}
        </div>
      )}

      <button onClick={handleDisconnect} style={{
        marginTop: 8, background: 'none', border: 'none',
        color: '#1E1E1E', fontSize: 11, cursor: 'pointer',
        width: '100%', textAlign: 'center',
      }}>Disconnect Strava</button>
    </div>
  );
}
