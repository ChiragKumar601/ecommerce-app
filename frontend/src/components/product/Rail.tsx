import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useId, useRef } from 'react';
import type { ProductCardData } from '@app/shared';
import { toggleWishlist, useWishlistIds } from '../../features/wishlist';
import { ProductCard } from './ProductCard';

/** Horizontal product rail (PDP-011). Omitted by callers when empty. */
export function RecommendationRail({ title, products }: { title: string; products: ProductCardData[] }) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const wishlist = useWishlistIds();
  const onToggle = useCallback((p: ProductCardData) => toggleWishlist(p.id, p.name), []);
  if (products.length === 0) return null;
  const scroll = (dir: number) => list.current?.scrollBy({ left: dir * list.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="py-8 md:py-10" aria-labelledby={id}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id={id} className="text-h3 font-bold md:text-h2">{title}</h2>
        {products.length > 4 && (
          <div className="hidden gap-2 md:flex">
            <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} back`} className="flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface hover:border-ink">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} forward`} className="flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface hover:border-ink">
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <ul ref={list} className="-mx-[var(--page-gutter)] flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-[var(--page-gutter)] px-[var(--page-gutter)] pb-2 sm:gap-5 [scrollbar-width:thin]">
        {products.map((p) => (
          <li key={p.id} className="w-40 shrink-0 snap-start sm:w-48 lg:w-56">
            <ProductCard product={p} wishlisted={wishlist.has(p.id)} onToggleWishlist={onToggle} />
          </li>
        ))}
      </ul>
    </section>
  );
}
