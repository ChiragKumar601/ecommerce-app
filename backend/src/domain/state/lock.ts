import { MS } from '../time.js';

/**
 * Account lock (spec §7.8), used separately for login and for password reset:
 * the 5th consecutive failure locks for 15 minutes; the lock lifts when the time passes.
 */
export const LOCK_THRESHOLD = 5;
export const LOCK_DURATION_MS = 15 * MS.minute;

export interface LockState {
  failedCount: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** Minutes left on a lock, rounded up (for the ACCOUNT_LOCKED message). */
export function lockMinutesLeft(state: LockState, now: Date): number {
  if (!isLocked(state, now)) return 0;
  return Math.ceil((state.lockedUntil!.getTime() - now.getTime()) / MS.minute);
}

/** Records a failed attempt; the 5th consecutive failure starts a 15-minute lock and resets the count. */
export function registerFailure(state: LockState, now: Date): LockState {
  if (isLocked(state, now)) return state;
  const failedCount = state.failedCount + 1;
  if (failedCount >= LOCK_THRESHOLD) return { failedCount: 0, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
  return { failedCount, lockedUntil: null };
}

/** A success resets the counter (AUTH-006). */
export function registerSuccess(): LockState {
  return { failedCount: 0, lockedUntil: null };
}
