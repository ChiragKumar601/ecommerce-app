import { createDb } from '../db/client.js';
import { refreshImages } from '../seed/seedDb.js';

// Re-assigns product, hero and category-card images without re-seeding the catalogue
// (after images are fetched or blocklisted). Run `pnpm seed:verify` afterwards.
const db = await createDb(process.env['DATABASE_URL'] ?? 'file:./data/app.db');
const r = await refreshImages(db);
await db.$disconnect();
console.log(`[images] ${r.images} product images, ${r.placeholders} products on the placeholder, catalogue v${r.catalogueVersion}`);
for (const p of r.problems.slice(0, 20)) console.warn(`[images] ${p}`);
if (r.problems.length > 20) console.warn(`[images] …and ${r.problems.length - 20} more`);
