// Listing constants (spec §11.2, PLP-002/003). Zod-free so the client can import them cheaply.

export const LISTING_SORTS = ['recommended', 'new', 'price_asc', 'price_desc', 'discount', 'rating'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const LISTING_SCOPES = ['node', 'all', 'bank-offer', 'best-seller', 'search'] as const;
export type ListingScope = (typeof LISTING_SCOPES)[number];

/** Minimum-discount buckets (SD-30). */
export const DISCOUNT_BUCKETS = [10, 20, 30, 40, 50, 60, 70] as const;
/** "4★ & above", "3★ & above" (PLP-002). */
export const RATING_BUCKETS = [4, 3] as const;

/** Filters that carry over between listings of the same section (PLP-009). */
export const PERSISTENT_FILTERS = ['brand', 'priceMin', 'priceMax', 'colour', 'size', 'rating', 'discount', 'inStock'] as const;
