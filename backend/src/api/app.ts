import { resolve } from 'node:path';
import express, { type Express } from 'express';
import { healthRouter } from './routes/health.js';

/** Downloaded catalogue images (OD-11): immutable files named by content hash. */
const CATALOGUE_MEDIA = resolve(import.meta.dirname, '../../storage/catalogue');
/** On-theme placeholders for products without a relevant photo (committed, small SVGs). */
const PLACEHOLDER_MEDIA = resolve(import.meta.dirname, '../../static/placeholders');

/** Builds the Express app. Used by server.ts and by API tests (plan §7.1). */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/media/catalogue', express.static(CATALOGUE_MEDIA, { immutable: true, maxAge: '365d', index: false, fallthrough: false }));
  app.use('/media/placeholder', express.static(PLACEHOLDER_MEDIA, { maxAge: '1d', index: false, fallthrough: false }));
  app.use('/api/v1', healthRouter);
  return app;
}
