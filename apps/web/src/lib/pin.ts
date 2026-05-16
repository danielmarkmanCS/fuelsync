import { db } from './db';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getState() {
  const rows = await db.pin_state.toArray();
  return rows[0] ?? null;
}

export async function setupPin(pin: string): Promise<void> {
  const hash = await sha256(pin);
  await db.pin_state.clear();
  await db.pin_state.add({ hash, attempts: 0, lockedUntil: null, totalAttempts: 0 });
}

export async function hasPin(): Promise<boolean> {
  return (await db.pin_state.count()) > 0;
}

export interface VerifyResult {
  ok: boolean;
  locked: boolean;
  lockedUntil: number | null;
  attemptsLeft: number; // before next lockout tier
  wiped: boolean;
}

const LOCKOUT_TIERS: Array<{ after: number; ms: number }> = [
  { after: 3,  ms: 30_000 },
  { after: 6,  ms: 5 * 60_000 },
  { after: 10, ms: 30 * 60_000 },
];
const WIPE_AFTER = 15;

export async function verifyPin(pin: string): Promise<VerifyResult> {
  const state = await getState();
  if (!state) return { ok: false, locked: false, lockedUntil: null, attemptsLeft: 3, wiped: false };

  const now = Date.now();
  if (state.lockedUntil && now < state.lockedUntil) {
    return { ok: false, locked: true, lockedUntil: state.lockedUntil, attemptsLeft: 0, wiped: false };
  }

  const hash = await sha256(pin);
  if (hash === state.hash) {
    await db.pin_state.update(state.id!, { attempts: 0, lockedUntil: null, totalAttempts: 0 });
    return { ok: true, locked: false, lockedUntil: null, attemptsLeft: 3, wiped: false };
  }

  const newTotal = state.totalAttempts + 1;

  if (newTotal >= WIPE_AFTER) {
    await db.delete();
    indexedDB.deleteDatabase('FuelSyncDB');
    return { ok: false, locked: false, lockedUntil: null, attemptsLeft: 0, wiped: true };
  }

  const newAttempts = state.attempts + 1;
  let lockedUntil: number | null = null;
  for (const tier of [...LOCKOUT_TIERS].reverse()) {
    if (newTotal >= tier.after) {
      lockedUntil = now + tier.ms;
      break;
    }
  }

  const nextTier = LOCKOUT_TIERS.find((t) => t.after > newTotal);
  const attemptsLeft = nextTier ? nextTier.after - newTotal : 0;

  await db.pin_state.update(state.id!, { attempts: newAttempts, lockedUntil, totalAttempts: newTotal });

  return { ok: false, locked: !!lockedUntil, lockedUntil, attemptsLeft, wiped: false };
}

export async function clearPin(): Promise<void> {
  await db.pin_state.clear();
}
