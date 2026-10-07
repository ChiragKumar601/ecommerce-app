import type { ProductCardData } from '@app/shared';
import type { AppContext } from '../api/context.js';
import { discountPercent } from '../domain/catalogue/discount.js';
import { AppError } from '../domain/errors.js';
import { money } from '../domain/money.js';
import { updateBag } from './bag.js';
import { derive, toCard } from './catalogue/listing.js';
import { getDynamic, getSnapshot } from './catalogue/snapshot.js';

// Wishlist (spec §6.11; plan S11.4): products, not sizes; no size limit; 24 per page (WSH-004).

export const WISHLIST_PAGE = 24;

export interface WishlistItem {
  card: ProductCardData;
  /** WSH-001: inactive → "Unavailable"; every variant at 0 → "Out of stock". Move to Bag is disabled for both. */
  status: 'ok' | 'unavailable' | 'out_of_stock';
}

/** Card data for wishlisted products, in the given order; unknown ids are dropped. */
export async function wishlistCards(ctx: AppContext, productIds: string[]): Promise<WishlistItem[]> {
  const [snap, dyn] = await Promise.all([getSnapshot(ctx), getDynamic(ctx)]);
  const missing = productIds.filter((id) => !snap.byId.has(id));
  const inactive = missing.length
    ? await ctx.db.product.findMany({
        where: { id: { in: missing } },
        include: { brand: true, images: { take: 1, orderBy: { order: 'asc' } }, variants: { orderBy: { sellingPrice: 'asc' }, take: 1 } },
      })
    : [];
  const byId = new Map(inactive.map((p) => [p.id, p]));
  const out: WishlistItem[] = [];
  for (const id of productIds) {
    const p = snap.byId.get(id);
    if (p) {
      const d = derive(p, dyn.available, dyn.ratings);
      out.push({ card: toCard(d), status: d.inStock ? 'ok' : 'out_of_stock' });
      continue;
    }
    const row = byId.get(id);
    const v = row?.variants[0];
    if (!row || !v) continue;
    out.push({
      status: 'unavailable',
      card: {
        id: row.id, slug: row.slug, href: `/p/${row.slug}-${row.id}`, brand: row.brand.name, name: row.name, subtitle: row.subtitle,
        image: row.images[0] ? { url: row.images[0].url, alt: `${row.brand.name} ${row.name}` } : null, hoverImage: null,
        price: money(v.sellingPrice), mrp: money(v.mrp), discountPercent: discountPercent(v.mrp, v.sellingPrice), rating: null, outOfStock: true,
      },
    });
  }
  return out;
}

function page<T>(items: T[], cursor: string | undefined) {
  const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString()) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'cursor', code: 'invalid', message: 'Invalid page.' }] });
  return {
    slice: items.slice(offset, offset + WISHLIST_PAGE),
    nextCursor: offset + WISHLIST_PAGE < items.length ? Buffer.from(String(offset + WISHLIST_PAGE)).toString('base64url') : null,
  };
}

export async function listWishlist(ctx: AppContext, accountId: string, cursor?: string) {
  const rows = await ctx.db.wishlistEntry.findMany({ where: { accountId }, orderBy: [{ addedAt: 'desc' }, { productId: 'asc' }], select: { productId: true } });
  const { slice, nextCursor } = page(rows.map((r) => r.productId), cursor);
  return { items: await wishlistCards(ctx, slice), totalCount: rows.length, nextCursor };
}

/** Guest wishlist view (WSH-003): ids from the device, newest first. */
export async function guestWishlist(ctx: AppContext, productIds: string[], cursor?: string) {
  const unique = [...new Set(productIds)];
  const { slice, nextCursor } = page(unique, cursor);
  return { items: await wishlistCards(ctx, slice), totalCount: unique.length, nextCursor };
}

export async function wishlistIds(ctx: AppContext, accountId: string): Promise<string[]> {
  const rows = await ctx.db.wishlistEntry.findMany({ where: { accountId }, orderBy: { addedAt: 'desc' }, select: { productId: true } });
  return rows.map((r) => r.productId);
}

export async function addToWishlist(ctx: AppContext, accountId: string, productId: string) {
  const p = await ctx.db.product.findUnique({ where: { id: productId }, select: { id: true, active: true } });
  if (!p) throw new AppError('NOT_FOUND');
  if (!p.active) throw new AppError('PRODUCT_INACTIVE');
  await ctx.db.wishlistEntry.upsert({
    where: { accountId_productId: { accountId, productId } },
    create: { accountId, productId, addedAt: ctx.clock.now() },
    update: {},
  });
}

export async function removeFromWishlist(ctx: AppContext, accountId: string, productId: string) {
  await ctx.db.wishlistEntry.deleteMany({ where: { accountId, productId } });
}

/**
 * Move to Bag (WSH-002): with more than one available variant a size must be chosen; the variant
 * is added under PDP-008 rules and the product leaves the wishlist.
 */
export async function moveWishlistToBag(ctx: AppContext, accountId: string, productId: string, variantId?: string) {
  const entry = await ctx.db.wishlistEntry.findUnique({ where: { accountId_productId: { accountId, productId } } });
  if (!entry) throw new AppError('NOT_FOUND');
  const variant = await resolveVariant(ctx, productId, variantId);
  const bag = await updateBag(ctx, accountId, { type: 'add', variantId: variant });
  await removeFromWishlist(ctx, accountId, productId);
  return bag;
}

/** The variant to add for a product: the chosen one, or the only available one. */
export async function resolveVariant(ctx: AppContext, productId: string, variantId?: string): Promise<string> {
  const p = await ctx.db.product.findUnique({ where: { id: productId }, include: { variants: { where: { active: true }, include: { inventory: true } } } });
  if (!p) throw new AppError('NOT_FOUND');
  if (!p.active || p.variants.length === 0) throw new AppError('PRODUCT_INACTIVE');
  const available = p.variants.filter((v) => (v.inventory?.onHand ?? 0) - (v.inventory?.held ?? 0) > 0);
  if (variantId) {
    if (!p.variants.some((v) => v.id === variantId)) throw new AppError('NOT_FOUND');
    return variantId;
  }
  if (available.length === 0) throw new AppError('OUT_OF_STOCK', { item: p.name });
  if (p.variants.length > 1 && available.length > 1) {
    throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'variantId', code: 'required', message: 'Please select a size' }] });
  }
  return available[0]!.id;
}

/** Union of the guest and account wishlists, de-duplicated by product (AUTH-012). */
export async function mergeGuestWishlist(ctx: AppContext, accountId: string, productIds: string[]) {
  if (productIds.length === 0) return;
  const existing = await ctx.db.product.findMany({ where: { id: { in: [...new Set(productIds)] } }, select: { id: true } });
  const now = ctx.clock.now().getTime();
  // Keep the guest order: the first id is the most recent.
  await ctx.db.$transaction(existing.map((p) => ctx.db.wishlistEntry.upsert({
    where: { accountId_productId: { accountId, productId: p.id } },
    create: { accountId, productId: p.id, addedAt: new Date(now - productIds.indexOf(p.id)) },
    update: {},
  })));
}
