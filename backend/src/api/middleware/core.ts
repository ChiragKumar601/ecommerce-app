import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { z, ZodError, type ZodType } from 'zod';
import { AppError, internalErrorEnvelope } from '../../domain/errors.js';
import type { Logger } from '../../lib/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/** Adds a request id (echoed in `X-Request-Id`) and logs each request (plan §7.1). */
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.log(res.statusCode >= 500 ? 'error' : 'info', 'request', {
        id: req.requestId, method: req.method, path: req.path, status: res.statusCode,
        ms: Number(process.hrtime.bigint() - start) / 1e6,
      });
    });
    next();
  };
}

/**
 * CSRF protection (SEC-001, PR-26): state-changing requests must come from an allowed origin.
 * The session cookie is SameSite=Lax as a second layer.
 */
export function originCheck(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin || !allowed.has(origin)) return next(new AppError('ACTION_NOT_ALLOWED', { reason: 'bad_origin' }));
    next();
  };
}

/** Field errors in the API-002 shape. */
export function fieldErrorsFrom(err: ZodError) {
  return err.issues.map((i) => ({ field: i.path.join('.') || '_', code: i.code, message: i.message }));
}

type Part = 'body' | 'query' | 'params';

/** Validates `req[part]` with a shared zod schema and replaces it with the parsed value (VAL-001). */
export function validate<T>(schema: ZodType<T>, part: Part = 'body'): RequestHandler {
  return (req, _res, next) => {
    const r = schema.safeParse(req[part]);
    if (!r.success) return next(new AppError('VALIDATION_ERROR', { fieldErrors: fieldErrorsFrom(r.error) }));
    if (part === 'query') Object.defineProperty(req, 'query', { value: r.data, writable: true });
    else (req as unknown as Record<Part, unknown>)[part] = r.data;
    next();
  };
}

/** Wraps an async handler (Express 5 forwards rejections, this keeps typing tidy). */
export const handler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) =>
  fn(req, res, next).catch(next);

/** Unknown API route → NOT_FOUND envelope. */
export const apiNotFound: RequestHandler = (_req, _res, next) => next(new AppError('NOT_FOUND'));

/** Maps errors to the API-002 envelope. Unexpected errors never leak details (GLB-003). */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      if (err.details.retryAfterSeconds) res.setHeader('Retry-After', String(err.details.retryAfterSeconds));
      res.status(err.status).json(err.toEnvelope());
      return;
    }
    if (err instanceof ZodError) {
      res.status(422).json(new AppError('VALIDATION_ERROR', { fieldErrors: fieldErrorsFrom(err) }).toEnvelope());
      return;
    }
    const e = err as { type?: string; status?: number; statusCode?: number };
    if (e.status === 404 || e.statusCode === 404) {
      res.status(404).json(new AppError('NOT_FOUND').toEnvelope());
      return;
    }
    if (e.type === 'entity.parse.failed' || e.type === 'entity.too.large') {
      res.status(e.status ?? 400).json(new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: '_', code: e.type, message: 'The request body could not be read.' }] }).toEnvelope());
      return;
    }
    logger.log('error', 'unhandled error', { id: req.requestId, error: String(err), stack: (err as Error)?.stack });
    res.status(500).json(internalErrorEnvelope());
  };
}

export { z };
