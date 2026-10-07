import type { SettingsStore } from '../config/settings.js';
import type { Env } from '../config/env.js';
import type { Clock } from '../domain/clock.js';
import type { Random } from '../domain/random.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Logger } from '../lib/logger.js';

/** Everything route handlers and services need, injected so tests can control time and randomness. */
export interface AppContext {
  db: PrismaClient;
  env: Env;
  clock: Clock;
  random: Random;
  logger: Logger;
  settings: SettingsStore;
}
