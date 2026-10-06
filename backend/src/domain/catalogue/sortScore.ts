import { MS } from '../time.js';

/** Inputs for the Recommended sort (PLP-003, SD-31). */
export interface SortScoreInput {
  averageRating: number; // 0–5 over visible reviews
  ratingCount: number;
  listingDate: Date;
}

export interface SortScoreContext {
  now: Date;
  /** Mean rating across the catalogue (the Bayesian prior). */
  globalMeanRating: number;
  /** Largest rating count in the catalogue, for normalising the count term. */
  maxRatingCount: number;
  /** Prior weight, in reviews. */
  priorWeight?: number;
}

export const RECENCY_WINDOW_DAYS = 90;

/** Bayesian average: pulls products with few ratings towards the catalogue mean. */
export function bayesianRating(avg: number, count: number, mean: number, priorWeight = 10): number {
  return (avg * count + mean * priorWeight) / (count + priorWeight);
}

/**
 * Recommended score in [0, 1] (PLP-003):
 * 0.5 × Bayesian rating (normalised /5) + 0.3 × log(count+1)/log(max+1) + 0.2 × recency,
 * where recency falls linearly from 1 (listed today) to 0 at 90 days.
 */
export function recommendedScore(p: SortScoreInput, ctx: SortScoreContext): number {
  const bayes = bayesianRating(p.averageRating, p.ratingCount, ctx.globalMeanRating, ctx.priorWeight) / 5;
  const countTerm = ctx.maxRatingCount > 0 ? Math.log(p.ratingCount + 1) / Math.log(ctx.maxRatingCount + 1) : 0;
  const ageDays = Math.max(0, (ctx.now.getTime() - p.listingDate.getTime()) / MS.day);
  const recency = Math.max(0, 1 - ageDays / RECENCY_WINDOW_DAYS);
  return 0.5 * bayes + 0.3 * countTerm + 0.2 * recency;
}
