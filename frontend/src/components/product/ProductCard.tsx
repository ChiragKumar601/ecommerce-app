import { Heart } from 'lucide-react';
import { memo } from 'react';
import { Link, useLocation } from 'react-router';
import type { ProductCardData } from '@app/shared';
import { cn } from '../../lib/cn';
import { Badge, PriceTag, RatingBadge, Skeleton } from '../ui';

/**
 * Product card (PLP-011…014): borderless, fixed 3:4 image, rating badge, brand, one-line name and
 * subtitle, price with MRP and discount, wishlist toggle, "Out of stock" label.
 */
export const ProductCard = memo(function ProductCard({ product, wishlisted, onToggleWishlist, priority }: {
  product: ProductCardData;
  wishlisted: boolean;
  onToggleWishlist: (p: ProductCardData) => void;
  priority?: boolean;
}) {
  const p = product;
  // The listing path travels with the link, for product breadcrumbs (NAV-010).
  const from = useLocation().pathname;
  return (
    <article className="group relative flex flex-col" aria-labelledby={`pc-${p.id}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-muted">
        <Link to={p.href} state={{ from }} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          {p.image ? (
            <>
              <img
                src={p.image.url}
                alt=""
                width={300}
                height={400}
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                decoding="async"
                className={cn('size-full object-cover transition-opacity duration-300 ease-standard', p.outOfStock && 'opacity-60', p.hoverImage && 'group-hover:opacity-0')}
              />
              {p.hoverImage && (
                <img src={p.hoverImage.url} alt="" width={300} height={400} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 ease-standard group-hover:opacity-100" />
              )}
            </>
          ) : null}
        </Link>
        {p.rating && <RatingBadge average={p.rating.average} count={p.rating.count} className="absolute bottom-2 left-2" />}
        {p.outOfStock && <Badge tone="solid" className="absolute left-2 top-2">Out of stock</Badge>}
        <button
          type="button"
          onClick={() => onToggleWishlist(p)}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
          className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full text-ink transition-transform duration-150 ease-standard hover:scale-110 active:scale-95"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-surface/90 shadow-1">
            <Heart className={cn('size-4', wishlisted && 'fill-brand text-brand')} aria-hidden="true" />
          </span>
        </button>
      </div>
      <div className="mt-2.5 flex min-w-0 flex-col gap-0.5 px-0.5">
        <p className="truncate text-small font-bold text-ink">{p.brand}</p>
        <h3 id={`pc-${p.id}`} className="truncate text-small text-ink-soft">
          <Link to={p.href} state={{ from }} className="after:absolute after:inset-x-0 after:bottom-0 after:top-[calc(100%-5rem)] hover:underline focus-visible:outline-none" title={p.name}>
            {p.name}
          </Link>
        </h3>
        <p className="truncate text-caption text-ink-muted">{p.subtitle}</p>
        <PriceTag price={p.price} mrp={p.mrp} discountPercent={p.discountPercent} size="sm" className="mt-1" />
      </div>
    </article>
  );
});

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="aspect-[3/4] w-full rounded-md" />
      <Skeleton className="mt-3 h-3.5 w-1/2" />
      <Skeleton className="mt-2 h-3.5 w-4/5" />
      <Skeleton className="mt-2 h-3 w-2/3" />
      <Skeleton className="mt-2.5 h-4 w-3/5" />
    </div>
  );
}

export function ProductGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn('grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4', className)}>{children}</ul>;
}
