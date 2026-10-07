import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { paymentQuoteSelectionSchema, paySchema } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { idempotent } from '../middleware/idempotency.js';
import { accountId, requireAuth } from '../middleware/session.js';
import { istDate } from '../../domain/time.js';
import { attemptView, cancelPendingOrder, orderPaymentQuote, pay, retryPayment, setCheckoutPayment } from '../../services/payment.js';
import { orderDetail } from '../../services/orders/view.js';

/** Payment and order creation (S15; spec §11.2 Pay, RetryPayment, CancelPendingOrder). */
export function paymentsRouter(ctx: AppContext): Router {
  const r = Router();
  const id = validate(z.object({ id: z.uuid() }), 'params');
  const pid = (req: { params: Record<string, unknown> }) => String(req.params['id']);
  const payBody: RequestHandler = (req, res, next) => validate(paySchema(istDate(ctx.clock.now())))(req, res, next);
  type PayBody = z.output<ReturnType<typeof paySchema>>;
  type Sel = z.output<typeof paymentQuoteSelectionSchema>;
  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  r.put('/checkout/:id/payment-selection', requireAuth, id, validate(paymentQuoteSelectionSchema), handler(async (req, res) =>
    res.json(await setCheckoutPayment(ctx, accountId(req), pid(req), req.body as Sel))));
  r.post('/checkout/:id/pay', requireAuth, id, idempotent(ctx), payBody, handler(async (req, res) =>
    res.status(201).json(await pay(ctx, accountId(req), pid(req), req.body as PayBody))));

  r.get('/payment-attempts/:id', requireAuth, noStore, id, handler(async (req, res) => res.json(await attemptView(ctx, accountId(req), pid(req)))));

  r.get('/orders/:id', requireAuth, noStore, id, handler(async (req, res) => res.json(await orderDetail(ctx, accountId(req), pid(req)))));
  r.post('/orders/:id/payment-quote', requireAuth, id, validate(paymentQuoteSelectionSchema), handler(async (req, res) =>
    res.json(await orderPaymentQuote(ctx, accountId(req), pid(req), req.body as Sel))));
  r.post('/orders/:id/retry-payment', requireAuth, id, idempotent(ctx), payBody, handler(async (req, res) =>
    res.status(201).json(await retryPayment(ctx, accountId(req), pid(req), req.body as PayBody))));
  r.post('/orders/:id/cancel', requireAuth, id, idempotent(ctx), handler(async (req, res) => {
    await cancelPendingOrder(ctx, accountId(req), pid(req));
    res.json(await orderDetail(ctx, accountId(req), pid(req)));
  }));
  return r;
}
