import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPragmas } from '../src/db/client.js';
import { createTestDb } from './helpers/testDb.js';

describe('SQLite database (plan §6.1)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.cleanup();
  });

  it('opens a fresh per-test database file', async () => {
    const rows = await ctx.db.$queryRawUnsafe<{ ok: number }[]>('SELECT 1 AS ok');
    expect(Number(rows[0]?.ok)).toBe(1);
  });

  it('applies the connection pragmas', async () => {
    const p = await readPragmas(ctx.db);
    expect(String(p.journal_mode).toLowerCase()).toBe('wal');
    expect(Number(p.busy_timeout)).toBe(5000);
    expect(Number(p.foreign_keys)).toBe(1);
    expect(Number(p.synchronous)).toBe(1);
  });
});
