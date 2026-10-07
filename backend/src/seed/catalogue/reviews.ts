import { seededRandom, type Random } from '../../domain/random.js';
import { MS } from '../../domain/time.js';
import { SEED_DATE, type GenProduct } from './generate.js';

/**
 * Seeded sample reviews (R-20, DAT-003). Ratings shown anywhere are computed from these rows,
 * so the aggregate always equals the review records. Seeded reviews never carry "Verified Purchase".
 */
export interface GenReview {
  id: string;
  productId: string;
  authorDisplayName: string;
  rating: number;
  text: string | null;
  createdAt: Date;
}

const FIRST = ['Priya', 'Rahul', 'Ananya', 'Arjun', 'Sneha', 'Vikram', 'Kavya', 'Rohan', 'Meera', 'Aditya', 'Ishita', 'Karan', 'Pooja', 'Siddharth', 'Neha', 'Aman', 'Divya', 'Harsh', 'Riya', 'Nikhil', 'Tanvi', 'Yash', 'Aisha', 'Farhan', 'Gurpreet', 'Lakshmi', 'Deepak', 'Sana', 'Varun', 'Nandini', 'Manish', 'Zoya', 'Abhishek', 'Shreya', 'Tenzin', 'Joseph', 'Fatima', 'Ravi', 'Simran', 'Arnav'];
const LAST_INITIAL = 'ABCDEGHIJKMNPRSTVY';

const TEXT: Record<'great' | 'good' | 'ok' | 'poor', string[]> = {
  great: [
    'Absolutely love it. The quality is much better than I expected for the price.',
    'Exactly as shown in the pictures. Would happily buy again.',
    'Great value. Looks premium and feels comfortable.',
    'Got a lot of compliments on this. Highly recommend.',
    'Perfect fit and the finish is really good.',
    'Second time ordering this — consistent quality.',
  ],
  good: [
    'Good product overall. Delivery was quick too.',
    'Nice quality for the price. Colour is slightly different from the photo.',
    'Pretty good. Does what it says.',
    'Comfortable and looks nice. Sizing runs a little large.',
    'Happy with the purchase, would recommend.',
  ],
  ok: [
    'It is okay. Decent for everyday use but nothing special.',
    'Average quality. Expected a bit more for the price.',
    'Fine for the price, but the material could be better.',
  ],
  poor: [
    'Not as described. The quality was disappointing.',
    'Did not meet my expectations. The finish felt cheap.',
    'Size was off for me and the colour faded quickly.',
  ],
};

const between = (rng: Random, min: number, max: number) => min + Math.floor(rng.next() * (max - min + 1));
const pick = <T>(rng: Random, xs: readonly T[]) => xs[Math.floor(rng.next() * xs.length)]!;

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** A rating around the product's quality level `q` (roughly 2.8–4.9). */
function rate(rng: Random, q: number): number {
  const x = q + (rng.next() + rng.next() + rng.next() - 1.5) * 1.6;
  return Math.min(5, Math.max(1, Math.round(x)));
}

export function generateReviews(products: GenProduct[]): GenReview[] {
  const out: GenReview[] = [];
  for (const p of products) {
    const rng = seededRandom(hash(`reviews:${p.id}`));
    // About 15% of products have no reviews yet (PLP-013: no rating badge).
    if (rng.next() < 0.15) continue;
    const count = p.bestSeller ? between(rng, 25, 90) : rng.next() < 0.6 ? between(rng, 1, 15) : between(rng, 16, 45);
    const quality = 3.3 + rng.next() * 1.6;
    const spanDays = Math.max(1, Math.floor((SEED_DATE.getTime() - p.listingDate.getTime()) / MS.day));
    for (let i = 0; i < count; i += 1) {
      const rating = rate(rng, quality);
      const tone = rating === 5 ? 'great' : rating === 4 ? 'good' : rating === 3 ? 'ok' : 'poor';
      out.push({
        id: `${p.id}-r${i + 1}`,
        productId: p.id,
        authorDisplayName: `${pick(rng, FIRST)} ${pick(rng, [...LAST_INITIAL])}.`,
        rating,
        text: rng.next() < 0.45 ? pick(rng, TEXT[tone]) : null,
        createdAt: new Date(p.listingDate.getTime() + between(rng, 0, spanDays) * MS.day + between(rng, 0, 86_399) * 1000),
      });
    }
  }
  return out;
}

/** Aggregate of visible reviews (SD-06): count, sum and per-star counts. */
export function aggregate(ratings: number[]) {
  const c = [0, 0, 0, 0, 0];
  for (const r of ratings) c[r - 1]! += 1;
  return { count: ratings.length, sumRatings: ratings.reduce((a, b) => a + b, 0), c1: c[0]!, c2: c[1]!, c3: c[2]!, c4: c[3]!, c5: c[4]! };
}
