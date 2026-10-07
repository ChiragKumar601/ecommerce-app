import { createDb } from '../db/client.js';
import { verifySeed } from '../seed/verify.js';

const db = await createDb(process.env['DATABASE_URL'] ?? 'file:./data/app.db');
const r = await verifySeed(db);
await db.$disconnect();
console.log('[seed:verify] stats', r.stats);
for (const w of r.warnings) console.warn(`[seed:verify] WARNING ${w}`);
for (const e of r.errors.slice(0, 30)) console.error(`[seed:verify] ERROR ${e}`);
console.log(r.errors.length ? `[seed:verify] FAILED with ${r.errors.length} error(s)` : '[seed:verify] passed');
process.exit(r.errors.length ? 1 : 0);
