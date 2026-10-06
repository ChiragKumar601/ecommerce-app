import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDb } from '../../src/db/client.js';

const backendRoot = resolve(import.meta.dirname, '../..');

/**
 * Creates a fresh SQLite database file for one test file, applies all migrations,
 * and returns a connected client plus a cleanup function (plan §10, integration tests).
 */
export async function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'ecom-test-'));
  const url = `file:${join(dir, 'test.db')}`;
  execFileSync(join(backendRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  const db = await createDb(url);
  return {
    db,
    url,
    async cleanup() {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
