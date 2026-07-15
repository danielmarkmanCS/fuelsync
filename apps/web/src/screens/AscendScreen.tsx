import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  getLevelInfo, getXP, LEVELS, XP_REWARDS, LEVEL_PERKS,
  TIER_CONFIG, getStreakMultiplier, setStoredStreakMult,
  getTodayXP,
} from '../lib/xp';
import type { Tier } from '../lib/xp';
import { calcStreak } from '../lib/streak';
import {
  IconMeal, IconProtein, IconFlame, IconDroplet,
  IconMoon, IconPill, IconCheck, IconBolt,
} from '../components/Icon';
import { getWaterTotal, getWaterGoal, addWater, removeLastWater, parseWaterAI } from '../lib/waterLog';
import { getSleep, logSleep, calcSleepHours, estimateSleepQuality, sleepQualityLabel, sleepQualityColor } from '../lib/sleep';
import { getLogs } from '../api/localFood';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { ALL_ACHIEVEMENTS, getUnlocked } from '../lib/achievements';
import { db } from '../lib/db';
import { T } from '../theme';

// ─── Color tokens ─────────────────────────────────────────────────────────────
const AMBER = 'var(--c-ascend)';
const PROT  = 'var(--prot)';
const CARB  = 'var(--carb)';
const MOON  = '#7E57C2';
const PINK  = 'var(--c-pills)';

// ─── Mission type ─────────────────────────────────────────────────────────────
interface Mission {
  id:       string;
  label:    string;
  xp:       number;
  done:     boolean;
  color:    string;
  current?: number;
  goal?:    number;
}

// ─── useXP — real-time XP hook ───────────────────────────────────────────────
// Reads XP from localStorage on mount, then updates whenever any screen grants XP.
function useXP() {
  const [xp, setXp] = useState(() => getXP());
  useEffect(() => {
    function handler(e: Event) {
      setXp((e as CustomEvent<{ total: number }>).detail.total);
    }
    window.addEventListener('xp-earned', handler);
    return () => window.removeEventListener('xp-earned', handler);
  }, []);
  return xp;
}

// ─── XPRing ───────────────────────────────────────────────────────────────────
// The centrepiece ring. Tier-colored gradient stroke, animated on mount and on
// every XP change. Level-up triggers a 3-phase fill→flash→reset→refill sequence.

const XPRing = memo(function XPRing({ xp }: { xp: number }) {
  const R       = 86;
  const SW      = 13;
  const C       = 2 * Math.PI * R;
  const sz      = (R + SW) * 2 + 4;
  const cx      = sz / 2;

  const levelInfo = getLevelInfo(xp);
  const { tier }  = levelInfo;
  const cfg       = TIER_CONFIG[tier];

  // Animation state
  const [displayPct,  setDisplayPct]  = useState(0);
  const [flash,       setFlash]       = useState(false);
  const [noTransition,setNoTransition]= useState(false);
  const prevXpRef   = useRef<number>(-1);
  const timers      = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    if (prevXpRef.current === -1) {
      // Initial mount: animate from 0 → target after first paint
      const t = setTimeout(() => setDisplayPct(levelInfo.progressPct), 80);
      timers.current.push(t);
      prevXpRef.current = xp;
      return clearTimers;
    }

    if (xp === prevXpRef.current) return;

    const prevLevel = getLevelInfo(prevXpRef.current).level;
    prevXpRef.current = xp;

    if (levelInfo.level > prevLevel) {
      // ── Level-up sequence ─────────────────────────────────────────────────
      // Phase 1 (0 ms):    fill ring to 100% (smooth)
      // Phase 2 (900 ms):  flash glow
      // Phase 3 (1 350 ms): instant-reset to 0 (suppress CSS transition)
      // Phase 4 (1 450 ms): re-enable transition, animate to new level progress
      clearTimers();
      setDisplayPct(100);
      timers.current.push(setTimeout(() => setFlash(true), 900));
      timers.current.push(setTimeout(() => {
        setFlash(false);
        setNoTransition(true);
        setDisplayPct(0);
      }, 1350));
      timers.current.push(setTimeout(() => {
        setNoTransition(false);
        setDisplayPct(levelInfo.progressPct);
      }, 1450));
    } else {
      setDisplayPct(levelInfo.progressPct);
    }

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp]);

  const dashOffset = C * (1 - displayPct / 100);
  const glowStr    = flash
    ? `drop-shadow(0 0 12px ${cfg.color})`
    : undefined;

  const gradId  = `xpGrad_${tier}`;
  const trackId = `xpTrack_${tier}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 4px', position: 'relative' }}>

      {/* Flash ring */}
      {flash && (
        <div style={{
          position:    'absolute',
          width:       sz + 24,
          height:      sz + 24,
          borderRadius:'50%',
          border:      `3px solid ${cfg.color}`,
          top:         '50%',
          left:        '50%',
          transform:   'translate(-50%, -50%)',
          animation:   'fabRing 0.65s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
          pointerEvents:'none',
        }} />
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <svg
          width={sz} height={sz}
          viewBox={`0 0 ${sz} ${sz}`}
          style={{ transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }}
        >
          <defs>
            {/* Gradient stroke for the progress arc */}
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={cfg.gradient[0]} />
              <stop offset="100%" stopColor={cfg.gradient[1]} />
            </linearGradient>
            {/* Soft glow filter */}
            <filter id={`gf_${tier}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Track */}
          <circle
            cx={cx} cy={cx} r={R}
            fill="none"
            stroke={cfg.track}
            strokeWidth={SW}
          />

          {/* Progress arc */}
          <circle
            cx={cx} cy={cx} r={R}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            filter={`url(#gf_${tier})`}
            style={{
              transition: noTransition ? 'none' : 'stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)',
              filter: glowStr,
            }}
          />
        </svg>

        {/* Center content */}
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            0,
        }}>
          <div style={{
            fontSize:    30,
            lineHeight:  1,
            marginBottom: 1,
            filter:      `drop-shadow(0 0 10px ${cfg.glow})`,
          }}>
            {levelInfo.emoji}
          </div>
          <div style={{
            fontSize:   50,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: -2,
            color:      cfg.color,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {levelInfo.level}
          </div>
          <div style={{
            fontSize:    11,
            color:       'var(--muted)',
            fontWeight:  700,
            letterSpacing: 0.5,
            marginTop:   3,
          }}>
            {levelInfo.name}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── TierBadges ──────────────────────────────────────────────────────────────
// Horizontal row of 6 tier chips. Current tier is highlighted; future tiers dimmed.

const TIER_META: Array<{ id: Tier; icon: string; short: string }> = [
  { id: 'Bronze',   icon: '🥉', short: 'BRONZE'   },
  { id: 'Silver',   icon: '🥈', short: 'SILVER'   },
  { id: 'Gold',     icon: '🥇', short: 'GOLD'     },
  { id: 'Platinum', icon: '💠', short: 'PLAT'     },
  { id: 'Diamond',  icon: '💎', short: 'DIAMOND'  },
  { id: 'Mythic',   icon: '👑', short: 'MYTHIC'   },
];
const TIER_ORDER: Tier[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Mythic'];

const TierBadges = memo(function TierBadges({ tier }: { tier: Tier }) {
  const curIdx = TIER_ORDER.indexOf(tier);
  return (
    <div style={{ display: 'flex', gap: 5, padding: '4px 16px 14px' }}>
      {TIER_META.map((t, i) => {
        const active   = t.id === tier;
        const reached  = i <= curIdx;
        const cfg      = TIER_CONFIG[t.id];
        return (
          <div key={t.id} className={active ? 'press' : ''} style={{
            flex:          1,
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           3,
            padding:       '7px 2px',
            borderRadius:  12,
            background:    active ? `${cfg.color}18` : 'transparent',
            border:        `1px solid ${active ? cfg.color + '44' : 'transparent'}`,
            opacity:       reached ? 1 : 0.28,
            transition:    'all 0.3s var(--ease)',
            boxShadow: 'none',
          }}>
            <div style={{
              fontSize: 15,
              filter:   reached ? 'none' : 'grayscale(1) brightness(0.3)',
            }}>
              {t.icon}
            </div>
            <div style={{
              fontSize:      7,
              fontWeight:    900,
              letterSpacing: 0.3,
              color:         active ? cfg.color : 'var(--muted2)',
              textTransform: 'uppercase',
              lineHeight:    1,
            }}>
              {t.short}
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ─── XP stat strip ────────────────────────────────────────────────────────────
// Three quick-stat tiles: Total XP · To Next · Today

interface StatTile { label: string; value: string; color: string; sub?: string }

const StatStrip = memo(function StatStrip({ tiles }: { tiles: StatTile[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
      {tiles.map(tile => (
        <div key={tile.label} style={{
          flex:         1,
          background:   'var(--surf)',
          borderRadius: 14,
          padding:      '12px 10px',
          border:       '1px solid var(--edge)',
          textAlign:    'center',
          boxShadow:    T.shadowMd,
        }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>
            {tile.label}
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, color: tile.color, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
            {tile.value}
          </div>
          {tile.sub && (
            <div style={{ fontSize: 9, color: 'var(--muted2)', marginTop: 3, fontWeight: 600 }}>{tile.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
});

// ─── StreakCard ───────────────────────────────────────────────────────────────
// Shows streak days, live multiplier, and a progress bar toward the 1.50× cap.

const StreakCard = memo(function StreakCard({
  current, longest,
}: { current: number; longest: number }) {
  const mult       = getStreakMultiplier(current);
  const isMaxMult  = current >= 10;
  const daysToMax  = Math.max(0, 10 - current);
  const pctToMax   = Math.min((current / 10) * 100, 100);
  const multLabel  = mult.toFixed(2).replace(/\.?0+$/, '') + '×';

  return (
    <div style={{
      background:   'var(--surf)',
      borderRadius: 16,
      border:       '1px solid var(--edge)',
      borderTop:    '4px solid #F59E0B',
      padding:      20,
      marginBottom: 12,
      boxShadow:    'var(--shadow-md)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        {/* Left: streak count */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              Streak
            </div>
            <div style={{
              padding:      '2px 9px',
              borderRadius: 7,
              fontSize:     11,
              fontWeight:   900,
              background:   isMaxMult ? AMBER : AMBER + 'CC',
              color:        '#000',
              boxShadow: 'none',
              transition:   'box-shadow 0.4s ease',
            }}>
              {multLabel} XP
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize:   52,
              fontWeight: 900,
              color:      AMBER,
              letterSpacing: -2,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {current}
            </span>
            <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>days</span>
          </div>
        </div>

        {/* Right: longest streak */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            Best
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--muted2)', letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>
            {longest}
          </div>
        </div>
      </div>

      {/* Multiplier progress bar: 0 → 10 days = 1.00× → 1.50× */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>
            {isMaxMult ? '🔥 Max bonus reached!' : `${daysToMax}d to 1.50× max bonus`}
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: AMBER }}>
            {current}/10
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height:     '100%',
            borderRadius: 99,
            background: isMaxMult
              ? `linear-gradient(90deg, ${AMBER}, #FDE68A, ${AMBER})`
              : `linear-gradient(90deg, ${AMBER}88, ${AMBER})`,
            backgroundSize: isMaxMult ? '200% 100%' : '100% 100%',
            animation:  isMaxMult ? 'shimmer 1.8s linear infinite' : 'none',
            width:      `${pctToMax}%`,
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: 'none',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--muted2)', fontWeight: 500 }}>1.00×</span>
          <span style={{ fontSize: 9, color: AMBER, fontWeight: 700 }}>1.50× cap</span>
        </div>
      </div>
    </div>
  );
});

// ─── WeekDots ─────────────────────────────────────────────────────────────────

const WeekDots = memo(function WeekDots({ dates }: { dates: Set<string> }) {
  const now      = new Date();
  const todayStr = now.toISOString().split('T')[0];
  // Always start from Sunday of the current week
  const sunday   = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const days = DAY_SHORT.map((label, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return {
      date:     dateStr,
      label,
      logged:   dates.has(dateStr),
      isToday:  dateStr === todayStr,
      isFuture: dateStr > todayStr,
    };
  });

  return (
    <div style={{ background: 'var(--surf)', borderRadius: 16, border: '1px solid var(--edge)', padding: 16, marginBottom: 12, boxShadow: T.shadow }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
        This week
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {days.map(day => (
          <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, opacity: day.isFuture ? 0.2 : 1 }}>
            <div style={{ fontSize: 10, color: day.isToday ? 'var(--accent)' : 'var(--muted2)', fontWeight: 700, textTransform: 'uppercase' }}>
              {day.label}
            </div>
            <div style={{
              width:          30,
              height:         30,
              borderRadius:   9,
              background:     day.isFuture ? 'transparent' : day.logged ? (day.isToday ? 'var(--accent)' : CARB) : 'var(--surf2)',
              border:         `1px solid ${day.logged && !day.isFuture ? 'transparent' : 'var(--edge)'}`,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              transition:     'all 0.2s var(--ease)',
              boxShadow: 'none',
            }}>
              {day.logged && !day.isFuture && <IconCheck size={13} color="#fff" sw={2.5} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── MissionRow ───────────────────────────────────────────────────────────────

const MISSION_ICONS: Record<string, React.FC<{ size?: number; color?: string }>> = {
  log_food: IconMeal,
  protein:  IconProtein,
  calories: IconFlame,
  water:    IconDroplet,
  sleep:    IconMoon,
  supps:    IconPill,
};

const MissionRow = memo(function MissionRow({ mission }: { mission: Mission }) {
  const hasBar = mission.goal !== undefined && mission.goal > 0;
  const pct    = hasBar ? Math.min(((mission.current ?? 0) / mission.goal!) * 100, 100) : 0;
  const MIcon  = MISSION_ICONS[mission.id];
  const suffix =
    mission.id === 'protein' || mission.id === 'calories' ? 'g' :
    mission.id === 'water' ? 'ml' : '';

  return (
    <div style={{ padding: '13px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width:          36,
          height:         36,
          borderRadius:   10,
          flexShrink:     0,
          background:     mission.done ? `${mission.color}18` : 'var(--surf2)',
          border:         `1px solid ${mission.done ? mission.color + '30' : 'var(--edge)'}`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          transition:     'all 0.25s var(--ease)',
          boxShadow: 'none',
        }}>
          {mission.done
            ? <IconCheck size={16} color={mission.color} />
            : MIcon ? <MIcon size={16} color="var(--muted2)" /> : null
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize:   13,
            fontWeight: 600,
            color:      mission.done ? 'var(--text)' : 'var(--muted)',
            marginBottom: hasBar && !mission.done ? 2 : 0,
            textDecoration: mission.done ? 'none' : 'none',
          }}>
            {mission.label}
          </div>
          {hasBar && !mission.done && (
            <div style={{ fontSize: 11, color: 'var(--muted2)', fontVariantNumeric: 'tabular-nums' }}>
              {mission.current}{suffix} / {mission.goal}{suffix}
            </div>
          )}
        </div>

        <div style={{
          display:        'flex',
          alignItems:     'center',
          gap:            4,
          padding:        '4px 9px',
          borderRadius:   8,
          flexShrink:     0,
          background:     mission.done ? `${mission.color}15` : 'var(--surf2)',
          border:         `1px solid ${mission.done ? mission.color + '30' : 'var(--edge)'}`,
        }}>
          <IconBolt size={10} color={mission.done ? mission.color : 'var(--muted2)'} />
          <span style={{ fontSize: 11, fontWeight: 700, color: mission.done ? mission.color : 'var(--muted2)' }}>
            +{mission.xp}
          </span>
        </div>
      </div>

      {hasBar && (
        <div style={{
          marginTop:    9,
          marginLeft:   48,
          height:       4,
          background:   'var(--edge2)',
          borderRadius: 99,
          overflow:     'hidden',
        }}>
          <div style={{
            height:       '100%',
            borderRadius: 99,
            background:   mission.done ? mission.color : `${mission.color}70`,
            width:        `${pct}%`,
            transition:   'width 0.75s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: 'none',
          }} />
        </div>
      )}
    </div>
  );
});

// ─── AchievementBadge ─────────────────────────────────────────────────────────

const AchievementBadge = memo(function AchievementBadge({
  label, icon, color, unlocked,
}: { id: string; label: string; icon: string; color: string; unlocked: boolean }) {
  return (
    <div className="press" style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           5,
      padding:       '13px 6px',
      background:    unlocked ? `${color}12` : 'var(--surf2)',
      borderRadius:  13,
      border:        `1px solid ${unlocked ? color + '28' : 'var(--edge)'}`,
      opacity:       unlocked ? 1 : 0.32,
      transition:    'all 0.25s var(--ease)',
      boxShadow: 'none',
    }}>
      <div style={{ fontSize: 22, filter: unlocked ? 'none' : 'grayscale(1) brightness(0.45)' }}>
        {icon}
      </div>
      <div style={{
        fontSize:   9,
        fontWeight: 700,
        color:      unlocked ? color : 'var(--muted2)',
        textAlign:  'center',
        lineHeight: 1.3,
        letterSpacing: 0.2,
      }}>
        {label}
      </div>
    </div>
  );
});

// ─── Daily rotating bonus challenges ─────────────────────────────────────────
// One challenge per day, cycles through the pool. User manually taps to complete.

const BONUS_POOL = [
  { id: 'cold_shower',   label: 'Cold shower finish (30s)',         xp: 10, color: '#38BDF8', emoji: '🧊' },
  { id: 'no_phone_morn', label: 'No phone for 1hr after waking',    xp: 15, color: MOON,      emoji: '📵' },
  { id: 'steps_8k',      label: 'Hit 8,000 steps today',            xp: 20, color: CARB,      emoji: '🚶' },
  { id: 'no_processed',  label: 'Zero processed food today',        xp: 25, color: CARB,      emoji: '🥗' },
  { id: 'log_all',       label: 'Log every meal + water + sleep',   xp: 30, color: AMBER,     emoji: '📋' },
  { id: 'full_skincare', label: 'Full morning skincare routine',    xp: 15, color: PINK,      emoji: '🧴' },
  { id: 'screens_10pm',  label: 'Screens off by 10pm',             xp: 20, color: MOON,      emoji: '🌙' },
  { id: 'mewing_15',     label: '15 min of mewing practice',       xp: 15, color: '#7C3AED', emoji: '🫦' },
  { id: 'stretch',       label: 'Full body stretch (10 min)',       xp: 10, color: '#0EA5E9', emoji: '🧘' },
  { id: 'collagen',      label: 'Collagen + Vitamin C taken',      xp: 10, color: AMBER,     emoji: '💊' },
  { id: 'no_sugar',      label: 'Zero added sugar today',          xp: 25, color: '#F43F5E', emoji: '🍬' },
  { id: 'posture_desk',  label: 'Upright posture 1hr at desk',     xp: 15, color: CARB,      emoji: '🧍' },
  { id: 'sunlight',      label: 'Morning sunlight within 1hr',     xp: 10, color: AMBER,     emoji: '☀️' },
  { id: 'gratitude',     label: 'Write 3 things you\'re grateful for', xp: 10, color: '#9D7EFF', emoji: '📓' },
] as const;

type BonusId = typeof BONUS_POOL[number]['id'];

function getTodayBonus(date: string) {
  const dayNum = Math.floor(new Date(date).getTime() / 86400000);
  return BONUS_POOL[dayNum % BONUS_POOL.length];
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AscendScreen() {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const targets   = useEffectiveTargets();

  // XP auto-updates via custom event
  const xp       = useXP();
  const levelInfo = getLevelInfo(xp);

  const [streak,       setStreak]       = useState({ current: 0, longest: 0 });
  const [missions,     setMissions]     = useState<Mission[]>([]);
  const [loggedDates,  setLoggedDates]  = useState<Set<string>>(new Set());
  const [unlocked,     setUnlocked]     = useState<string[]>([]);
  const [todayXP,      setTodayXP]     = useState(0);

  // Daily bonus challenge
  const todayBonus = getTodayBonus(today);
  const bonusKey   = `fs_bonus_${today}_${todayBonus.id}`;
  const [bonusDone, setBonusDone] = useState(() => !!localStorage.getItem(bonusKey));

  // Sleep card
  const [sleepData,     setSleepData]     = useState<{ bedtime: string; wakeup: string; hours: number | null; quality: number } | null>(null);
  const [bedtime,       setBedtime]       = useState('22:30');
  const [wakeup,        setWakeup]        = useState('06:30');
  const [showSleepForm, setShowSleepForm] = useState(false);

  // Water card
  const [waterTotal,   setWaterTotal]   = useState(0);
  const [waterInput,   setWaterInput]   = useState('');
  const [waterParsed,  setWaterParsed]  = useState<{ ml: number; label: string } | null>(null);
  const [waterLoading, setWaterLoading] = useState(false);
  const [waterError,   setWaterError]   = useState<string | null>(null);

  const waterGoal = getWaterGoal();

  // Prevent duplicate rapid loads
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const s = await calcStreak();
      setStreak(s);
      // Store the streak multiplier so addXP can apply it from any screen
      setStoredStreakMult(s.current);
      setUnlocked(getUnlocked());
      setTodayXP(getTodayXP());

      const allLogs = await db.food_logs.filter(l => !l.removed).toArray();
      setLoggedDates(new Set(allLogs.map(l => l.date)));

      const todayLogs  = await getLogs(today);
      const activeLogs = todayLogs.filter(l => !l.removed);
      const wt         = await getWaterTotal(today);
      setWaterTotal(wt);

      const sleepLog = await getSleep(today);
      if (sleepLog) {
        setSleepData({ bedtime: sleepLog.bedtime ?? '', wakeup: sleepLog.wakeup ?? '', hours: sleepLog.hours, quality: sleepLog.quality });
        if (sleepLog.bedtime) setBedtime(sleepLog.bedtime);
        if (sleepLog.wakeup)  setWakeup(sleepLog.wakeup);
      } else {
        setSleepData(null);
      }

      const protein  = activeLogs.reduce((s, l) => s + +l.protein, 0);
      const calories = activeLogs.reduce((s, l) => s + +l.calories, 0);
      const protGoal = targets?.proteinG ?? 0;
      const calGoal  = targets?.calories ?? 0;

      const suppLogs = await db.supplement_logs.where('date').equals(today).toArray();
      const supps    = await db.supplements.where('active').equals(1).toArray();
      const allTaken = supps.length > 0 && suppLogs.filter(s => s.taken).length >= supps.length;

      setMissions([
        { id: 'log_food', label: 'Log at least one meal',                        xp: XP_REWARDS.LOG_MEAL,     done: activeLogs.length > 0,                                          color: CARB,  current: activeLogs.length,         goal: 3        },
        { id: 'protein',  label: `Hit protein goal (${Math.round(protGoal)}g)`,  xp: XP_REWARDS.HIT_PROTEIN, done: protGoal > 0 && protein >= protGoal,                            color: PROT,  current: Math.round(protein),        goal: Math.round(protGoal)  },
        { id: 'calories', label: 'Stay in calorie range',                         xp: XP_REWARDS.HIT_CALORIES,done: calGoal > 0 && calories >= calGoal * 0.85 && calories <= calGoal * 1.05, color: AMBER, current: Math.round(calories), goal: Math.round(calGoal)  },
        { id: 'water',    label: `Drink ${(waterGoal / 1000).toFixed(1)}L water`, xp: XP_REWARDS.HIT_WATER,  done: waterGoal > 0 && wt >= waterGoal,                               color: PROT,  current: wt,                         goal: waterGoal },
        { id: 'sleep',    label: 'Log your sleep',                                xp: XP_REWARDS.LOG_SLEEP,   done: sleepLog !== null,                                              color: MOON,  current: sleepLog ? 1 : 0,           goal: 1        },
        { id: 'supps',    label: 'Take all supplements',                          xp: XP_REWARDS.SUPPLEMENT_TAKEN * (supps.length || 1), done: allTaken, color: PINK, current: suppLogs.filter(s => s.taken).length, goal: supps.length },
      ].filter(m => m.xp > 0 && (m.id !== 'supps' || supps.length > 0)));
    } finally {
      loadingRef.current = false;
    }
  }, [today, targets, waterGoal]);

  useEffect(() => { load(); }, [load]);

  // Re-sync todayXP when XP is earned on any screen
  useEffect(() => {
    function onEarned() { setTodayXP(getTodayXP()); }
    window.addEventListener('xp-earned', onEarned);
    return () => window.removeEventListener('xp-earned', onEarned);
  }, []);

  // ── Sleep ──────────────────────────────────────────────────────────────────
  async function saveSleep() {
    const hours = calcSleepHours(bedtime, wakeup);
    if (!hours) return;
    const hist: Record<string, string> = (() => {
      try { return JSON.parse(localStorage.getItem('fs_training_type_history_v1') ?? '{}'); }
      catch { return {}; }
    })();
    const quality = estimateSleepQuality(hours, hist[today], hist[yesterday]);
    await logSleep(today, hours, quality, bedtime, wakeup);
    setSleepData({ bedtime, wakeup, hours, quality });
    setShowSleepForm(false);
    load();
  }

  // ── Water ──────────────────────────────────────────────────────────────────
  async function analyzeWater() {
    if (!waterInput.trim()) return;
    setWaterLoading(true); setWaterError(null); setWaterParsed(null);
    try {
      setWaterParsed(await parseWaterAI(waterInput.trim()));
    } catch {
      setWaterError('Could not parse — try again');
    } finally { setWaterLoading(false); }
  }

  async function addWaterFromInput() {
    if (!waterParsed) return;
    await addWater(today, waterParsed.ml, waterParsed.label);
    setWaterTotal(t => t + waterParsed!.ml);
    setWaterInput(''); setWaterParsed(null); setWaterError(null);
    load();
  }

  async function undoLastWater() {
    if (waterTotal <= 0) return;
    await removeLastWater(today);
    const t = await getWaterTotal(today);
    setWaterTotal(t);
    window.dispatchEvent(new CustomEvent('fs_water_updated'));
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const doneMissions = missions.filter(m => m.done).length;
  const mult         = getStreakMultiplier(streak.current);
  const multLabel    = mult.toFixed(2).replace(/\.?0+$/, '') + '×';

  const statTiles: StatTile[] = [
    { label: 'Total XP',   value: xp.toLocaleString(),                color: 'var(--c-ascend)'       },
    ...(!levelInfo.isMaxLevel ? [{ label: 'To Next', value: levelInfo.xpToNext.toLocaleString(), color: CARB }] : []),
    { label: 'Today',      value: `+${todayXP}`,                      color: AMBER                   },
    { label: 'Bonus',      value: multLabel,                           color: mult > 1 ? AMBER : 'var(--muted)', sub: 'streak mult' },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 100 }}>

      {/* ── Hero banner ── */}
      <div style={{ background: 'linear-gradient(145deg, #D97706 0%, #EA580C 100%)', padding: '18px 16px 24px' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 38, fontWeight: 900, color: '#fff', letterSpacing: -1.5, lineHeight: 1, marginBottom: 4 }}>Progress ✦</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Streak</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{streak.current}d</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Total XP</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{xp}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Level</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{levelInfo.level}</div>
          </div>
        </div>
      </div>

      {/* ── XP Ring ─────────────────────────────────────────────────────────── */}
      <XPRing xp={xp} />

      {/* ── Tier badges ─────────────────────────────────────────────────────── */}
      <TierBadges tier={levelInfo.tier} />

      {/* ── Stat strip ──────────────────────────────────────────────────────── */}
      <StatStrip tiles={statTiles} />

      {/* ── Streak card ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 12px' }}>
        <StreakCard current={streak.current} longest={streak.longest} />
      </div>

      {/* ── Week dots ───────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 12px' }}>
        <WeekDots dates={loggedDates} />
      </div>

      {/* ── Daily missions ──────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ background: 'var(--surf)', borderRadius: 16, border: '1px solid var(--edge)', overflow: 'hidden', boxShadow: T.shadowMd }}>
          <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
              Daily missions
            </div>
            <div style={{
              padding:    '3px 10px',
              borderRadius: 7,
              fontSize:   11,
              fontWeight: 700,
              background: doneMissions === missions.length && missions.length > 0 ? `${CARB}18` : 'var(--surf2)',
              color:      doneMissions === missions.length && missions.length > 0 ? CARB : 'var(--muted)',
              border:     `1px solid ${doneMissions === missions.length && missions.length > 0 ? CARB + '30' : 'var(--edge)'}`,
            }}>
              {doneMissions}/{missions.length}
            </div>
          </div>

          {/* Overall progress bar */}
          <div style={{ margin: '0 16px 10px', height: 5, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height:     '100%',
              borderRadius: 99,
              background: doneMissions === missions.length ? CARB : 'var(--accent)',
              width:      `${missions.length > 0 ? (doneMissions / missions.length) * 100 : 0}%`,
              transition: 'width 0.75s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: 'none',
            }} />
          </div>

          <div style={{ borderTop: '1px solid var(--edge)' }}>
            {missions.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  No missions yet
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Log food, water or a workout to unlock today's missions
                </div>
              </div>
            ) : missions.map((m, i) => (
              <div key={m.id} style={{ borderBottom: i < missions.length - 1 ? '1px solid var(--edge)' : 'none' }}>
                <MissionRow mission={m} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Daily challenge (rotating) ───────────────────────────────────────── */}
      <div style={{ padding: '0 16px 12px' }}>
        <button
          onClick={() => {
            if (bonusDone) return;
            localStorage.setItem(bonusKey, '1');
            setBonusDone(true);
            import('../lib/xp').then(({ grantXP }) => grantXP(`bonus_${today}_${todayBonus.id}`, todayBonus.xp));
          }}
          style={{
            width: '100%', textAlign: 'left', cursor: bonusDone ? 'default' : 'pointer',
            background: bonusDone ? `${todayBonus.color}14` : 'var(--surf)',
            borderRadius: 16, border: `1px solid ${bonusDone ? todayBonus.color + '40' : 'var(--edge)'}`,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.25s var(--ease)',
          }}
        >
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: bonusDone ? `${todayBonus.color}20` : 'var(--surf2)',
            border: `1px solid ${bonusDone ? todayBonus.color + '40' : 'var(--edge)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            boxShadow: 'none',
          }}>
            {bonusDone ? <IconCheck size={16} color={todayBonus.color} /> : todayBonus.emoji}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: todayBonus.color, marginBottom: 3 }}>
              Today's challenge
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: bonusDone ? 'var(--muted)' : 'var(--text)', textDecoration: bonusDone ? 'line-through' : 'none' }}>
              {todayBonus.label}
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 9px', borderRadius: 8, flexShrink: 0,
            background: bonusDone ? `${todayBonus.color}15` : 'var(--surf2)',
            border: `1px solid ${bonusDone ? todayBonus.color + '30' : 'var(--edge)'}`,
          }}>
            <IconBolt size={10} color={bonusDone ? todayBonus.color : 'var(--muted2)'} />
            <span style={{ fontSize: 11, fontWeight: 700, color: bonusDone ? todayBonus.color : 'var(--muted2)' }}>+{todayBonus.xp}</span>
          </div>
        </button>
      </div>

      {/* ── Sleep card ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '14px 16px', boxShadow: T.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={MOON} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
              Sleep
            </div>
            {sleepData && !showSleepForm && (
              <button onClick={() => setShowSleepForm(true)} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                Edit
              </button>
            )}
          </div>

          {sleepData && !showSleepForm ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: MOON, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>
                  {sleepData.hours?.toFixed(1)}h
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {sleepData.bedtime} – {sleepData.wakeup}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  display:      'inline-block',
                  padding:      '4px 12px',
                  borderRadius: 99,
                  fontSize:     12,
                  fontWeight:   700,
                  background:   sleepQualityColor(sleepData.quality) + '22',
                  color:        sleepQualityColor(sleepData.quality),
                  border:       `1px solid ${sleepQualityColor(sleepData.quality)}44`,
                }}>
                  {sleepQualityLabel(sleepData.quality)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Quality estimated from training</div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                {(['Bedtime', 'Wake up'] as const).map((lbl, i) => (
                  <div key={lbl} style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{lbl}</div>
                    <input
                      type="time"
                      value={i === 0 ? bedtime : wakeup}
                      onChange={e => i === 0 ? setBedtime(e.target.value) : setWakeup(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--edge2)', background: 'var(--surf2)', color: 'var(--text)', fontSize: 15, fontWeight: 600, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
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

      {/* ── Water card ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '14px 16px', boxShadow: T.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={PROT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
              </svg>
              Hydration
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PROT, fontVariantNumeric: 'tabular-nums' }}>
              {(waterTotal / 1000).toFixed(1)}L / {(waterGoal / 1000).toFixed(1)}L
            </div>
          </div>
          <div style={{ height: 5, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              height:     '100%',
              borderRadius: 99,
              background: waterTotal >= waterGoal ? CARB : PROT,
              width:      `${Math.min((waterTotal / waterGoal) * 100, 100)}%`,
              transition: 'width 0.5s var(--ease)',
              boxShadow: 'none',
            }} />
          </div>
          <textarea
            placeholder='Describe what you drank, e.g. "2 glasses of water, a coffee, protein shake"'
            value={waterInput}
            onChange={e => { setWaterInput(e.target.value); setWaterParsed(null); setWaterError(null); }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyzeWater(); }}
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--edge2)', background: 'var(--surf2)', color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5 }}
          />
          {waterParsed && (
            <div style={{ margin: '8px 0', padding: '10px 14px', borderRadius: 10, background: PROT + '12', border: `1px solid ${PROT}33` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: PROT }}>{waterParsed.ml}ml</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{waterParsed.label}</div>
            </div>
          )}
          {waterError && <div style={{ fontSize: 12, color: T.red, margin: '6px 0' }}>{waterError}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={waterParsed ? addWaterFromInput : analyzeWater}
              disabled={waterLoading || !waterInput.trim()}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                background: waterLoading || !waterInput.trim() ? 'var(--edge2)' : PROT,
                color:      waterLoading || !waterInput.trim() ? 'var(--muted)' : '#fff',
                fontWeight: 700, fontSize: 13,
                cursor:     waterLoading || !waterInput.trim() ? 'default' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {waterLoading ? 'Analyzing…' : waterParsed ? '+ Log it' : 'Analyze with AI'}
            </button>
            {waterTotal > 0 && (
              <button
                onClick={undoLastWater}
                title="Undo last entry"
                style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--edge)', background: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
              >
                ↩
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Achievements ────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
          Achievements
        </div>
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

      {/* ── Level path ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
          Level path
        </div>
        <div style={{ background: 'var(--surf)', borderRadius: 16, border: '1px solid var(--edge)', overflow: 'hidden', boxShadow: T.shadowMd }}>
          {LEVELS.map((l, i) => {
            const reached   = xp >= l.xp;
            const isCurrent = levelInfo.level === l.level;
            const cfg       = TIER_CONFIG[l.tier];
            return (
              <div key={l.level} style={{
                display:      'flex',
                alignItems:   'center',
                gap:          12,
                padding:      '12px 16px',
                borderBottom: i < LEVELS.length - 1 ? '1px solid var(--edge)' : 'none',
                background:   isCurrent ? `${cfg.color}10` : 'transparent',
                transition:   'background 0.2s ease',
              }}>
                <div style={{
                  fontSize: 20,
                  filter: reached ? 'none' : 'grayscale(0.6) brightness(0.7)',
                }}>
                  {l.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500, color: reached ? 'var(--text)' : 'var(--muted2)' }}>
                      Lv.{l.level} — {l.name}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: 8, color: cfg.color, fontWeight: 900, padding: '2px 6px', background: cfg.color + '22', borderRadius: 99, letterSpacing: 0.5 }}>
                        YOU
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: cfg.color, fontWeight: 700, opacity: 0.8 }}>
                      {l.tier.toUpperCase()}
                    </span>
                  </div>
                  {LEVEL_PERKS[l.level] && (
                    <div style={{ fontSize: 10, color: reached ? cfg.color : 'var(--muted2)', fontWeight: reached ? 600 : 400, marginBottom: 1 }}>
                      {LEVEL_PERKS[l.level]}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {l.xp.toLocaleString()} XP
                  </div>
                </div>
                {reached && !isCurrent && (
                  <div style={{ color: CARB, fontSize: 15, fontWeight: 700 }}>✓</div>
                )}
                {!reached && (
                  <div style={{ color: 'var(--muted2)', fontSize: 12 }}>🔒</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
