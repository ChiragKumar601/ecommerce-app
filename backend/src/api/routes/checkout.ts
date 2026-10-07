import { Router } from 'express';
import { z } from 'zod';
import { couponCodeSchema, phoneSchema } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { accountId, requireAuth } from '../middleware/session.js';
import {
  acknowledgeChanges, getCheckout, setCheckoutAddress, setCheckoutCoupon, setCheckoutPhone, setCheckoutQuantity, setCheckoutStep, startCheckout, type StartInput,
} from '../../services/checkout.js';

const startSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('bag'), addressId: z.uuid().optional() }),
  z.object({ source: z.literal('buy_now'), variantId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(10).optional(), addressId: z.uuid().optional() }),
]);

/** Checkout (S14; spec §11.2 StartCheckout, SetPhone, SelectAddress, ApplyCoupon). Customers only. */
export function checkoutRouter(ctx: AppContext): Router {
  const r = Router();
  r.use('/checkout', requireAuth, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const id = validate(z.object({ id: z.uuid() }), 'params');
  const cid = (req: { params: Record<string, unknown> }) => String(req.params['id']);

  r.post('/checkout', validate(startSchema), handler(async (req, res) => res.status(201).json(await startCheckout(ctx, accountId(req), req.body as StartInput))));
  r.get('/checkout/:id', id, handler(async (req, res) => res.json(await getCheckout(ctx, accountId(req), cid(req)))));
  r.post('/checkout/:id/acknowledge', id, handler(async (req, res) => res.json(await acknowledgeChanges(ctx, accountId(req), cid(req)))));
  r.post('/checkout/:id/phone', id, validate(z.object({ phone: phoneSchema })), handler(async (req, res) =>
    res.json(await setCheckoutPhone(ctx, accountId(req), cid(req), (req.body as { phone: string }).phone))));
  r.put('/checkout/:id/address', id, validate(z.object({ addressId: z.uuid() })), handler(async (req, res) =>
    res.json(await setCheckoutAddress(ctx, accountId(req), cid(req), (req.body as { addressId: string }).addressId))));
  r.put('/checkout/:id/coupon', id, async (req, res, next) =>
    rateLimit(ctx.db, ctx.clock, { group: 'coupon', perMinute: await ctx.settings.get<number>('rateLimit.perMinute', 20) })(req, res, next),
  validate(z.object({ code: couponCodeSchema.nullable() })), handler(async (req, res) =>
    res.json(await setCheckoutCoupon(ctx, accountId(req), cid(req), (req.body as { code: string | null }).code))));
  r.put('/checkout/:id/items', id, validate(z.object({ quantity: z.number().int().min(1).max(10) })), handler(async (req, res) =>
    res.json(await setCheckoutQuantity(ctx, accountId(req), cid(req), (req.body as { quantity: number }).quantity))));
  r.put('/checkout/:id/step', id, validate(z.object({ step: z.enum(['address', 'summary', 'payment']) })), handler(async (req, res) =>
    res.json(await setCheckoutStep(ctx, accountId(req), cid(req), (req.body as { step: 'address' | 'summary' | 'payment' }).step))));
  return r;
}
