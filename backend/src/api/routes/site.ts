import { Router } from 'express';
import type { AppContext } from '../context.js';
import { handler } from '../middleware/core.js';

/** Site-wide settings the shell needs on every page (GLB-001 demo banner, brand name). */
export function siteRouter(ctx: AppContext): Router {
  const r = Router();
  r.get('/site', handler(async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      brandName: await ctx.settings.get<string>('brand.name', 'Wardrobe & Co.'),
      demoBanner: await ctx.settings.get<string>('demoBanner.text', 'Demo store — for showcase only. No real orders, payments or deliveries.'),
    });
  }));
  return r;
}
