import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/testDb.js';

// Hand-written SQL constraints (plan §6.1, PR-23): the database itself must reject these writes.
describe('database constraints', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    ctx = await createTestDb();
    const db = ctx.db;
    await db.catalogueNode.create({ data: { id: 'men', type: 'section', name: 'Men', slug: 'men', path: 'men', displayOrder: 1 } });
    await db.brand.create({ data: { id: 'b1', name: 'Brand', slug: 'brand' } });
    await db.product.create({
      data: {
        id: 'p1', slug: 'tee', brandId: 'b1', name: 'Tee', subtitle: 'Cotton tee', description: '', materialCare: '',
        specifications: [], primarySectionId: 'men', primaryNodeId: 'men', gender: 'men', colour: 'Black',
        styleGroupId: 's1', listingDate: new Date(),
      },
    });
    await db.variant.create({ data: { id: 'v1', productId: 'p1', sizeLabel: 'M', sortOrder: 1, mrp: 99900, sellingPrice: 79900 } });
    await db.inventory.create({ data: { variantId: 'v1', onHand: 5, held: 0, baselineOnHand: 5 } });
  });
  afterAll(async () => ctx.cleanup());

  it('rejects held stock above on-hand (INV-006)', async () => {
    await expect(ctx.db.inventory.update({ where: { variantId: 'v1' }, data: { held: 6 } })).rejects.toThrow();
  });
  it('rejects negative held or on-hand stock', async () => {
    await expect(ctx.db.inventory.update({ where: { variantId: 'v1' }, data: { held: -1 } })).rejects.toThrow();
    await expect(ctx.db.inventory.update({ where: { variantId: 'v1' }, data: { onHand: -1 } })).rejects.toThrow();
  });
  it('accepts held equal to on-hand', async () => {
    await expect(ctx.db.inventory.update({ where: { variantId: 'v1' }, data: { held: 5 } })).resolves.toMatchObject({ held: 5 });
  });
  it('makes a conditional hold fail without changing anything when stock is short (INV-001)', async () => {
    await ctx.db.inventory.update({ where: { variantId: 'v1' }, data: { held: 3 } });
    const changed = await ctx.db.$executeRawUnsafe(
      'UPDATE "Inventory" SET "held" = "held" + ? WHERE "variantId" = ? AND "onHand" - "held" >= ?', 3, 'v1', 3,
    );
    expect(changed).toBe(0);
    expect((await ctx.db.inventory.findUnique({ where: { variantId: 'v1' } }))?.held).toBe(3);
  });
  it('rejects a selling price above MRP or not positive', async () => {
    await expect(ctx.db.variant.update({ where: { id: 'v1' }, data: { sellingPrice: 100000 } })).rejects.toThrow();
    await expect(ctx.db.variant.update({ where: { id: 'v1' }, data: { sellingPrice: 0 } })).rejects.toThrow();
  });
  it('rejects ratings outside 1–5 and a second review by the same account (REV-006)', async () => {
    await expect(
      ctx.db.review.create({ data: { id: 'r0', productId: 'p1', authorDisplayName: 'A', rating: 6 } }),
    ).rejects.toThrow();
    await ctx.db.account.create({ data: { id: 'acc1', name: 'A', email: 'a@example.com', passwordHash: 'x', securityQuestionId: 'q1', securityAnswerHash: 'x', ageConfirmedAt: new Date() } });
    await ctx.db.review.create({ data: { id: 'r1', productId: 'p1', authorAccountId: 'acc1', authorDisplayName: 'A', rating: 5 } });
    await expect(
      ctx.db.review.create({ data: { id: 'r2', productId: 'p1', authorAccountId: 'acc1', authorDisplayName: 'A', rating: 4 } }),
    ).rejects.toThrow();
    // Seeded reviews (no account) may repeat.
    await ctx.db.review.create({ data: { id: 'r3', productId: 'p1', authorDisplayName: 'S', rating: 4, seeded: true } });
    await ctx.db.review.create({ data: { id: 'r4', productId: 'p1', authorDisplayName: 'S', rating: 3, seeded: true } });
  });
  it('rejects an account with neither email nor phone (spec §4.3)', async () => {
    await expect(
      ctx.db.account.create({ data: { id: 'acc2', name: 'B', passwordHash: 'x', securityQuestionId: 'q1', securityAnswerHash: 'x', ageConfirmedAt: new Date() } }),
    ).rejects.toThrow();
  });
  it('enforces unique slugs among siblings', async () => {
    await expect(
      ctx.db.catalogueNode.create({ data: { id: 'men2', type: 'section', name: 'Men', slug: 'men', path: 'men', displayOrder: 2 } }),
    ).rejects.toThrow();
  });
});
