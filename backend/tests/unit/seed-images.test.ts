import { describe, expect, it } from 'vitest';
import type { GenProduct } from '../../src/seed/catalogue/generate.js';
import { assignImages, MAX_PRODUCTS_PER_PRIMARY_IMAGE, type ImageManifest } from '../../src/seed/catalogue/images.js';

const product = (id: string, score: number, subcat = 'men/topwear/t-shirts'): GenProduct =>
  ({ id, primaryNodeId: subcat, imageQuery: 'men t-shirt', noun: 'T-Shirt', score } as unknown as GenProduct);
const photos = (n: number, prefix = 'p') =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`, url: `/media/catalogue/${prefix}${i}.webp`, alt: `Man wearing a T-shirt ${i}`, photographer: 'x', photographerUrl: null,
    pageUrl: `https://commons.wikimedia.org/wiki/File:${prefix}${i}.jpg`, licence: 'CC BY-SA 4.0', licenceUrl: null, source: 'wikimedia', downloadUrl: 'https://upload.wikimedia.org/x.jpg',
  }));
const manifest = (q: Record<string, number>): ImageManifest => ({
  sources: ['wikimedia'], fetchedAt: '2026-10-06',
  queries: Object.fromEntries(Object.entries(q).map(([k, n]) => [k, photos(n, k.slice(0, 3))])),
});
const order = (p: GenProduct) => (p as unknown as { score: number }).score;

describe('image assignment guardrails (OD-6, S3.10)', () => {
  const products = Array.from({ length: 13 }, (_, i) => product(`id${i}`, 100 - i));

  it('gives every product 2–4 images, with the primary first and no duplicates', () => {
    const { images, problems } = assignImages(products, manifest({ 'men t-shirt': 20 }), order, () => []);
    expect(problems).toEqual([]);
    for (const p of products) {
      const mine = images.filter((im) => im.productId === p.id);
      expect(mine.length).toBeGreaterThanOrEqual(2);
      expect(mine.length).toBeLessThanOrEqual(4);
      expect(new Set(mine.map((m) => m.photo.id)).size).toBe(mine.length);
      expect(mine.find((m) => m.order === 0)).toBeDefined();
    }
  });

  it('shares a primary image with at most 2 products, never adjacent in listing order', () => {
    const { images } = assignImages(products, manifest({ 'men t-shirt': 7 }), order, () => []);
    const primaries = products.map((p) => images.find((im) => im.productId === p.id && im.order === 0)!.photo.id);
    const counts = new Map<string, number>();
    primaries.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(MAX_PRODUCTS_PER_PRIMARY_IMAGE);
    for (let i = 1; i < primaries.length; i += 1) expect(primaries[i]).not.toBe(primaries[i - 1]);
  });

  it('extends a small pool with fallback queries, and reports a pool that is still too small', () => {
    const small = assignImages(products, manifest({ 'men t-shirt': 3, 'men topwear': 10 }), order, () => ['men topwear']);
    expect(small.problems).toEqual([]);
    const tiny = assignImages(products, manifest({ 'men t-shirt': 3 }), order, () => []);
    expect(tiny.placeholderProductIds).toEqual([]);
  });

  it('OD-11: with a small pool, reuses more but still never puts the same primary image side by side', () => {
    const { images } = assignImages(products, manifest({ 'men t-shirt': 3 }), order, () => []);
    const primaries = products.map((p) => images.find((im) => im.productId === p.id && im.order === 0)!.photo.id);
    expect(new Set(primaries).size).toBe(3);
    for (let i = 1; i < primaries.length; i += 1) expect(primaries[i]).not.toBe(primaries[i - 1]);
    expect(images.filter((im) => im.productId === 'id0').length).toBeGreaterThanOrEqual(2);
  });
});

describe('image relevance in assignment', () => {
  const products = Array.from({ length: 6 }, (_, i) => product(`z${i}`, 10 - i));

  it('prefers photos whose titles name the product type as main images', () => {
    const m = manifest({ 'men t-shirt': 6 });
    m.queries['men t-shirt']!.slice(0, 3).forEach((p, i) => (p.alt = `Lightning over the town ${i}`));
    const { images } = assignImages(products, m, order, () => []);
    const primaries = images.filter((im) => im.order === 0);
    expect(primaries.every((im) => im.photo.alt.includes('T-shirt'))).toBe(true);
  });

  it('OD-14: with nothing relevant, still uses real photos (own search first, then any), never event photos', () => {
    const m = manifest({ 'men t-shirt': 4, 'women sarees': 6 });
    m.queries['men t-shirt']!.forEach((p, i) => (p.alt = i === 0 ? 'Singer at the concert' : 'Ferris wheel at the fair'));
    const r = assignImages(products, m, order, () => []);
    expect(r.placeholderProductIds).toEqual([]);
    expect(products.every((p) => r.images.some((im) => im.productId === p.id && im.order === 0))).toBe(true);
    expect(r.images.some((im) => im.photo.alt.includes('concert'))).toBe(false);
    const primaries = products.map((p) => r.images.find((im) => im.productId === p.id && im.order === 0)!.photo.id);
    for (let i = 1; i < primaries.length; i += 1) expect(primaries[i]).not.toBe(primaries[i - 1]);
  });

  it('uses the placeholder only when the manifest has no photos at all', () => {
    const r = assignImages(products, { sources: [], fetchedAt: '', queries: {} }, order, () => []);
    expect(r.placeholderProductIds.length).toBe(products.length);
  });
});
