import { useState, useEffect, useRef } from 'react';
import { getStravaStats, getStravaAuthUrl, disconnectStrava } from '../api/strava';
import { useNutritionStore } from '../store/nutritionStore';
import { shareRunCard } from '../utils/runShareCard';
import type { StravaStats, StravaRun, StravaData } from '../api/strava';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const STRAVA = '#FC4C02';
const SURF   = '#FFFFFF';
const SURF2  = '#EBF3FF';
const EDGE   = 'rgba(37, 99, 235, 0.12)';
const TEXT   = '#0F172A';
const MUTED  = '#64748B';
const GREEN  = '#16A34A';
const BLUE   = '#2563EB';
const RED    = '#DC2626';
const CARD_SHADOW = '0 2px 12px rgba(37,99,235,0.10), 0 0 0 1px rgba(37,99,235,0.07)';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function parsePaceStr(pace: string): number | undefined {
  // "5:30 /km" → 5.5
  const m = pace.match(/^(\d+):(\d+)/);
  if (!m) return undefined;
  return parseInt(m[1]) + parseInt(m[2]) / 60;
}

function parseDurationStr(dur: string): number | undefined {
  // "45:30" → 45.5, "1:23:45" → 83.75
  const parts = dur.split(':').map(Number);
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return undefined;
}

function RunRow({ run, onLogged }: { run: StravaRun; onLogged: (id: number) => void }) {
  const addRunKm    = useNutritionStore((s) => s.addRunKm);
  const removeRunKm = useNutritionStore((s) => s.removeRunKm);
  const loggedRuns  = useNutritionStore((s) => s.weeklyLoad.loggedRuns ?? []);
  const logged      = loggedRuns.some((r) => r.source === 'strava' && r.km === run.distanceKm && r.name === run.name);
  const [sharing,  setSharing]  = useState(false);
  const [shareOpt, setShareOpt] = useState(false);
  const fileRef    = useRef<HTMLInputElement>(null);

  const handleLog = () => {
    const paceMinPerKm  = parsePaceStr(run.pace);
    const durationMin   = parseDurationStr(run.duration);
    addRunKm(run.distanceKm, run.name, 'strava', durationMin, paceMinPerKm);
    onLogged(run.id);
  };
  const handleUnlog = () => { removeRunKm(run.distanceKm, run.name); };

  const doShare = async (file?: File | null) => {
    setShareOpt(false); setSharing(true);
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
        padding: '12px 16px',
        borderLeft: `3px solid ${logged ? GREEN : STRAVA}`,
        borderBottom: shareOpt ? 'none' : `1px solid ${EDGE}`,
        background: logged ? `${GREEN}06` : 'transparent',
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <div style={{ minWidth: 46, flexShrink: 0 }}>
          <div style={{ color: logged ? GREEN : STRAVA, fontSize: 18, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
            {run.distanceKm}
          </div>
          <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>KM</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: TEXT, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: -0.2 }}>
            {run.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ color: MUTED, fontSize: 10 }}>{formatDate(run.date)}</span>
            <span style={{ color: MUTED, fontSize: 10 }}>·</span>
            <span style={{ color: BLUE, fontSize: 10, fontWeight: 700 }}>{run.pace}</span>
            {run.hrAvg && (
              <>
                <span style={{ color: MUTED, fontSize: 10 }}>·</span>
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
              background: logged ? `${GREEN}14` : `${STRAVA}12`,
              color: logged ? GREEN : STRAVA,
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
              background: shareOpt ? STRAVA : `${STRAVA}12`,
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

      {shareOpt && (
        <div style={{
          display: 'flex', gap: 8,
          padding: '8px 16px 10px',
          borderLeft: `3px solid ${STRAVA}`,
          borderBottom: `1px solid ${EDGE}`,
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
              background: SURF2, border: `1px solid ${EDGE}`,
              color: MUTED, fontWeight: 700, fontSize: 11, letterSpacing: 0.5,
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
      const platform = Capacitor.isNativePlatform() ? 'android' : 'web';
      const { url } = await getStravaAuthUrl(platform);
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url, presentationStyle: 'popover' });
      } else {
        window.location.href = url;
      }
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
    <div style={{ background: SURF, borderRadius: 14, padding: '14px 16px', border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW }}>
      <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Strava</div>
      <div style={{ color: MUTED, fontSize: 12 }}>Loading…</div>
    </div>
  );

  if (notConnected) return (
    <div style={{
      background: SURF, borderRadius: 14,
      border: `1px solid ${EDGE}`,
      borderLeft: `3px solid ${STRAVA}`,
      overflow: 'hidden',
      boxShadow: CARD_SHADOW,
    }}>
      <div style={{ padding: '18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={STRAVA}>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Strava</div>
        </div>
        <div style={{ color: MUTED, fontSize: 13, marginBottom: 16, lineHeight: 1.5, fontWeight: 500 }}>
          Connect Strava to log runs and share them.
        </div>
        {connectErr && (
          <div style={{ color: RED, fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(198,40,40,0.06)', borderRadius: 8, border: '1px solid rgba(198,40,40,0.18)' }}>
            {connectErr}
          </div>
        )}
        <button onClick={handleConnect} disabled={connecting} style={{
          width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
          background: connecting ? SURF2 : STRAVA,
          color: connecting ? MUTED : '#fff',
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
      background: SURF, borderRadius: 14,
      border: `1px solid ${EDGE}`,
      borderTop: `3px solid ${STRAVA}`,
      overflow: 'hidden',
      boxShadow: CARD_SHADOW,
    }}>
      {/* Header */}
      <div style={{
        padding: '13px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${EDGE}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: `${STRAVA}12`, border: `1px solid ${STRAVA}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill={STRAVA}>
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </div>
          <div>
            <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Strava</div>
            <div style={{ color: TEXT, fontSize: 13, fontWeight: 700, letterSpacing: -0.3 }}>{data.athlete.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: STRAVA, fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>{data.weekly.km}</div>
            <div style={{ color: MUTED, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' }}>KM Week</div>
          </div>
          <button onClick={load} style={{
            background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 8,
            color: MUTED, fontSize: 14, fontWeight: 700,
            width: 30, height: 30, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>↻</button>
        </div>
      </div>

      {/* Run list */}
      {data.recentRuns.length > 0 && (
        <div>
          {data.recentRuns.map((run) => (
            <RunRow key={run.id} run={run} onLogged={(id) => setLoggedIds((s) => new Set([...s, id]))} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: data.recentRuns.length > 0 ? `1px solid ${EDGE}` : 'none',
      }}>
        <div style={{ color: MUTED, fontSize: 10, fontWeight: 600 }}>
          {data.weekly.runs} runs · {data.ytd.km} km YTD
        </div>
        <button onClick={handleDisconnect} style={{
          background: 'none', border: 'none', color: MUTED,
          fontSize: 10, cursor: 'pointer', fontWeight: 600,
        }}>Disconnect</button>
      </div>
    </div>
  );
}
