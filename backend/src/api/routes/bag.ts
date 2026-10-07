import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { addLineSchema, couponSchema, guestQuoteSchema, guestWishlistSchema, moveToBagSchema, setQtySchema, wishlistAddSchema } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { accountId, requireAuth } from '../middleware/session.js';
import { getBag, guestQuote, updateBag } from '../../services/bag.js';
import { addToWishlist, guestWishlist, listWishlist, moveWishlistToBag, removeFromWishlist, wishlistIds } from '../../services/wishlist.js';

/** Bag and wishlist (S11; spec §11.2). Guests send device data and nothing is stored (PR-25). */
export function bagRouter(ctx: AppContext): Router {
  const r = Router();
  const couponLimit: RequestHandler = async (req, res, next) =>
    rateLimit(ctx.db, ctx.clock, { group: 'coupon', perMinute: await ctx.settings.get<number>('rateLimit.perMinute', 20) })(req, res, next);
  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
  r.use(['/bag', '/wishlist'], noStore);

  // Coupon applies are rate limited per client (SEC-004); other guest quotes aren't.
  r.post('/bag/guest-quote', validate(guestQuoteSchema), async (req, res, next) => {
    if ((req.body as z.output<typeof guestQuoteSchema>).op?.type === 'applyCoupon') return couponLimit(req, res, next);
    next();
  }, handler(async (req, res) => res.json(await guestQuote(ctx, req.body as z.output<typeof guestQuoteSchema>))));

  r.get('/bag', requireAuth, handler(async (req, res) => res.json(await getBag(ctx, accountId(req)))));
  r.post('/bag/lines', requireAuth, validate(addLineSchema), handler(async (req, res) => {
    const b = req.body as z.output<typeof addLineSchema>;
    res.json(await updateBag(ctx, accountId(req), { type: 'add', variantId: b.variantId, quantity: b.quantity }));
  }));
  const variantParam = validate(z.object({ variantId: z.string().min(1).max(64) }), 'params');
  r.patch('/bag/lines/:variantId', requireAuth, variantParam, validate(setQtySchema), handler(async (req, res) => {
    res.json(await updateBag(ctx, accountId(req), { type: 'set', variantId: String(req.params['variantId']), quantity: (req.body as { quantity: number }).quantity }));
  }));
  r.delete('/bag/lines/:variantId', requireAuth, variantParam, handler(async (req, res) => {
    res.json(await updateBag(ctx, accountId(req), { type: 'remove', variantId: String(req.params['variantId']) }));
  }));
  r.post('/bag/lines/:variantId/move-to-wishlist', requireAuth, variantParam, handler(async (req, res) => {
    const id = accountId(req);
    const line = await ctx.db.bagLine.findUnique({ where: { accountId_variantId: { accountId: id, variantId: String(req.params['variantId']) } }, include: { variant: { select: { productId: true } } } });
    if (line) await ctx.db.wishlistEntry.upsert({
      where: { accountId_productId: { accountId: id, productId: line.variant.productId } },
      create: { accountId: id, productId: line.variant.productId, addedAt: ctx.clock.now() },
      update: {},
    });
    res.json(await updateBag(ctx, id, { type: 'remove', variantId: String(req.params['variantId']) }));
  }));
  r.post('/bag/coupon', requireAuth, couponLimit, validate(couponSchema), handler(async (req, res) => {
    res.json(await updateBag(ctx, accountId(req), { type: 'applyCoupon', code: (req.body as { code: string }).code }));
  }));
  r.delete('/bag/coupon', requireAuth, handler(async (req, res) => res.json(await updateBag(ctx, accountId(req), { type: 'removeCoupon' }))));

  // Wishlist
  const productParam = validate(z.object({ productId: z.string().regex(/^[a-z0-9-]{1,40}$/) }), 'params');
  r.get('/wishlist', requireAuth, validate(z.object({ cursor: z.string().max(100).optional() }), 'query'), handler(async (req, res) => {
    res.json(await listWishlist(ctx, accountId(req), (req.query as { cursor?: string }).cursor));
  }));
  r.get('/wishlist/ids', requireAuth, handler(async (req, res) => res.json({ productIds: await wishlistIds(ctx, accountId(req)) })));
  r.post('/wishlist/guest-view', validate(guestWishlistSchema), handler(async (req, res) => {
    const b = req.body as z.output<typeof guestWishlistSchema>;
    res.json(await guestWishlist(ctx, b.productIds, b.cursor));
  }));
  r.post('/wishlist', requireAuth, validate(wishlistAddSchema), handler(async (req, res) => {
    await addToWishlist(ctx, accountId(req), (req.body as { productId: string }).productId);
    res.json({ productIds: await wishlistIds(ctx, accountId(req)) });
  }));
  r.delete('/wishlist/:productId', requireAuth, productParam, handler(async (req, res) => {
    await removeFromWishlist(ctx, accountId(req), String(req.params['productId']));
    res.json({ productIds: await wishlistIds(ctx, accountId(req)) });
  }));
  r.post('/wishlist/:productId/move-to-bag', requireAuth, productParam, validate(moveToBagSchema), handler(async (req, res) => {
    res.json(await moveWishlistToBag(ctx, accountId(req), String(req.params['productId']), (req.body as { variantId?: string }).variantId));
  }));
  return r;
}
