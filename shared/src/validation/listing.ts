import { z } from 'zod';
import { DISCOUNT_BUCKETS, LISTING_SCOPES, LISTING_SORTS, RATING_BUCKETS } from '../constants/listing.ts';

// ListProducts query (spec §11.2, PLP-002/003, plan S6). Shared so the client builds the same URLs.

const csv = z
  .string()
  .max(4000)
  .optional()
  .transform((v) => (v ? [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 60) : []));

const rupees = z.coerce.number().int().min(0).max(10_000_000).optional();
const flag = z.enum(['1']).optional().transform((v) => v === '1');

export const listingQuerySchema = z
  .object({
    scope: z.enum(LISTING_SCOPES).default('all'),
    node: z.string().regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+){0,2}$/).optional(),
    q: z.string().trim().max(100).optional(),
    /** All-products scope narrowed to these catalogue nodes (merchandising links, e.g. "Ethnic Wear"). */
    nodes: csv,
    gender: csv,
    category: csv,
    brand: csv,
    colour: csv,
    size: csv,
    priceMin: rupees,
    priceMax: rupees,
    discount: z.coerce.number().refine((n) => (DISCOUNT_BUCKETS as readonly number[]).includes(n)).optional(),
    rating: z.coerce.number().refine((n) => (RATING_BUCKETS as readonly number[]).includes(n)).optional(),
    inStock: flag,
    /** Bank-offer listing only: the eligibility filter is on unless explicitly removed (PLP-006). */
    bankOffer: z.enum(['0', '1']).optional(),
    inclusiveSizing: flag,
    sort: z.enum(LISTING_SORTS).default('recommended'),
    cursor: z.string().max(200).optional(),
    /** Drop filter values with no matches in this scope (PLP-009 carry-over). */
    prune: flag,
  })
  .refine((v) => v.scope !== 'node' || !!v.node, { path: ['node'], message: 'Missing listing.' })
  .refine((v) => v.scope !== 'search' || !!v.q, { path: ['q'], message: 'Enter something to search.' });

export type ListingQuery = z.output<typeof listingQuerySchema>;
