import { createContext } from './api/bootstrap.js';
import { JOBS } from './worker/jobs/index.js';

// Worker process (plan §7.5): runs the simulator jobs on their own timers. Each job run is
// awaited before the next one of the same job starts, so a job never overlaps itself.
const ctx = await createContext();
ctx.settings.watch();
const timers = new Map<string, NodeJS.Timeout>();
let stopping = false;

for (const job of JOBS) {
  const loop = async () => {
    if (stopping) return;
    try {
      const n = await job.run(ctx);
      if (n > 0) ctx.logger.log('info', `[worker] ${job.name}`, { applied: n });
    } catch (err) {
      ctx.logger.log('error', `[worker] ${job.name} failed`, { error: String(err) });
    }
    if (!stopping) timers.set(job.name, setTimeout(() => void loop(), job.everyMs));
  };
  void loop();
}
console.log(`[worker] started with ${JOBS.length} jobs`);

function shutdown(): void {
  stopping = true;
  for (const t of timers.values()) clearTimeout(t);
  console.log('[worker] stopped');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
