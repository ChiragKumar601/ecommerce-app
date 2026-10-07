import { loadEnv, type Env } from '../config/env.js';
import { SettingsStore } from '../config/settings.js';
import { createDb } from '../db/client.js';
import { systemClock, type Clock } from '../domain/clock.js';
import { cryptoRandom, type Random } from '../domain/random.js';
import { createLogger, type Logger } from '../lib/logger.js';
import type { AppContext } from './context.js';

/** Builds the runtime context for the API and worker processes. */
export async function createContext(overrides: Partial<{ env: Env; clock: Clock; random: Random; logger: Logger; databaseUrl: string }> = {}): Promise<AppContext> {
  const env = overrides.env ?? loadEnv();
  const db = await createDb(overrides.databaseUrl ?? env.DATABASE_URL);
  const settings = new SettingsStore(db);
  await settings.refresh();
  return {
    db, env, settings,
    clock: overrides.clock ?? systemClock,
    random: overrides.random ?? cryptoRandom,
    logger: overrides.logger ?? createLogger(env.LOG_LEVEL),
  };
}
