import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppContext } from './context.js';
import { apiNotFound, errorHandler, originCheck, requestContext } from './middleware/core.js';
import { healthRouter } from './routes/health.js';
import { contentRouter } from './routes/content.js';
import { catalogueRouter } from './routes/catalogue.js';
import { authRouter } from './routes/auth.js';
import { bagRouter } from './routes/bag.js';
import { meRouter } from './routes/me.js';
import { sessionMiddleware } from './middleware/session.js';

/** Downloaded catalogue images (OD-11): immutable files named by content hash. */
const CATALOGUE_MEDIA = resolve(import.meta.dirname, '../../storage/catalogue');
/** On-theme placeholders for products without a relevant photo (committed, small SVGs). */
const PLACEHOLDER_MEDIA = resolve(import.meta.dirname, '../../static/placeholders');

/** Builds the Express app (plan §7.1). Used by server.ts and by API tests. */
export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', ctx.env.NODE_ENV === 'production' ? 1 : false);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(requestContext(ctx.logger));
  app.use('/media/catalogue', express.static(CATALOGUE_MEDIA, { immutable: true, maxAge: '365d', index: false, fallthrough: false }));
  app.use('/media/placeholder', express.static(PLACEHOLDER_MEDIA, { maxAge: '1d', index: false, fallthrough: false }));

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(originCheck(ctx.env.allowedOrigins));
  api.use(sessionMiddleware(ctx));
  api.use(healthRouter);
  api.use(contentRouter(ctx));
  api.use(catalogueRouter(ctx));
  api.use(authRouter(ctx));
  api.use(bagRouter(ctx));
  api.use(meRouter(ctx));
  api.use(apiNotFound);
  app.use('/api/v1', api);
  app.use(errorHandler(ctx.logger));
  return app;
}
