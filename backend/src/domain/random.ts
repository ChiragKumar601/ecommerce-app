import { randomInt } from 'node:crypto';

/** Injectable randomness (plan §3.2). Tests use a seeded generator; production uses crypto. */
export interface Random {
  /** Uniform float in [0, 1). */
  next(): number;
}

// crypto.randomInt allows a range of at most 2^48 - 1, so 2^47 buckets are used.
export const cryptoRandom: Random = { next: () => randomInt(0, 2 ** 47) / 2 ** 47 };

/** Deterministic generator (mulberry32) for tests and reproducible seed data. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Integer in [min, max] inclusive. */
export function randomIntBetween(rng: Random, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

/** Picks a key with probability proportional to its weight (D-34, SD-20). */
export function weightedPick<K extends string>(rng: Random, weights: Readonly<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) throw new RangeError('weights must sum to more than zero');
  let roll = rng.next() * total;
  for (const [key, w] of entries) {
    if (roll < w) return key;
    roll -= w;
  }
  return entries[entries.length - 1]![0];
}

export function pickOne<T>(rng: Random, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pickOne needs at least one item');
  return items[Math.floor(rng.next() * items.length)]!;
}
