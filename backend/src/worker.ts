import { loadEnv } from './config/env.js';

// Worker process (plan §7.5): runs scheduled simulator jobs. Jobs are added from Stage 15 onwards.
const env = loadEnv();
let ticks = 0;

function tick(): void {
  ticks += 1;
  console.log(`[worker] tick ${ticks} at ${new Date().toISOString()}`);
}

console.log(`[worker] started, tick every ${env.WORKER_TICK_MS} ms`);
tick();
const timer = setInterval(tick, env.WORKER_TICK_MS);

function shutdown(): void {
  clearInterval(timer);
  console.log('[worker] stopped');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
