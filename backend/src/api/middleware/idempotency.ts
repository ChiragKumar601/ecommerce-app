import type { RequestHandler } from 'express';
import type { AppContext } from '../context.js';
import { sha256 } from '../../lib/crypto.js';

const IN_PROGRESS = 0;
const WAIT_MS = 10_000;

/**
 * Idempotency keys (API-003, PAY-007): a repeated `Idempotency-Key` for the same account and route
 * returns the original response without running the action again. The key is claimed before the
 * handler runs, so a concurrent duplicate waits for the first request and gets its response.
 * Requests without a key run normally. Server errors (5xx) release the key so the customer can retry.
 */
export function idempotent(ctx: AppContext): RequestHandler {
  return async (req, res, next) => {
    try {
      const clientKey = req.get('idempotency-key');
      if (!clientKey || req.session.status !== 'active') return next();
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(clientKey)) return next();
      const key = `${req.session.accountId}:${req.method}:${req.baseUrl}${req.path}:${clientKey}`;
      const requestHash = sha256(JSON.stringify(req.body ?? null));

      const claimed = await ctx.db.idempotencyKey
        .create({ data: { key, requestHash, status: IN_PROGRESS, responseBody: '', createdAt: ctx.clock.now() } })
        .then(() => true, () => false);

      if (!claimed) {
        const started = Date.now();
        for (;;) {
          const row = await ctx.db.idempotencyKey.findUnique({ where: { key } });
          if (!row) return next(); // released after a server error: run again
          if (row.status !== IN_PROGRESS) {
            res.setHeader('Idempotent-Replay', 'true');
            return res.status(row.status).type('application/json').send(row.responseBody);
          }
          if (Date.now() - started > WAIT_MS) return res.status(409).json({ code: 'PAYMENT_IN_PROGRESS', message: 'A payment for this order is already in progress.' });
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      const json = res.json.bind(res);
      res.json = (body: unknown) => {
        const status = res.statusCode;
        const done = status >= 500
          ? ctx.db.idempotencyKey.delete({ where: { key } })
          : ctx.db.idempotencyKey.update({ where: { key }, data: { status, responseBody: JSON.stringify(body) } });
        void done.catch(() => undefined).finally(() => json(body));
        return res;
      };
      next();
    } catch (e) {
      next(e);
    }
  };
}
