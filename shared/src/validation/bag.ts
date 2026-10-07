import { z } from 'zod';
import { couponCodeSchema } from './fields.ts';

// Bag and wishlist request schemas (spec §11.2 Bag / Wishlist). Shared by the client and the API.

const id = z.string().min(1).max(64);

/** A bag line as kept on a guest's device (FE-003). */
export const deviceBagLineSchema = z.object({
  variantId: id,
  quantity: z.number().int().min(1).max(10),
  addedAt: z.number().int().nonnegative(),
  lastSeenUnitPrice: z.number().int().nonnegative().optional(),
});

export const bagOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add'), variantId: id, quantity: z.number().int().min(1).max(10).optional() }),
  z.object({ type: z.literal('set'), variantId: id, quantity: z.number().int().min(1).max(10) }),
  z.object({ type: z.literal('remove'), variantId: id }),
  z.object({ type: z.literal('applyCoupon'), code: couponCodeSchema }),
  z.object({ type: z.literal('removeCoupon') }),
]);

export const guestQuoteSchema = z.object({
  lines: z.array(deviceBagLineSchema).max(50),
  coupon: z.string().max(20).nullable().default(null),
  op: bagOpSchema.optional(),
});

export const addLineSchema = z.object({ variantId: id, quantity: z.number().int().min(1).max(10).optional() });
export const setQtySchema = z.object({ quantity: z.number().int().min(1).max(10) });
export const couponSchema = z.object({ code: couponCodeSchema });
export const wishlistAddSchema = z.object({ productId: id });
export const moveToBagSchema = z.object({ variantId: id.optional() });
export const guestWishlistSchema = z.object({ productIds: z.array(id).max(1000), cursor: z.string().max(100).optional() });
