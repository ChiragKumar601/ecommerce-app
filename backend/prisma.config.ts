import { defineConfig } from 'prisma/config';

// Prisma 7 configuration (plan §6). The database is a local SQLite file; nothing to install.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? 'file:./data/app.db' },
});
