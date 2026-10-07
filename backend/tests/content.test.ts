import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetNavigationCache } from '../src/services/content.js';
import { syncConfig } from '../src/seed/seedDb.js';
import { flattenTree, loadTree } from '../src/seed/tree.js';
import { createTestApp } from './helpers/testApp.js';

describe('navigation and content (S5.1)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    t = await createTestApp({
      seed: async (ctx) => {
        for (const n of flattenTree(loadTree())) {
          await ctx.db.catalogueNode.create({ data: { id: n.id, type: n.type, name: n.name, slug: n.slug, path: n.path, parentId: n.parentId, displayOrder: n.displayOrder } });
        }
        await syncConfig(ctx.db);
      },
    });
    resetNavigationCache();
  }, 60_000);
  afterAll(async () => t.cleanup());

  it('returns the six sections in header order with nested categories (NAV-002)', async () => {
    const res = await request(t.app).get('/api/v1/nav');
    expect(res.status).toBe(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(['Men', 'Women', 'Kids', 'Home', 'Beauty', 'Gen Z']);
    const men = res.body[0];
    expect(men.href).toBe('/shop/men');
    expect(men.children[0]).toMatchObject({ name: 'Topwear', href: '/men/topwear' });
    expect(men.children[0].children[0]).toMatchObject({ name: 'T-Shirts', href: '/men/topwear/t-shirts' });
  });

  it('reflects catalogue changes after the catalogue version changes, without code changes (NAV-007)', async () => {
    await t.ctx.db.catalogueNode.create({ data: { id: 'men/topwear/kurtis-test', type: 'subcategory', name: 'Test Node', slug: 'kurtis-test', path: 'men/topwear/kurtis-test', parentId: 'men/topwear', displayOrder: 99 } });
    await t.ctx.db.catalogueNode.update({ where: { id: 'men/watches' }, data: { active: false } });
    await t.ctx.db.setting.upsert({ where: { key: 'catalogue_version' }, create: { key: 'catalogue_version', value: 999 }, update: { value: 999 } });
    await t.ctx.settings.refresh();
    const men = (await request(t.app).get('/api/v1/nav')).body[0];
    expect(men.children.find((c: { name: string }) => c.name === 'Topwear').children.at(-1).name).toBe('Test Node');
    expect(men.children.some((c: { name: string }) => c.name === 'Watches')).toBe(false);
  });

  it('returns site info with footer blocks, popular searches and sample company details (LND-007)', async () => {
    const res = await request(t.app).get('/api/v1/site');
    expect(res.body.brandName).toBe('Wardrobe & Co.');
    expect(res.body.demoBanner).toMatch(/Demo store/);
    expect(res.body.popularSearches).toContain('kurta sets');
    expect(res.body.footer.usefulLinks.map((l: { label: string }) => l.label)).toEqual(['Blog', 'Careers', 'Sitemap', 'Corporate Information']);
    expect(res.body.footer.trustPointers[1].title).toBe('Easy 14-day returns on eligible items');
    expect(res.body.company.cin).toMatch(/sample/);
  });

  it('serves content pages with the placeholder flag, and 404s unknown slugs (LND-008)', async () => {
    const privacy = await request(t.app).get('/api/v1/content/pages/privacy-policy');
    expect(privacy.body).toMatchObject({ slug: 'privacy-policy', title: 'Privacy Policy', isPlaceholder: true });
    expect(privacy.body.body).toMatch(/30 days/);
    expect((await request(t.app).get('/api/v1/content/pages/nope')).status).toBe(404);
    expect((await request(t.app).get('/api/v1/content/pages/BAD..slug')).status).toBe(422);
  });

  it('groups FAQs by topic (PRF-006)', async () => {
    const res = await request(t.app).get('/api/v1/faqs');
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(res.body[0].items[0]).toHaveProperty('question');
  });
});
