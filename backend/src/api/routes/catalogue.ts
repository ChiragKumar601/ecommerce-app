import { Router } from 'express';
import { listingQuerySchema, type ListingQuery } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { listProducts } from '../../services/catalogue/listing.js';
import { suggest } from '../../services/search/suggest.js';
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
  return r;
}
