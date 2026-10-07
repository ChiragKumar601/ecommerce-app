import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb } from '../db/client.js';

/**
 * E2E database (plan §10): a consistent snapshot of the development database (catalogue, config,
 * content) with no accounts, so E2E runs never touch the developer's data. Rate limits are raised
 * because every E2E request comes from one address.
 */
const dataDir = resolve(import.meta.dirname, '../../data');
const source = resolve(dataDir, 'app.db');
const target = resolve(dataDir, 'e2e.db');
const ready = resolve(dataDir, 'e2e.ready');

rmSync(ready, { force: true });
for (const f of [target, `${target}-wal`, `${target}-shm`]) rmSync(f, { force: true });
if (!existsSync(source)) throw new Error('backend/data/app.db not found: run pnpm db:migrate && pnpm db:seed first');

const src = await createDb(`file:${source}`);
await src.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
await src.$disconnect();

const db = await createDb(`file:${target}`);
await db.account.deleteMany();
await db.authThrottle.deleteMany();
await db.rateLimitBucket.deleteMany();
// Short simulator timers so E2E can follow orders to delivery (plan §10): 2 s steps, 8 s handover window,
// 60 s payment retry window.
const settings: Record<string, unknown> = {
  'rateLimit.perMinute': 10_000,
  'sim.statusStepIntervalMs': 2_000,
  'sim.deliveryHandoverWindowMs': 8_000,
  'sim.paymentRetryWindowMs': 60_000,
};
for (const [key, value] of Object.entries(settings)) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}
await db.$disconnect();
writeFileSync(ready, String(Date.now()));
console.log('[e2e] database ready');
