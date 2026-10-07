import type { Request, RequestHandler } from 'express';
import type { Clock } from '../../domain/clock.js';
import { AppError } from '../../domain/errors.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

export interface RateLimitOptions {
  group: string;
  perMinute: number;
  /** Extra key material (e.g. the identifier) appended to the client IP (SI-4). */
  key?: (req: Request) => string;
}

/** Client address: socket address locally; trusted proxy headers once deployed (assumption 5). */
export const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

/** Fixed one-minute window in SQLite, shared by every API process (SEC-004). */
export function rateLimit(db: PrismaClient, clock: Clock, opts: RateLimitOptions): RequestHandler {
  return async (req, _res, next) => {
    try {
      const now = clock.now().getTime();
      const windowStart = new Date(now - (now % 60_000));
      const key = `${opts.group}:${clientIp(req)}${opts.key ? `:${opts.key(req)}` : ''}:${windowStart.getTime()}`;
      const row = await db.rateLimitBucket.upsert({
        where: { key },
        create: { key, windowStart, count: 1 },
        update: { count: { increment: 1 } },
      });
      if (row.count > opts.perMinute) {
        throw new AppError('RATE_LIMITED', { retryAfterSeconds: Math.ceil((windowStart.getTime() + 60_000 - now) / 1000) });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
