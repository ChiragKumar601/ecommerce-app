import { Router } from 'express';
import { z } from 'zod';
import { loginSchema, resetCompleteSchema, resetVerifySchema, signupSchema } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { clientIp, rateLimit } from '../middleware/rateLimit.js';
import { accountId, clearSessionCookie, requireAuth, setSessionCookie } from '../middleware/session.js';
import {
  addRecentSearches, clearRecentSearches, completeReset, getAccount, listRecentSearches, login, publicAccount, revokeSession, signup, verifyReset,
} from '../../services/auth.js';

/** Auth (S10): sign-up, login, password reset, logout, session; account recent searches. */
export function authRouter(ctx: AppContext): Router {
  const r = Router();
  const limit = (group: string) => async (req: Parameters<ReturnType<typeof rateLimit>>[0], res: Parameters<ReturnType<typeof rateLimit>>[1], next: Parameters<ReturnType<typeof rateLimit>>[2]) =>
    rateLimit(ctx.db, ctx.clock, { group, perMinute: await ctx.settings.get<number>('rateLimit.perMinute', 20) })(req, res, next);

  r.get('/auth/security-questions', handler(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    const qs = await ctx.db.securityQuestion.findMany({ where: { active: true }, orderBy: { order: 'asc' } });
    res.json(qs.map((q) => ({ id: q.id, text: q.text })));
  }));

  r.post('/auth/signup', limit('signup'), validate(signupSchema), handler(async (req, res) => {
    const b = req.body as z.output<typeof signupSchema>;
    const out = await signup(ctx, b);
    setSessionCookie(ctx, res, out.session.token, out.session.maxAgeMs);
    res.status(201).json({ account: out.account, messages: out.messages, notice: out.notice });
  }));

  r.post('/auth/login', limit('login'), validate(loginSchema), handler(async (req, res) => {
    const b = req.body as z.output<typeof loginSchema>;
    const out = await login(ctx, b.identifier, b.password, b.guest, clientIp(req));
    setSessionCookie(ctx, res, out.session.token, out.session.maxAgeMs);
    res.json({ account: out.account, messages: out.messages, notice: out.notice });
  }));

  r.post('/auth/reset/verify', limit('reset'), validate(resetVerifySchema), handler(async (req, res) => {
    const b = req.body as z.output<typeof resetVerifySchema>;
    res.json(await verifyReset(ctx, b.identifier, b.securityQuestionId, b.securityAnswer));
  }));

  r.post('/auth/reset/complete', limit('reset'), validate(resetCompleteSchema), handler(async (req, res) => {
    const b = req.body as z.output<typeof resetCompleteSchema>;
    await completeReset(ctx, b.resetToken, b.password);
    clearSessionCookie(ctx, res);
    res.json({ ok: true });
  }));

  r.post('/auth/logout', handler(async (req, res) => {
    if (req.session.status === 'active') await revokeSession(ctx, req.session.sessionId);
    clearSessionCookie(ctx, res);
    res.json({ ok: true });
  }));

  /** Never 401: tells the client whether it has a session (AUTH-015 guards, header state). */
  r.get('/auth/session', handler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.session.status !== 'active') return res.json({ authenticated: false, expired: req.session.status === 'expired' });
    const a = await getAccount(ctx, req.session.accountId);
    res.json({ authenticated: true, account: publicAccount(a), hasUnseenOrderUpdates: false });
  }));

  r.get('/search/recent', requireAuth, handler(async (req, res) => res.json({ terms: await listRecentSearches(ctx, accountId(req)) })));
  r.post('/search/recent', requireAuth, validate(z.object({ term: z.string().trim().min(1).max(100) })), handler(async (req, res) => {
    await addRecentSearches(ctx, accountId(req), [(req.body as { term: string }).term]);
    res.json({ terms: await listRecentSearches(ctx, accountId(req)) });
  }));
  r.delete('/search/recent', requireAuth, handler(async (req, res) => {
    await clearRecentSearches(ctx, accountId(req));
    res.json({ terms: [] });
  }));
  return r;
}
