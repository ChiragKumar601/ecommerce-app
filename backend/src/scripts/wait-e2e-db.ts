import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Blocks until prepare-e2e-db has written a fresh ready marker (so the worker never opens a half-built file). */
const ready = resolve(import.meta.dirname, '../../data/e2e.ready');
const started = Date.now();
for (;;) {
  try {
    if (Number(readFileSync(ready, 'utf8')) >= started - 30_000) break;
  } catch {
    /* not there yet */
  }
  if (Date.now() - started > 120_000) throw new Error('E2E database was not prepared in time');
  await new Promise((r) => setTimeout(r, 200));
}
