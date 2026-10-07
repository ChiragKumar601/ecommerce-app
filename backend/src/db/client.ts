import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../generated/prisma/client.js';

/** Converts a Prisma-style `file:` URL into the form the libSQL client expects. */
export function toLibsqlUrl(databaseUrl: string): string {
  return databaseUrl.startsWith('file:') ? databaseUrl : `file:${databaseUrl}`;
}

/**
 * Creates a Prisma client on the SQLite file and applies the connection pragmas from plan §6.1:
 * WAL (API and worker share the file), a 5 s busy timeout, foreign keys on, synchronous=NORMAL.
 */
const BUSY_TIMEOUT_MS = 5000;

export async function createDb(databaseUrl: string): Promise<PrismaClient> {
  // `timeout` is the busy timeout for every connection the libSQL client opens. The client hands its
  // connection to each transaction and lazily opens a new one, so a PRAGMA alone would be lost (plan §6.3).
  const adapter = new PrismaLibSql({ url: toLibsqlUrl(databaseUrl), timeout: BUSY_TIMEOUT_MS });
  const db = new PrismaClient({ adapter });
  await applyPragmas(db);
  return db;
}

export async function applyPragmas(db: PrismaClient): Promise<void> {
  // journal_mode returns a row, so it is read with $queryRawUnsafe.
  await db.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await db.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  await db.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
}

export async function readPragmas(db: PrismaClient): Promise<Record<string, unknown>> {
  const read = async (name: string) => {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(`PRAGMA ${name};`);
    const row = rows[0] ?? {};
    return Object.values(row)[0];
  };
  return {
    journal_mode: await read('journal_mode'),
    busy_timeout: await read('busy_timeout'),
    foreign_keys: await read('foreign_keys'),
    synchronous: await read('synchronous'),
  };
}
