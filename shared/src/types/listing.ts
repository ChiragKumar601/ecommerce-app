import type { Money } from './money.ts';

/** Product card data (PLP-011…013). Price comes from the lowest-priced available variant (SD-32). */
export interface ProductCardData {
  id: string;
  slug: string;
  href: string;
  brand: string;
  name: string;
  subtitle: string;
  image: { url: string; alt: string } | null;
  hoverImage: { url: string; alt: string } | null;
  price: Money;
  mrp: Money;
  discountPercent: number;
  rating: { average: number; count: number } | null;
  outOfStock: boolean;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface ListingFacets {
  gender?: FacetValue[];
  category?: FacetValue[];
  brand?: FacetValue[];
  colour?: FacetValue[];
  size?: FacetValue[];
  discount?: FacetValue[];
  rating?: FacetValue[];
  /** Selling-price bounds in rupees within the scope and the other filters. */
  price?: { min: number; max: number };
  inStock?: { count: number };
}

/** Filters actually applied, after validation and pruning (PLP-006, PLP-009). */
export interface AppliedFilters {
  gender: string[];
  category: string[];
  brand: string[];
  colour: string[];
  size: string[];
  priceMin?: number;
  priceMax?: number;
  discount?: number;
  rating?: number;
  inStock: boolean;
  bankOffer: boolean;
  inclusiveSizing: boolean;
}

export interface ListingScopeInfo {
  kind: 'section' | 'category' | 'subcategory' | 'all' | 'bank-offer' | 'best-seller' | 'search';
  title: string;
  /** Section slug for filter persistence (PLP-009); null outside a section. */
  section: string | null;
  node?: { id: string; name: string; path: string; type: string };
  breadcrumbs: { label: string; href?: string }[];
  q?: string;
}

export interface ListingResponse {
  scope: ListingScopeInfo;
  items: ProductCardData[];
  totalCount: number;
  nextCursor: string | null;
  facets: ListingFacets;
  applied: AppliedFilters;
  /** Labels for applied filter values (chips), keyed `<facet>:<value>`. */
  labels: Record<string, string>;
}
