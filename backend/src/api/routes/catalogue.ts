import { Router } from 'express';
import { listingQuerySchema, type ListingQuery } from '@app/shared';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { listProducts } from '../../services/catalogue/listing.js';

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
  return r;
}
