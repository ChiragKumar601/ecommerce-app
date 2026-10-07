import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { addressSchema, cardSchema, profileSchema, redeemGiftCardSchema, supportRequestSchema } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { idempotent } from '../middleware/idempotency.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { accountId, requireAuth } from '../middleware/session.js';
import { istDate } from '../../domain/time.js';
import {
  createSupportRequest, getCredits, getDemoHelp, getProfile, listCards, listGiftCards, listSupportRequests, redeemGiftCard, removeCard, saveCard, setDefaultCard, updateProfile,
} from '../../services/account.js';
import { createAddress, deleteAddress, listAddresses, listStates, setDefaultAddress, updateAddress } from '../../services/address.js';

/** Account sections (S12; spec §11.2 Profile, Cards, Wallet, Support). Every route is scoped to the session's account (API-001). */
export function meRouter(ctx: AppContext): Router {
  const r = Router();
  const today = () => istDate(ctx.clock.now());
  const limited = (group: string): RequestHandler => async (req, res, next) =>
    rateLimit(ctx.db, ctx.clock, { group, perMinute: await ctx.settings.get<number>('rateLimit.perMinute', 20) })(req, res, next);
  // Schemas that depend on today's date are built per request.
  const validateWith = (make: () => z.ZodType): RequestHandler => (req, res, next) => validate(make())(req, res, next);
  const idParam = validate(z.object({ id: z.uuid() }), 'params');

  r.get('/demo-help', handler(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(await getDemoHelp(ctx));
  }));

  r.get('/states', handler(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(await listStates(ctx));
  }));

  r.use('/me', requireAuth, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  r.get('/me', handler(async (req, res) => res.json(await getProfile(ctx, accountId(req)))));
  r.patch('/me', validateWith(() => profileSchema(today())), handler(async (req, res) => {
    res.json(await updateProfile(ctx, accountId(req), req.body as z.output<ReturnType<typeof profileSchema>>));
  }));

  r.get('/me/credits', validate(z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) }), 'query'), handler(async (req, res) => {
    res.json(await getCredits(ctx, accountId(req), (req.query as unknown as { page: number }).page));
  }));

  r.get('/me/gift-cards', handler(async (req, res) => res.json(await listGiftCards(ctx, accountId(req)))));
  r.post('/me/gift-cards/redeem', limited('giftcard'), idempotent(ctx), validate(redeemGiftCardSchema), handler(async (req, res) => {
    res.status(201).json(await redeemGiftCard(ctx, accountId(req), (req.body as { code: string }).code));
  }));

  r.get('/me/cards', handler(async (req, res) => res.json(await listCards(ctx, accountId(req)))));
  r.post('/me/cards', validateWith(() => cardSchema(today())), handler(async (req, res) => {
    // The CVV is validated and then dropped: it is never stored (PRF-005, SEC-003).
    const { nameOnCard, number, expiry } = req.body as z.output<ReturnType<typeof cardSchema>>;
    await saveCard(ctx, accountId(req), { nameOnCard, number, expiry });
    res.status(201).json(await listCards(ctx, accountId(req)));
  }));
  r.delete('/me/cards/:id', idParam, handler(async (req, res) => res.json(await removeCard(ctx, accountId(req), String(req.params['id'])))));
  r.post('/me/cards/:id/default', idParam, handler(async (req, res) => res.json(await setDefaultCard(ctx, accountId(req), String(req.params['id'])))));

  // Addresses (ADDR-*; S13)
  type Addr = z.output<typeof addressSchema>;
  r.get('/me/addresses', handler(async (req, res) => res.json(await listAddresses(ctx, accountId(req)))));
  r.post('/me/addresses', validate(addressSchema), handler(async (req, res) => res.status(201).json(await createAddress(ctx, accountId(req), req.body as Addr))));
  r.patch('/me/addresses/:id', idParam, validate(addressSchema), handler(async (req, res) => res.json(await updateAddress(ctx, accountId(req), String(req.params['id']), req.body as Addr))));
  r.delete('/me/addresses/:id', idParam, handler(async (req, res) => res.json(await deleteAddress(ctx, accountId(req), String(req.params['id'])))));
  r.post('/me/addresses/:id/default', idParam, handler(async (req, res) => res.json(await setDefaultAddress(ctx, accountId(req), String(req.params['id'])))));

  r.get('/me/support-requests', handler(async (req, res) => res.json(await listSupportRequests(ctx, accountId(req)))));
  r.post('/me/support-requests', idempotent(ctx), validate(supportRequestSchema), handler(async (req, res) => {
    res.status(201).json(await createSupportRequest(ctx, accountId(req), req.body as z.output<typeof supportRequestSchema>));
  }));
  return r;
}
