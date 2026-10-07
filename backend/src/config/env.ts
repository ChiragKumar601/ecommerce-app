import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Origins allowed to send state-changing requests (CSRF Origin check, plan §7.1). Comma-separated. */
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173,http://localhost:4173'),
  DATABASE_URL: z.string().default('file:./data/app.db'),
  WORKER_TICK_MS: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export type Env = z.infer<typeof EnvSchema> & { allowedOrigins: string[] };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = EnvSchema.parse(source);
  return { ...env, allowedOrigins: env.FRONTEND_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean) };
}
