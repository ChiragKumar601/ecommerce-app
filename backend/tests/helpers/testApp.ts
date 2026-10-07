import { loadEnv } from '../../src/config/env.js';
import { SettingsStore } from '../../src/config/settings.js';
import { createApp } from '../../src/api/app.js';
import type { AppContext } from '../../src/api/context.js';
import { FakeClock } from '../../src/domain/clock.js';
import { seededRandom } from '../../src/domain/random.js';
import { createLogger } from '../../src/lib/logger.js';
import { createTestDb } from './testDb.js';

export const TEST_ORIGIN = 'http://localhost:5173';

/** A fresh database, fake clock, seeded randomness and silent logger, plus the Express app. */
export async function createTestApp(opts: { seed?: (ctx: AppContext) => Promise<void> } = {}) {
  const t = await createTestDb();
  const env = loadEnv({ NODE_ENV: 'test', FRONTEND_ORIGIN: TEST_ORIGIN, DATABASE_URL: t.url, LOG_LEVEL: 'silent' });
  const settings = new SettingsStore(t.db);
  const clock = new FakeClock('2026-10-07T06:30:00.000Z');
  const ctx: AppContext = { db: t.db, env, settings, clock, random: seededRandom(42), logger: createLogger('silent') };
  if (opts.seed) await opts.seed(ctx);
  await settings.refresh();
  return { ctx, clock, app: createApp(ctx), cleanup: t.cleanup };
}
