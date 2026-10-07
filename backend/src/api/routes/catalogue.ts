import { Router } from 'express';
import { listingQuerySchema, type ListingQuery } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { listProducts } from '../../services/catalogue/listing.js';
import { suggest } from '../../services/search/suggest.js';
import { checkPincode, getProduct, getRecommendations, listReviews, type ReviewSort } from '../../services/catalogue/product.js';
import { z } from 'zod';

/** Catalogue reads (S6+): listings. Public; short cache because availability changes. */
export function catalogueRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    '/products',
    validate(listingQuerySchema, 'query'),
    handler(async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=5');
      res.json(await listProducts(ctx, req.query as unknown as ListingQuery));
    }),
  );
  r.get(
    '/search/suggest',
    validate(z.object({ q: z.string().max(200).default('') }), 'query'),
    handler(async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(await suggest(ctx, String((req.query as { q: string }).q)));
    }),
  );
  const idParam = validate(z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/) }), 'params');
  r.get('/products/:id', idParam, handler(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=5');
    res.json(await getProduct(ctx, String(req.params['id'])));
  }));
  r.get('/products/:id/recommendations', idParam, handler(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json(await getRecommendations(ctx, String(req.params['id'])));
  }));
  r.get(
    '/products/:id/reviews',
    idParam,
    validate(z.object({
      sort: z.enum(['recent', 'highest', 'lowest']).default('recent'),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      withImages: z.enum(['1']).optional().transform((v) => v === '1'),
      cursor: z.string().max(100).optional(),
    }), 'query'),
    handler(async (req, res) => {
      const q = req.query as unknown as { sort: ReviewSort; rating?: number; withImages: boolean; cursor?: string };
      res.json(await listReviews(ctx, String(req.params['id']), q));
    }),
  );
  r.get(
    '/pincode/:pin',
    validate(z.object({ pin: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode.') }), 'params'),
    handler(async (req, res) => res.json(await checkPincode(ctx, String(req.params['pin'])))),
  );
  return r;
}
