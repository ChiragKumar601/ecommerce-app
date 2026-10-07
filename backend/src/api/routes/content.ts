import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { handler, validate } from '../middleware/core.js';
import { getContentPage, getFaqs, getLanding, getNavigation, getSiteInfo } from '../../services/content.js';

/** Navigation, site info, content pages and FAQs (S5.1). Public, cacheable reads. */
export function contentRouter(ctx: AppContext): Router {
  const r = Router();
  const cache = (seconds: number) => (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}`);
    next();
  };
  r.get('/site', cache(60), handler(async (_req, res) => res.json(await getSiteInfo(ctx))));
  r.get('/nav', cache(60), handler(async (_req, res) => res.json(await getNavigation(ctx))));
  r.get('/content/landing', cache(60), handler(async (_req, res) => res.json(await getLanding(ctx))));
  r.get('/faqs', cache(300), handler(async (_req, res) => res.json(await getFaqs(ctx))));
  r.get(
    '/content/pages/:slug',
    cache(300),
    validate(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/) }), 'params'),
    handler(async (req, res) => {
      const p = await getContentPage(ctx, String(req.params['slug']));
      res.json({ slug: p.slug, title: p.title, body: p.body, isPlaceholder: p.isPlaceholder });
    }),
  );
  return r;
}
