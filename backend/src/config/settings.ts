import { EventEmitter } from 'node:events';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Cached view of the `Setting` table (spec §5), refreshed every 60 s. When `catalogue_version`
 * changes (config:sync or a re-seed), listeners are told so caches and the search index rebuild (PR-22).
 */
export class SettingsStore extends EventEmitter {
  private values = new Map<string, unknown>();
  private loadedAt = 0;
  private version = -1;
  private timer: NodeJS.Timeout | null = null;

  private readonly db: PrismaClient;
  private readonly ttlMs: number;

  constructor(db: PrismaClient, ttlMs = 60_000) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
  }

  async refresh(): Promise<void> {
    const rows = await this.db.setting.findMany();
    this.values = new Map(rows.map((r) => [r.key, r.value as unknown]));
    this.loadedAt = Date.now();
    const v = Number(this.values.get('catalogue_version') ?? 0);
    if (v !== this.version) {
      const changed = this.version !== -1;
      this.version = v;
      if (changed) this.emit('catalogueChanged', v);
    }
  }

  /** Reads a setting, refreshing the cache when it is older than the TTL. */
  async get<T>(key: string, fallback?: T): Promise<T> {
    if (Date.now() - this.loadedAt > this.ttlMs) await this.refresh();
    return (this.values.has(key) ? this.values.get(key) : fallback) as T;
  }

  get catalogueVersion(): number {
    return this.version;
  }

  /** Polls for catalogue changes in the background. */
  watch(intervalMs = this.ttlMs): void {
    this.stop();
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
