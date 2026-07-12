import { useState, useEffect, useCallback } from 'react';
import { getLevelInfo, getXP, LEVELS, XP_REWARDS } from '../lib/xp';
import { calcStreak } from '../lib/streak';
import { getWaterTotal, getWaterGoal } from '../lib/waterLog';
import { getSleep } from '../lib/sleep';
import { getLogs } from '../api/localFood';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { ALL_ACHIEVEMENTS, getUnlocked } from '../lib/achievements';
import { db } from '../lib/db';

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
  const targets = useEffectiveTargets();

  const [xp,         setXp]         = useState(0);
  const [streak,     setStreak]      = useState({ current: 0, longest: 0 });
  const [missions,   setMissions]    = useState<Mission[]>([]);
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());
  const [unlocked,   setUnlocked]    = useState<string[]>([]);

  const load = useCallback(async () => {
    const total = getXP();
    setXp(total);

    const s = await calcStreak();
    setStreak(s);
    setUnlocked(getUnlocked());

    // Build logged dates for week view
    const allLogs = await db.food_logs.filter(l => !l.removed).toArray();
    setLoggedDates(new Set(allLogs.map(l => l.date)));

    // Build today's missions
    const todayLogs    = await getLogs(today);
    const activeLogs   = todayLogs.filter(l => !l.removed);
    const waterTotal   = await getWaterTotal(today);
    const waterGoal    = getWaterGoal();
    const sleep        = await getSleep(today);

    const protein   = activeLogs.reduce((s, l) => s + +l.protein, 0);
    const calories  = activeLogs.reduce((s, l) => s + +l.calories, 0);
    const protGoal  = targets?.proteinG ?? 0;
    const calGoal   = targets?.calories ?? 0;

    const suppLogs   = await db.supplement_logs.where('date').equals(today).toArray();
    const supps      = await db.supplements.where('active').equals(1).toArray();
    const allTaken   = supps.length > 0 && suppLogs.filter(s => s.taken).length >= supps.length;

    setMissions([
      { id: 'log_food',   label: 'Log at least one meal',           xp: XP_REWARDS.LOG_MEAL,       done: activeLogs.length > 0,                  color: CARB,  icon: '🍽️'  },
      { id: 'protein',    label: `Hit protein goal (${Math.round(protGoal)}g)`, xp: XP_REWARDS.HIT_PROTEIN, done: protGoal > 0 && protein >= protGoal, color: PROT,  icon: '💪'  },
      { id: 'calories',   label: `Stay in calorie range`,           xp: XP_REWARDS.HIT_CALORIES,   done: calGoal > 0 && calories >= calGoal * 0.85 && calories <= calGoal * 1.05, color: AMBER, icon: '🔥'  },
      { id: 'water',      label: `Drink ${(waterGoal/1000).toFixed(1)}L water`,  xp: XP_REWARDS.HIT_WATER,     done: waterGoal > 0 && waterTotal >= waterGoal, color: PROT, icon: '💧' },
      { id: 'sleep',      label: 'Log your sleep',                  xp: XP_REWARDS.LOG_SLEEP,      done: sleep !== null,                          color: MOON,  icon: '🌙'  },
      { id: 'supps',      label: 'Take all supplements',            xp: XP_REWARDS.SUPPLEMENT_TAKEN * supps.length, done: allTaken,              color: PINK,  icon: '💊'  },
    ].filter(m => m.xp > 0));
  }, [today, targets]);

  useEffect(() => { load(); }, [load]);

  const levelInfo = getLevelInfo(xp);
  const doneMissions = missions.filter(m => m.done).length;
  const totalXpToday = missions.filter(m => m.done).reduce((s, m) => s + m.xp, 0);

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
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{l.xp.toLocaleString()} XP</div>
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
