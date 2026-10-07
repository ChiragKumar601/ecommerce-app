import type { z } from 'zod';
import type { guestDataSchema } from '@app/shared';
import type { AppContext } from '../api/context.js';
import { AppError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { addMs, formatIstDateTime } from '../domain/time.js';
import type { Account } from '../generated/prisma/client.js';
import { hashSecret, randomToken, sha256, verifySecret } from '../lib/crypto.js';
import { mergeGuestBag } from './bag.js';
import { mergeGuestWishlist } from './wishlist.js';

// Accounts, authentication and sessions (spec §6.8; plan S10.1–S10.5).

type GuestData = z.output<typeof guestDataSchema>;
export interface PublicAccount {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}
export const publicAccount = (a: Account): PublicAccount => ({ id: a.id, name: a.name, email: a.email, phone: a.phone });

interface Lockout {
  threshold: number;
  durationMs: number;
}
const lockoutCfg = (ctx: AppContext) => ctx.settings.get<Lockout>('auth.lockout', { threshold: 5, durationMs: 900_000 });
const minutesLeft = (until: Date, now: Date) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
const lockedError = (until: Date, now: Date) => new AppError('ACCOUNT_LOCKED', { minutes: minutesLeft(until, now), retryAfterSeconds: Math.ceil((until.getTime() - now.getTime()) / 1000) });

function findByIdentifier(ctx: AppContext, id: { kind: 'email' | 'phone'; value: string }) {
  return ctx.db.account.findUnique({ where: id.kind === 'email' ? { email: id.value } : { phone: id.value } });
}

// ── Sessions ────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'wco_sid';

export async function createSession(ctx: AppContext, accountId: string): Promise<{ token: string; maxAgeMs: number }> {
  const token = randomToken();
  const now = ctx.clock.now();
  const absolute = await ctx.settings.get<number>('auth.sessionAbsoluteMs', 86_400_000);
  await ctx.db.session.create({ data: { id: sha256(token), accountId, createdAt: now, lastActivityAt: now, expiresAt: addMs(now, absolute) } });
  await ctx.db.account.update({ where: { id: accountId }, data: { lastActivityAt: now } });
  return { token, maxAgeMs: absolute };
}

export type SessionState = { status: 'none' } | { status: 'expired' } | { status: 'active'; accountId: string; sessionId: string };

const ACTIVITY_THROTTLE_MS = 60_000;

/** Resolves a session token: idle (60 min) and absolute (24 h) expiry; activity writes at most once a minute (AUTH-011). */
export async function resolveSession(ctx: AppContext, token: string | undefined): Promise<SessionState> {
  if (!token) return { status: 'none' };
  const id = sha256(token);
  const s = await ctx.db.session.findUnique({ where: { id } });
  if (!s) return { status: 'expired' };
  const now = ctx.clock.now();
  const idle = await ctx.settings.get<number>('auth.sessionIdleMs', 3_600_000);
  if (s.revokedAt || now >= s.expiresAt || now.getTime() - s.lastActivityAt.getTime() > idle) return { status: 'expired' };
  if (now.getTime() - s.lastActivityAt.getTime() > ACTIVITY_THROTTLE_MS) {
    await ctx.db.$transaction([
      ctx.db.session.update({ where: { id }, data: { lastActivityAt: now } }),
      ctx.db.account.update({ where: { id: s.accountId }, data: { lastActivityAt: now } }),
    ]);
  }
  return { status: 'active', accountId: s.accountId, sessionId: id };
}

export async function revokeSession(ctx: AppContext, sessionId: string) {
  await ctx.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: ctx.clock.now() } });
}

// ── Recent searches (SRC-009, customer part) ────────────────────────────────

const RECENT_MAX = 10;

export async function listRecentSearches(ctx: AppContext, accountId: string): Promise<string[]> {
  const rows = await ctx.db.recentSearch.findMany({ where: { accountId }, orderBy: { searchedAt: 'desc' }, take: RECENT_MAX });
  return rows.map((r) => r.term);
}

/** Adds terms (most recent first), de-duplicated case-insensitively, keeping at most 10. */
export async function addRecentSearches(ctx: AppContext, accountId: string, termsNewestFirst: string[]) {
  const now = ctx.clock.now().getTime();
  // The first term is the newest: give each a slightly older timestamp, in order.
  const terms = termsNewestFirst.map((t) => t.trim().slice(0, 100)).filter(Boolean);
  await ctx.db.$transaction(async (tx) => {
    for (let i = terms.length - 1; i >= 0; i--) {
      const term = terms[i]!;
      const at = new Date(now - i);
      await tx.recentSearch.upsert({
        where: { accountId_termLower: { accountId, termLower: term.toLowerCase() } },
        create: { id: newId(), accountId, term, termLower: term.toLowerCase(), searchedAt: at },
        update: { term, searchedAt: at },
      });
    }
    const extra = await tx.recentSearch.findMany({ where: { accountId }, orderBy: { searchedAt: 'desc' }, skip: RECENT_MAX, select: { id: true } });
    if (extra.length) await tx.recentSearch.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  });
}

export async function clearRecentSearches(ctx: AppContext, accountId: string) {
  await ctx.db.recentSearch.deleteMany({ where: { accountId } });
}

/** Guest data merged into the account at login/sign-up (AUTH-012): bag, wishlist, coupon, recent searches. */
async function mergeGuest(ctx: AppContext, accountId: string, guest: GuestData): Promise<string[]> {
  if (guest.recentSearches.length) await addRecentSearches(ctx, accountId, guest.recentSearches);
  await mergeGuestWishlist(ctx, accountId, guest.wishlist);
  return mergeGuestBag(ctx, accountId, { lines: guest.bag, coupon: guest.coupon });
}

// ── Sign-up (AUTH-001…003) ───────────────────────────────────────────────────

export interface SignupData {
  name: string;
  email?: string;
  phone?: string;
  password: string;
  securityQuestionId: string;
  securityAnswer: string;
  guest: GuestData;
}

export async function signup(ctx: AppContext, d: SignupData) {
  const question = await ctx.db.securityQuestion.findFirst({ where: { id: d.securityQuestionId, active: true } });
  if (!question) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'securityQuestionId', code: 'invalid', message: 'Choose a security question' }] });
  const [taken] = await Promise.all([
    ctx.db.account.findFirst({ where: { OR: [...(d.email ? [{ email: d.email }] : []), ...(d.phone ? [{ phone: d.phone }] : [])] } }),
  ]);
  if (taken) {
    const field = d.email && taken.email === d.email ? 'email' : 'phone';
    throw new AppError('IDENTIFIER_TAKEN', { context: 'signup', fieldErrors: [{ field, code: 'taken', message: 'An account with this email/phone already exists.' }] });
  }
  const [passwordHash, securityAnswerHash] = await Promise.all([hashSecret(d.password), hashSecret(d.securityAnswer)]);
  const now = ctx.clock.now();
  const grant = await ctx.settings.get<number>('credits.signupGrant', 50_000);
  const id = newId();
  try {
    await ctx.db.$transaction([
      ctx.db.account.create({
        data: {
          id, name: d.name, email: d.email ?? null, phone: d.phone ?? null, passwordHash, securityQuestionId: question.id, securityAnswerHash,
          ageConfirmedAt: now, createdAt: now, lastActivityAt: now,
        },
      }),
      ...(grant > 0 ? [ctx.db.creditLedgerEntry.create({ data: { id: newId(), accountId: id, amount: grant, type: 'signup_grant', note: 'Welcome credits', createdAt: now } })] : []),
    ]);
  } catch (e) {
    // A concurrent sign-up with the same identifier hits the unique index.
    if ((e as { code?: string }).code === 'P2002') throw new AppError('IDENTIFIER_TAKEN', { context: 'signup' });
    throw e;
  }
  const account = (await ctx.db.account.findUniqueOrThrow({ where: { id } }));
  const messages = await mergeGuest(ctx, id, d.guest);
  const session = await createSession(ctx, id);
  return { account: publicAccount(account), session, messages, notice: null as string | null };
}

// ── Login (AUTH-004…006, AUTH-010) ───────────────────────────────────────────

export async function login(ctx: AppContext, identifier: { kind: 'email' | 'phone'; value: string }, password: string, guest: GuestData, clientKey: string) {
  const now = ctx.clock.now();
  const cfg = await lockoutCfg(ctx);
  const account = await findByIdentifier(ctx, identifier);
  // Always exactly one Argon2 verify, so unknown identifiers aren't faster (AUTH-005).
  const ok = await verifySecret(account?.passwordHash ?? null, password);

  if (!account) {
    // Client-keyed counter for unknown identifiers: the same lockout behaviour as a real account (SD-38).
    const key = `login:${clientKey}:${identifier.kind}:${identifier.value}`;
    const t = await ctx.db.authThrottle.findUnique({ where: { key } });
    if (t?.lockedUntil && t.lockedUntil > now) throw lockedError(t.lockedUntil, now);
    const failures = (t?.lockedUntil && t.lockedUntil <= now ? 0 : (t?.failures ?? 0)) + 1;
    const lock = failures >= cfg.threshold ? addMs(now, cfg.durationMs) : null;
    await ctx.db.authThrottle.upsert({ where: { key }, create: { key, failures: lock ? 0 : failures, lockedUntil: lock }, update: { failures: lock ? 0 : failures, lockedUntil: lock } });
    if (lock) throw lockedError(lock, now);
    throw new AppError('INVALID_CREDENTIALS');
  }

  if (account.lockedUntil && account.lockedUntil > now) throw lockedError(account.lockedUntil, now);
  if (!ok) {
    const failures = account.failedLoginCount + 1;
    const lock = failures >= cfg.threshold ? addMs(now, cfg.durationMs) : null;
    await ctx.db.account.update({ where: { id: account.id }, data: { failedLoginCount: lock ? 0 : failures, lockedUntil: lock } });
    if (lock) throw lockedError(lock, now);
    throw new AppError('INVALID_CREDENTIALS');
  }

  const notice = account.passwordChangeNoticePending && account.passwordChangedAt
    ? `Your password was changed on ${formatIstDateTime(account.passwordChangedAt)}. If this wasn't you, reset it now.`
    : null;
  await ctx.db.account.update({ where: { id: account.id }, data: { failedLoginCount: 0, lockedUntil: null, passwordChangeNoticePending: false } });
  const messages = await mergeGuest(ctx, account.id, guest);
  const session = await createSession(ctx, account.id);
  return { account: publicAccount(account), session, messages, notice };
}

// ── Password reset (AUTH-008, AUTH-009) ─────────────────────────────────────

const RESET_TOKEN_TTL_MS = 10 * 60_000;

/** Step 2: question chosen from the full list + answer. Neutral failure (RESET_FAILED), one Argon2 verify always. */
export async function verifyReset(ctx: AppContext, identifier: { kind: 'email' | 'phone'; value: string }, questionId: string, answer: string) {
  const now = ctx.clock.now();
  const cfg = await lockoutCfg(ctx);
  const account = await findByIdentifier(ctx, identifier);
  const answerOk = await verifySecret(account?.securityAnswerHash ?? null, answer);
  const correct = !!account && account.securityQuestionId === questionId && answerOk;

  if (!account) {
    const key = `reset:${identifier.kind}:${identifier.value}`;
    const t = await ctx.db.authThrottle.findUnique({ where: { key } });
    if (t?.lockedUntil && t.lockedUntil > now) throw lockedError(t.lockedUntil, now);
    const failures = (t?.lockedUntil && t.lockedUntil <= now ? 0 : (t?.failures ?? 0)) + 1;
    const lock = failures >= cfg.threshold ? addMs(now, cfg.durationMs) : null;
    await ctx.db.authThrottle.upsert({ where: { key }, create: { key, failures: lock ? 0 : failures, lockedUntil: lock }, update: { failures: lock ? 0 : failures, lockedUntil: lock } });
    if (lock) throw lockedError(lock, now);
    throw new AppError('RESET_FAILED');
  }
  if (account.resetLockedUntil && account.resetLockedUntil > now) throw lockedError(account.resetLockedUntil, now);
  if (!correct) {
    const failures = account.failedResetCount + 1;
    const lock = failures >= cfg.threshold ? addMs(now, cfg.durationMs) : null;
    await ctx.db.account.update({ where: { id: account.id }, data: { failedResetCount: lock ? 0 : failures, resetLockedUntil: lock } });
    if (lock) throw lockedError(lock, now);
    throw new AppError('RESET_FAILED');
  }
  const token = randomToken();
  await ctx.db.$transaction([
    ctx.db.account.update({ where: { id: account.id }, data: { failedResetCount: 0, resetLockedUntil: null } }),
    ctx.db.passwordResetToken.create({ data: { id: sha256(token), accountId: account.id, expiresAt: addMs(now, RESET_TOKEN_TTL_MS) } }),
  ]);
  return { resetToken: token };
}

/** Step 3: set the new password; revoke every session; flag the notice for the next login. */
export async function completeReset(ctx: AppContext, resetToken: string, password: string) {
  const now = ctx.clock.now();
  const t = await ctx.db.passwordResetToken.findUnique({ where: { id: sha256(resetToken) } });
  if (!t || t.usedAt || t.expiresAt <= now) throw new AppError('RESET_FAILED');
  const passwordHash = await hashSecret(password);
  await ctx.db.$transaction([
    ctx.db.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: now } }),
    ctx.db.account.update({
      where: { id: t.accountId },
      data: { passwordHash, passwordChangedAt: now, passwordChangeNoticePending: true, failedLoginCount: 0, lockedUntil: null },
    }),
    ctx.db.session.updateMany({ where: { accountId: t.accountId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
}

export async function getAccount(ctx: AppContext, accountId: string) {
  const a = await ctx.db.account.findUnique({ where: { id: accountId } });
  if (!a) throw new AppError('SESSION_EXPIRED');
  return a;
}
