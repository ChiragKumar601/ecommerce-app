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
await db.setting.upsert({ where: { key: 'rateLimit.perMinute' }, create: { key: 'rateLimit.perMinute', value: 10_000 }, update: { value: 10_000 } });
await db.$disconnect();
writeFileSync(ready, String(Date.now()));
console.log('[e2e] database ready');
