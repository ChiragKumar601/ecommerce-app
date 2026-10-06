import express, { type Express } from 'express';
import { healthRouter } from './routes/health.js';

/** Builds the Express app. Used by server.ts and by API tests (plan §7.1). */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', healthRouter);
  return app;
}
