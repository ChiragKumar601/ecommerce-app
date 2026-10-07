import type { AppContext } from '../../api/context.js';
import { expirePayments, resolvePaymentAttempts } from '../../services/payment.js';

/** A scheduled job: safe to run twice (API-007), because every transition checks the current state. */
export interface Job {
  name: string;
  everyMs: number;
  run: (ctx: AppContext) => Promise<number>;
}

/** Scheduler jobs (plan §7.5). */
export const JOBS: Job[] = [
  // Outcomes are revealed 2–3 s after Pay; a 1 s tick lands them within 2–4 s (PAY-008, PR-12).
  { name: 'resolvePaymentAttempts', everyMs: 1000, run: resolvePaymentAttempts },
  { name: 'expirePayments', everyMs: 5000, run: expirePayments },
];
