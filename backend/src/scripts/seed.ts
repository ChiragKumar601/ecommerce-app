import { createDb } from '../db/client.js';
import { seedAll } from '../seed/seedDb.js';

const t0 = Date.now();
const db = await createDb(process.env['DATABASE_URL'] ?? 'file:./data/app.db');
const r = await seedAll(db);
await db.$disconnect();
console.log(`[seed] ${r.products} products, ${r.variants} variants, ${r.reviews} reviews, ${r.images} images, catalogue v${r.catalogueVersion} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const p of r.imageProblems.slice(0, 10)) console.warn(`[seed] images: ${p}`);
if (r.imageProblems.length > 10) console.warn(`[seed] images: …and ${r.imageProblems.length - 10} more`);
