import type { Request, RequestHandler, Response } from 'express';
import type { AppContext } from '../context.js';
import { AppError } from '../../domain/errors.js';
import { resolveSession, SESSION_COOKIE, type SessionState } from '../../services/auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session: SessionState;
    }
  }
}

/** Session cookie: HttpOnly, SameSite=Lax, Secure in production (SEC-001, PR-24). */
export function setSessionCookie(ctx: AppContext, res: Response, token: string, maxAgeMs: number) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: ctx.env.NODE_ENV === 'production', path: '/', maxAge: maxAgeMs });
}
export function clearSessionCookie(ctx: AppContext, res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: ctx.env.NODE_ENV === 'production', path: '/' });
}

/** Loads the session for every API request (plan §7.1 step 4). Expired sessions clear the cookie. */
export function sessionMiddleware(ctx: AppContext): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = (req.cookies as Record<string, string | undefined> | undefined)?.[SESSION_COOKIE];
      req.session = await resolveSession(ctx, token);
      if (req.session.status === 'expired') clearSessionCookie(ctx, res);
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Account-scoped routes: the account always comes from the session (API-001). */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (req.session.status === 'active') return next();
  next(new AppError(req.session.status === 'expired' ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED'));
};

export function accountId(req: Request): string {
  if (req.session.status !== 'active') throw new AppError('UNAUTHENTICATED');
  return req.session.accountId;
}
