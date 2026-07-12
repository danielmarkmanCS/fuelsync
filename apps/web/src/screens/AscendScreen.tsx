import { useState, useEffect, useCallback } from 'react';
import { getLevelInfo, getXP, LEVELS, XP_REWARDS, LEVEL_PERKS } from '../lib/xp';
import { calcStreak } from '../lib/streak';
import { getWaterTotal, getWaterGoal, addWater, removeLastWater, parseWaterAI } from '../lib/waterLog';
import { getSleep, logSleep, calcSleepHours, estimateSleepQuality, sleepQualityLabel, sleepQualityColor } from '../lib/sleep';
import { getLogs } from '../api/localFood';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { ALL_ACHIEVEMENTS, getUnlocked } from '../lib/achievements';
import { db } from '../lib/db';
import { T } from '../theme';

const CARB  = '#43A047';
const PROT  = '#1E88E5';
const RED   = '#E53935';
const PURP  = '#0091EA';
const AMBER = '#FB8C00';
const PINK  = '#D81B60';
const MOON  = '#7E57C2';

interface Mission {
  id: string;
  label: string;
  xp: number;
  done: boolean;
  color: string;
  icon: string;
}

function XPRing({ pct, level, name, emoji }: { pct: number; level: number; name: string; emoji: string }) {
  const R  = 90;
  const SW = 14;
  const C  = 2 * Math.PI * R;
  const sz = (R + SW) * 2;
  const cx = sz / 2;
  const [animated, setAnimated] = useState(false);

  useEffect(() => { const id = requestAnimationFrame(() => setAnimated(true)); return () => cancelAnimationFrame(id); }, []);

  const levelColor = level >= 8 ? '#F59E0B' : level >= 6 ? PURP : level >= 4 ? PROT : CARB;
  const glow       = level >= 8 ? 'rgba(245,158,11,0.5)' : level >= 6 ? 'rgba(157,126,255,0.5)' : level >= 4 ? 'rgba(56,189,248,0.5)' : 'rgba(74,222,128,0.4)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 8px', position: 'relative' }}>
      {/* Glow */}
      <div style={{
        position: 'absolute', width: 200, height: 200, borderRadius: '50%',
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        filter: 'blur(30px)', top: 0, left: '50%', transform: 'translateX(-50%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <defs>
            <linearGradient id="xpGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={levelColor} />
              <stop offset="100%" stopColor={levelColor === CARB ? '#60AFFF' : '#43A047'} />
            </linearGradient>
          </defs>
          <circle cx={cx} cy={cx} r={R} fill="none" stroke="var(--edge2)" strokeWidth={SW} opacity={0.4} />
          <circle
            cx={cx} cy={cx} r={R}
            fill="none"
            stroke="url(#xpGrad)"
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (animated ? pct / 100 : 0))}
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 16px ${glow})` }}
          />
        </svg>

        {/* Center content */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 2 }}>{emoji}</div>
          <div style={{
            fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: -2,
            color: levelColor, textShadow: `0 0 30px ${glow}`,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {level}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.5, marginTop: 4 }}>{name}</div>
        </div>
      </div>
    </div>
  );
}

function MissionRow({ mission }: { mission: Mission }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
    }}>
      {/* Check circle */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: mission.done ? `${mission.color}22` : 'var(--surf2)',
        border: `2px solid ${mission.done ? mission.color : 'var(--edge)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.3s ease',
        boxShadow: mission.done ? `0 0 10px ${mission.color}40` : 'none',
      }}>
        {mission.done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={mission.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>

      {/* Label */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: mission.done ? 600 : 500, color: mission.done ? 'var(--text)' : 'var(--muted)', transition: 'color 0.3s' }}>
          {mission.icon} {mission.label}
        </div>
      </div>

      {/* XP badge */}
      <div style={{
        padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
        background: mission.done ? `${mission.color}22` : 'var(--surf2)',
        color: mission.done ? mission.color : 'var(--muted2)',
        border: `1px solid ${mission.done ? mission.color + '44' : 'var(--edge)'}`,
      }}>
        +{mission.xp} XP
      </div>
    </div>
  );
}

function StreakCard({ current, longest }: { current: number; longest: number }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${AMBER}18 0%, transparent 60%)`,
      borderRadius: 20, border: `1px solid ${AMBER}33`,
      padding: '20px', marginBottom: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 12, color: AMBER, fontWeight: 700, letterSpacing: 0.3, marginBottom: 6 }}>🔥 Logging streak</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: AMBER, letterSpacing: -2, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{current}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {current === 1 ? 'day' : 'days'} in a row
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Best ever</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--muted2)', letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>{longest}</div>
        <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 2 }}>days</div>
      </div>
    </div>
  );
}

function WeekDots({ dates }: { dates: Set<string> }) {
  const today = new Date();
  const days: Array<{ date: string; label: string; logged: boolean; isToday: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      logged: dates.has(dateStr),
      isToday: i === 0,
    });
  }

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)',
      padding: '16px 20px', marginBottom: 12,
    }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 12 }}>This week</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map(day => (
          <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, color: day.isToday ? PURP : 'var(--muted)', fontWeight: day.isToday ? 700 : 500 }}>
              {day.label}
            </div>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: day.logged ? (day.isToday ? PURP : CARB) : 'var(--surf2)',
              border: `2px solid ${day.logged ? (day.isToday ? PURP + '66' : CARB + '66') : 'var(--edge)'}`,
              boxShadow: day.logged ? `0 0 8px ${day.isToday ? PURP : CARB}40` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}>
              {day.logged && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AchievementBadge({ id, label, icon, color, unlocked }: { id: string; label: string; icon: string; color: string; unlocked: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '12px 8px',
      background: unlocked ? `${color}14` : 'var(--surf2)',
      borderRadius: 16,
      border: `1px solid ${unlocked ? color + '33' : 'var(--edge)'}`,
      opacity: unlocked ? 1 : 0.45,
      transition: 'all 0.3s ease',
    }}>
      <div style={{ fontSize: 24, filter: unlocked ? 'none' : 'grayscale(1)' }}>{icon}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: unlocked ? color : 'var(--muted)', textAlign: 'center', lineHeight: 1.3 }}>
        {label}
      </div>
    </div>
  );
}

export default function AscendScreen() {
  const today   = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const targets = useEffectiveTargets();

  const [xp,           setXp]          = useState(0);
  const [streak,       setStreak]       = useState({ current: 0, longest: 0 });
  const [missions,     setMissions]     = useState<Mission[]>([]);
  const [loggedDates,  setLoggedDates]  = useState<Set<string>>(new Set());
  const [unlocked,     setUnlocked]     = useState<string[]>([]);
  const [waterTotal,   setWaterTotal]   = useState(0);
  const [waterInput,   setWaterInput]   = useState('');
  const [waterParsed,  setWaterParsed]  = useState<{ ml: number; label: string } | null>(null);
  const [waterLoading, setWaterLoading] = useState(false);
  const [waterError,   setWaterError]   = useState<string | null>(null);
  const [sleepData,    setSleepData]    = useState<{ bedtime: string; wakeup: string; hours: number | null; quality: number } | null>(null);
  const [bedtime,      setBedtime]      = useState('22:30');
  const [wakeup,       setWakeup]       = useState('06:30');
  const [showSleepForm, setShowSleepForm] = useState(false);

  const waterGoal = getWaterGoal();

  const load = useCallback(async () => {
    const total = getXP();
    setXp(total);
    const s = await calcStreak();
    setStreak(s);
    setUnlocked(getUnlocked());

    const allLogs = await db.food_logs.filter(l => !l.removed).toArray();
    setLoggedDates(new Set(allLogs.map(l => l.date)));

    const todayLogs  = await getLogs(today);
    const activeLogs = todayLogs.filter(l => !l.removed);
    const wt         = await getWaterTotal(today);
    setWaterTotal(wt);
    const sleepLog   = await getSleep(today);
    if (sleepLog) {
      setSleepData({ bedtime: sleepLog.bedtime ?? '', wakeup: sleepLog.wakeup ?? '', hours: sleepLog.hours, quality: sleepLog.quality });
      if (sleepLog.bedtime) setBedtime(sleepLog.bedtime);
      if (sleepLog.wakeup)  setWakeup(sleepLog.wakeup);
    }

    const protein  = activeLogs.reduce((s, l) => s + +l.protein, 0);
    const calories = activeLogs.reduce((s, l) => s + +l.calories, 0);
    const protGoal = targets?.proteinG ?? 0;
    const calGoal  = targets?.calories ?? 0;

    const suppLogs = await db.supplement_logs.where('date').equals(today).toArray();
    const supps    = await db.supplements.where('active').equals(1).toArray();
    const allTaken = supps.length > 0 && suppLogs.filter(s => s.taken).length >= supps.length;

    setMissions([
      { id: 'log_food', label: 'Log at least one meal',                       xp: XP_REWARDS.LOG_MEAL,       done: activeLogs.length > 0,                color: CARB,  icon: '🍽️' },
      { id: 'protein',  label: `Hit protein goal (${Math.round(protGoal)}g)`, xp: XP_REWARDS.HIT_PROTEIN,    done: protGoal > 0 && protein >= protGoal,  color: PROT,  icon: '💪' },
      { id: 'calories', label: 'Stay in calorie range',                        xp: XP_REWARDS.HIT_CALORIES,   done: calGoal > 0 && calories >= calGoal * 0.85 && calories <= calGoal * 1.05, color: AMBER, icon: '🔥' },
      { id: 'water',    label: `Drink ${(waterGoal / 1000).toFixed(1)}L water`, xp: XP_REWARDS.HIT_WATER,   done: waterGoal > 0 && wt >= waterGoal,     color: PROT,  icon: '💧' },
      { id: 'sleep',    label: 'Log your sleep',                               xp: XP_REWARDS.LOG_SLEEP,      done: sleepLog !== null,                    color: MOON,  icon: '🌙' },
      { id: 'supps',    label: 'Take all supplements',                         xp: XP_REWARDS.SUPPLEMENT_TAKEN * supps.length, done: allTaken,           color: PINK,  icon: '💊' },
    ].filter(m => m.xp > 0));
  }, [today, targets, waterGoal]);

  useEffect(() => { load(); }, [load]);

  // ── Sleep save ─────────────────────────────────────────────────────────────
  async function saveSleep() {
    const hours = calcSleepHours(bedtime, wakeup);
    if (!hours) return;
    const hist = (() => { try { return JSON.parse(localStorage.getItem('fs_training_type_history_v1') ?? '{}'); } catch { return {}; } })();
    const todayTraining     = hist[today] as string | undefined;
    const yesterdayTraining = hist[yesterday] as string | undefined;
    const quality = estimateSleepQuality(hours, todayTraining, yesterdayTraining);
    await logSleep(today, hours, quality, bedtime, wakeup);
    setSleepData({ bedtime, wakeup, hours, quality });
    setShowSleepForm(false);
    load();
  }

  // ── Water input ────────────────────────────────────────────────────────────
  async function analyzeWater() {
    if (!waterInput.trim()) return;
    setWaterLoading(true);
    setWaterError(null);
    setWaterParsed(null);
    try {
      const result = await parseWaterAI(waterInput.trim());
      setWaterParsed(result);
    } catch {
      setWaterError('Could not parse — try again');
    } finally {
      setWaterLoading(false);
    }
  }

  async function addWaterFromInput() {
    if (!waterParsed) return;
    await addWater(today, waterParsed.ml, waterParsed.label);
    setWaterTotal(t => t + waterParsed.ml);
    setWaterInput('');
    setWaterParsed(null);
    setWaterError(null);
    load();
  }

  async function undoLastWater() {
    await removeLastWater(today);
    const wt = await getWaterTotal(today);
    setWaterTotal(wt);
  }

  const levelInfo    = getLevelInfo(xp);
  const doneMissions = missions.filter(m => m.done).length;
  const totalXpToday = missions.filter(m => m.done).reduce((s, m) => s + m.xp, 0);

  const sleepHours = sleepData?.hours ?? calcSleepHours(bedtime, wakeup);

  return (
    <div style={{ position: 'relative', background: 'var(--bg)', minHeight: '100%', paddingBottom: 100, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ padding: '28px 20px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--text)', letterSpacing: -1 }}>Ascend</div>
        </div>

        {/* XP level ring */}
        <XPRing pct={levelInfo.progressPct} level={levelInfo.level} name={levelInfo.name} emoji={levelInfo.emoji} />

        {/* XP info strip */}
        <div style={{ padding: '0 20px 16px', display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: 'var(--surf)', borderRadius: 14, padding: '10px 14px', border: '1px solid var(--edge)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>Total XP</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: PURP, fontVariantNumeric: 'tabular-nums' }}>{xp.toLocaleString()}</div>
          </div>
          {!levelInfo.isMaxLevel && (
            <div style={{ flex: 1, background: 'var(--surf)', borderRadius: 14, padding: '10px 14px', border: '1px solid var(--edge)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>To next level</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: CARB, fontVariantNumeric: 'tabular-nums' }}>{levelInfo.xpToNext.toLocaleString()}</div>
            </div>
          )}
          <div style={{ flex: 1, background: 'var(--surf)', borderRadius: 14, padding: '10px 14px', border: '1px solid var(--edge)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>Today earned</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: AMBER, fontVariantNumeric: 'tabular-nums' }}>+{totalXpToday}</div>
          </div>
        </div>

        {/* Streak */}
        <div style={{ padding: '0 16px 12px' }}>
          <StreakCard current={streak.current} longest={streak.longest} />
        </div>

        {/* Week dots */}
        <div style={{ padding: '0 16px 12px' }}>
          <WeekDots dates={loggedDates} />
        </div>

        {/* Daily missions */}
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Today's missions</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{doneMissions}/{missions.length} done</div>
            </div>
            {/* Progress bar */}
            <div style={{ margin: '10px 16px 0', height: 4, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: doneMissions === missions.length ? CARB : `linear-gradient(90deg, ${PURP}, ${PROT})`,
                width: `${missions.length > 0 ? (doneMissions / missions.length) * 100 : 0}%`,
                transition: 'width 0.75s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: doneMissions === missions.length ? `0 0 8px ${CARB}60` : 'none',
              }} />
            </div>
            <div style={{ display: 'grid', gap: 1, background: 'var(--edge)', margin: '10px 0 0' }}>
              {missions.map(m => (
                <div key={m.id} style={{ background: 'var(--surf)' }}>
                  <MissionRow mission={m} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sleep card */}
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '14px 16px', boxShadow: T.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🌙 Sleep</div>
              {sleepData && !showSleepForm && (
                <button onClick={() => setShowSleepForm(true)} style={{ background: 'none', border: 'none', fontSize: 11, color: PURP, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Edit</button>
              )}
            </div>
            {sleepData && !showSleepForm ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: MOON, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>{sleepData.hours?.toFixed(1)}h</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{sleepData.bedtime} – {sleepData.wakeup}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                    background: sleepQualityColor(sleepData.quality) + '22',
                    color: sleepQualityColor(sleepData.quality),
                    border: `1px solid ${sleepQualityColor(sleepData.quality)}44`,
                  }}>
                    {sleepQualityLabel(sleepData.quality)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Quality estimated from training</div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Bedtime</div>
                    <input
                      type="time" value={bedtime}
                      onChange={e => setBedtime(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--edge2)', background: 'var(--surf2)', color: 'var(--text)', fontSize: 15, fontWeight: 600, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Wake up</div>
                    <input
                      type="time" value={wakeup}
                      onChange={e => setWakeup(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--edge2)', background: 'var(--surf2)', color: 'var(--text)', fontSize: 15, fontWeight: 600, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                {(() => {
                  const h = calcSleepHours(bedtime, wakeup);
                  return h ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                      = <strong style={{ color: 'var(--text)' }}>{h.toFixed(1)} hours</strong>
                    </div>
                  ) : null;
                })()}
                <button onClick={saveSleep} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: MOON, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  Save sleep
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Water card */}
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '14px 16px', boxShadow: T.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>💧 Hydration</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: PROT, fontVariantNumeric: 'tabular-nums' }}>
                {(waterTotal / 1000).toFixed(1)}L / {(waterGoal / 1000).toFixed(1)}L
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: waterTotal >= waterGoal ? CARB : PROT,
                width: `${Math.min((waterTotal / waterGoal) * 100, 100)}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            {/* Full description textarea */}
            <textarea
              placeholder='Describe what you drank today, e.g. "I had 2 glasses of water in the morning, a coffee, and a protein shake after the gym"'
              value={waterInput}
              onChange={e => { setWaterInput(e.target.value); setWaterParsed(null); setWaterError(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyzeWater(); }}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--edge2)', background: 'var(--surf2)', color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
            {/* AI result */}
            {waterParsed && (
              <div style={{ margin: '8px 0', padding: '10px 14px', borderRadius: 10, background: PROT + '12', border: `1px solid ${PROT}33` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: PROT }}>💧 {waterParsed.ml}ml</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{waterParsed.label}</div>
              </div>
            )}
            {waterError && <div style={{ fontSize: 12, color: RED, margin: '6px 0' }}>{waterError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={waterParsed ? addWaterFromInput : analyzeWater}
                disabled={waterLoading || !waterInput.trim()}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: (waterLoading || !waterInput.trim()) ? 'var(--edge2)' : PROT, color: (waterLoading || !waterInput.trim()) ? 'var(--muted)' : '#fff', fontWeight: 700, fontSize: 13, cursor: (waterLoading || !waterInput.trim()) ? 'default' : 'pointer', transition: 'all 0.2s' }}
              >
                {waterLoading ? 'Analyzing…' : waterParsed ? '+ Log it' : 'Analyze with AI'}
              </button>
              <button
                onClick={undoLastWater}
                style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--edge)', background: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
                title="Undo last entry"
              >
                ↩
              </button>
            </div>
          </div>
        </div>

        {/* Achievements */}
        <div style={{ padding: '0 16px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Achievements</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {ALL_ACHIEVEMENTS.map(a => (
              <AchievementBadge
                key={a.id} id={a.id}
                label={a.label} icon={a.icon} color={a.color}
                unlocked={unlocked.includes(a.id)}
              />
            ))}
          </div>
        </div>

        {/* Levels reference */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Level road</div>
          <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', overflow: 'hidden' }}>
            {LEVELS.map((l, i) => {
              const reached = xp >= l.xp;
              const isCurrent = levelInfo.level === l.level;
              return (
                <div key={l.level} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: i < LEVELS.length - 1 ? '1px solid var(--edge)' : 'none',
                  background: isCurrent ? `${PURP}12` : 'transparent',
                }}>
                  <div style={{ fontSize: 20 }}>{l.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500, color: reached ? 'var(--text)' : 'var(--muted2)' }}>
                      Lv.{l.level} — {l.name}
                      {isCurrent && <span style={{ fontSize: 9, color: PURP, fontWeight: 700, marginLeft: 6, padding: '2px 6px', background: PURP + '22', borderRadius: 99 }}>YOU</span>}
                    </div>
                    {LEVEL_PERKS[l.level] && (
                      <div style={{ fontSize: 10, color: reached ? PURP : 'var(--muted2)', marginTop: 1, fontWeight: reached ? 600 : 400 }}>{LEVEL_PERKS[l.level]}</div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{l.xp.toLocaleString()} XP</div>
                  </div>
                  {reached && !isCurrent && (
                    <div style={{ color: CARB, fontSize: 14 }}>✓</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
