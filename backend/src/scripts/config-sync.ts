import { createDb } from '../db/client.js';
import { syncConfig } from '../seed/seedDb.js';

const db = await createDb(process.env['DATABASE_URL'] ?? 'file:./data/app.db');
const r = await syncConfig(db);
await db.$disconnect();
console.log(`[config:sync] done — catalogue version ${r.catalogueVersion}`);
