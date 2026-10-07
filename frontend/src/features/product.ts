import type { Money, ProductCardData } from '@app/shared';
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { api } from '../lib/api-client';
import { queryClient } from '../lib/query';

export interface Variant {
  id: string;
  sizeLabel: string;
  price: Money;
  mrp: Money;
  discountPercent: number;
  available: number;
}

interface ProductBase {
  id: string;
  slug: string;
  href: string;
  name: string;
  brand: { name: string; slug: string };
  subtitle: string;
  image: { url: string; alt: string } | null;
  breadcrumbs: { primary: { label: string; href: string }[]; nodes: { path: string; label: string; href: string }[] };
}

export interface ActiveProduct extends ProductBase {
  active: true;
  description: string;
  materialCare: string;
  specifications: { key: string; value: string }[];
  colour: string;
  images: { url: string; alt: string }[];
  variants: Variant[];
  defaultVariantId: string;
  oneSize: boolean;
  rating: { average: number; count: number; distribution: Record<'1' | '2' | '3' | '4' | '5', number> } | null;
  offers: { bank: { bankName: string; summary: string; termsText: string } | null; coupons: { code: string; description: string; minEligibleValue: Money }[] };
  returns: { returnable: boolean; windowDays: number; text: string };
  sizeGuide: { name: string; table: { columns: string[]; rows: string[][] }; notes: string } | null;
  colours: { id: string; colour: string; href: string; image: string | null; current: boolean }[];
}

export type Product = ActiveProduct | (ProductBase & { active: false });

export interface Recommendations {
  similar: ProductCardData[];
  related: ProductCardData[];
  boughtTogether: ProductCardData[];
  completeTheLook: ProductCardData[];
}

export interface ReviewPage {
  items: { id: string; author: string; rating: number; text: string | null; verifiedPurchase: boolean; images: { url: string }[]; date: string }[];
  totalCount: number;
  nextCursor: string | null;
}

export const productQuery = (id: string) => ({ queryKey: ['product', id], queryFn: () => api<Product>(`/products/${id}`), staleTime: 30_000 });
export const recsQuery = (id: string) => ({ queryKey: ['recs', id], queryFn: () => api<Recommendations>(`/products/${id}/recommendations`), staleTime: 5 * 60_000 });

/** `/p/<slug>-<id>`: the id is the last hyphen-separated part (spec §10.1). */
export function parseProductParam(param: string | undefined): string | null {
  const m = /-([a-z0-9]{10})$/.exec(param ?? '') ?? /^([a-z0-9]{10})$/.exec(param ?? '');
  return m ? m[1]! : null;
}

export async function productLoader({ params }: LoaderFunctionArgs) {
  const id = parseProductParam(params['slugId']);
  if (!id) throw new Response('Not found', { status: 404 });
  const product = await queryClient.ensureQueryData(productQuery(id));
  void queryClient.prefetchQuery(recsQuery(id));
  // One canonical URL per product (FE-007): fix stale or edited slugs.
  if (`/p/${params['slugId']}` !== product.href) return redirect(product.href);
  return product;
}
