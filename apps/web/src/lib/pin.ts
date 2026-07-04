import { db } from './db';

const PBKDF2_ITERATIONS = 100_000;

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

function saltToHex(salt: Uint8Array): string {
  return Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToSalt(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

async function pbkdf2Hash(text: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(text), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, 256,
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getState() {
  const rows = await db.pin_state.toArray();
  return rows[0] ?? null;
}

export async function setupPin(pin: string): Promise<void> {
  const salt = randomSalt();
  const hash = await pbkdf2Hash(pin, salt);
  await db.pin_state.clear();
  await db.pin_state.add({
    hash, salt: saltToHex(salt),
    attempts: 0, lockedUntil: null, totalAttempts: 0,
  });
}

export async function setupSecurityQuestion(question: string, answer: string): Promise<void> {
  const state = await getState();
  if (!state) return;
  const salt = randomSalt();
  const hash = await pbkdf2Hash(answer.toLowerCase().trim(), salt);
  await db.pin_state.update(state.id!, {
    securityQuestion: question,
    securityAnswerHash: hash,
    securityAnswerSalt: saltToHex(salt),
    securityAnswerAttempts: 0,
  });
}

export async function hasPin(): Promise<boolean> {
  return (await db.pin_state.count()) > 0;
}

export async function getSecurityQuestion(): Promise<string | null> {
  const state = await getState();
  return state?.securityQuestion ?? null;
}

export interface VerifyResult {
  ok: boolean;
  locked: boolean;
  lockedUntil: number | null;
  attemptsLeft: number;
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

  // Guard: if no salt (old SHA-256 record), always fail gracefully
  if (!state.salt) {
    return { ok: false, locked: false, lockedUntil: null, attemptsLeft: 3, wiped: false };
  }

  const hash = await pbkdf2Hash(pin, hexToSalt(state.salt));
  if (hash === state.hash) {
    await db.pin_state.update(state.id!, { attempts: 0, lockedUntil: null, totalAttempts: 0 });
    return { ok: true, locked: false, lockedUntil: null, attemptsLeft: 3, wiped: false };
  }

  const newTotal = state.totalAttempts + 1;
  if (newTotal >= WIPE_AFTER) {
    await db.delete();
    indexedDB.deleteDatabase('FuelSyncDB');
    localStorage.clear();
    return { ok: false, locked: false, lockedUntil: null, attemptsLeft: 0, wiped: true };
  }

  const newAttempts = state.attempts + 1;
  let lockedUntil: number | null = null;
  for (const tier of [...LOCKOUT_TIERS].reverse()) {
    if (newTotal >= tier.after) { lockedUntil = now + tier.ms; break; }
  }

  const nextTier = LOCKOUT_TIERS.find((t) => t.after > newTotal);
  const attemptsLeft = nextTier ? nextTier.after - newTotal : 0;

  await db.pin_state.update(state.id!, { attempts: newAttempts, lockedUntil, totalAttempts: newTotal });
  return { ok: false, locked: !!lockedUntil, lockedUntil, attemptsLeft, wiped: false };
}

export interface SecurityVerifyResult {
  ok: boolean;
  attemptsLeft: number;
  wiped: boolean;
}

export async function verifySecurityAnswer(answer: string): Promise<SecurityVerifyResult> {
  const state = await getState();
  if (!state?.securityAnswerHash || !state.securityAnswerSalt) {
    return { ok: false, attemptsLeft: 0, wiped: false };
  }

  const hash = await pbkdf2Hash(answer.toLowerCase().trim(), hexToSalt(state.securityAnswerSalt));
  if (hash === state.securityAnswerHash) {
    await db.pin_state.update(state.id!, { securityAnswerAttempts: 0 });
    return { ok: true, attemptsLeft: 5, wiped: false };
  }

  const newAttempts = (state.securityAnswerAttempts ?? 0) + 1;
  if (newAttempts >= 5) {
    await db.delete();
    indexedDB.deleteDatabase('FuelSyncDB');
    localStorage.clear();
    return { ok: false, attemptsLeft: 0, wiped: true };
  }

  await db.pin_state.update(state.id!, { securityAnswerAttempts: newAttempts });
  return { ok: false, attemptsLeft: 5 - newAttempts, wiped: false };
}

export async function resetPin(newPin: string): Promise<void> {
  const state = await getState();
  if (!state) return;
  const salt = randomSalt();
  const hash = await pbkdf2Hash(newPin, salt);
  await db.pin_state.update(state.id!, {
    hash, salt: saltToHex(salt),
    attempts: 0, lockedUntil: null, totalAttempts: 0,
    securityAnswerAttempts: 0,
  });
}

export async function clearPin(): Promise<void> {
  await db.pin_state.clear();
}
