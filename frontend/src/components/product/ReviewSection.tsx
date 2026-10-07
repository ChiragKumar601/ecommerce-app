import { useInfiniteQuery } from '@tanstack/react-query';
import { BadgeCheck, Star } from 'lucide-react';
import { useId, useState } from 'react';
import type { ActiveProduct, ReviewPage } from '../../features/product';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { Button, EmptyState, ErrorState, Select, Skeleton } from '../ui';

const nf = new Intl.NumberFormat('en-IN');

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-0.5', className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn('size-4', i <= Math.round(value) ? 'fill-success text-success' : 'text-line-strong')} />)}
    </span>
  );
}

/** Ratings & reviews, read side (REV-001, REV-002): aggregate with 5→1 bars; list with sort, filters and Load more. */
export function ReviewSection({ product }: { product: ActiveProduct }) {
  const id = useId();
  const [sort, setSort] = useState<'recent' | 'highest' | 'lowest'>('recent');
  const [rating, setRating] = useState<number | null>(null);
  const [withImages, setWithImages] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['reviews', product.id, sort, rating, withImages],
    queryFn: ({ pageParam, signal }) => {
      const q = new URLSearchParams({ sort });
      if (rating) q.set('rating', String(rating));
      if (withImages) q.set('withImages', '1');
      if (pageParam) q.set('cursor', pageParam);
      return api<ReviewPage>(`/products/${product.id}/reviews?${q.toString()}`, { signal });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!product.rating,
  });
  const agg = product.rating;
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section id="reviews" className="scroll-mt-28 border-t border-line py-10" aria-labelledby={id}>
      <h2 id={id} className="mb-6 text-h3 font-bold md:text-h2">Ratings &amp; reviews</h2>
      {!agg ? (
        <EmptyState title="No reviews yet" description="Reviews appear here once customers who bought this item share their thoughts." className="py-8" />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="tabular text-display font-bold">{agg.average.toFixed(1)}</span>
              <Star className="size-7 fill-success text-success" aria-hidden="true" />
            </p>
            <p className="text-small text-ink-muted"><span className="tabular">{nf.format(agg.count)}</span> ratings</p>
            <ul className="mt-5 space-y-2" aria-label="Rating breakdown">
              {([5, 4, 3, 2, 1] as const).map((s) => {
                const n = agg.distribution[s];
                const pct = agg.count ? Math.round((n / agg.count) * 100) : 0;
                return (
                  <li key={s} className="flex items-center gap-3 text-small" aria-label={`${s} star: ${n} ratings`}>
                    <span className="tabular w-6 text-ink-soft">{s}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                      <span className={cn('block h-full rounded-full', s >= 3 ? 'bg-success' : s === 2 ? 'bg-warning' : 'bg-danger')} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="tabular w-12 text-right text-ink-muted">{nf.format(n)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter reviews">
                {[null, 5, 4, 3, 2, 1].map((s) => (
                  <button
                    key={s ?? 'all'}
                    type="button"
                    aria-pressed={rating === s}
                    onClick={() => setRating(s)}
                    className={cn('h-9 rounded-full border px-3.5 text-small font-medium', rating === s ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:border-ink')}
                  >
                    {s ? `${s}★` : 'All'}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={withImages}
                  onClick={() => setWithImages((w) => !w)}
                  className={cn('h-9 rounded-full border px-3.5 text-small font-medium', withImages ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:border-ink')}
                >
                  With images
                </button>
              </div>
              <label className="ml-auto flex items-center gap-2 text-small">
                <span className="text-ink-muted">Sort</span>
                <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 w-44">
                  <option value="recent">Most recent</option>
                  <option value="highest">Highest rating</option>
                  <option value="lowest">Lowest rating</option>
                </Select>
              </label>
            </div>
            {query.isPending ? (
              <div className="space-y-4" aria-hidden="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
            ) : query.isError && items.length === 0 ? (
              <ErrorState message="We couldn't load reviews." onRetry={() => void query.refetch()} />
            ) : items.length === 0 ? (
              <p className="py-6 text-ink-muted">No reviews match these filters.</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {items.map((r) => (
                    <li key={r.id} className="py-5 first:pt-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1 rounded-sm bg-success px-1.5 py-0.5 text-caption font-bold text-white" aria-label={`Rated ${r.rating} out of 5`}>
                          {r.rating}<Star className="size-3 fill-white" aria-hidden="true" />
                        </span>
                        <Stars value={r.rating} className="hidden sm:inline-flex" />
                        {r.verifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-caption font-semibold text-success"><BadgeCheck className="size-3.5" aria-hidden="true" />Verified Purchase</span>
                        )}
                      </div>
                      {r.text && <p className="mt-2 text-body text-ink">{r.text}</p>}
                      {r.images.length > 0 && (
                        <ul className="mt-3 flex gap-2">
                          {r.images.map((img, i) => (
                            <li key={img.url + i}><img src={img.url} alt={`Customer photo ${i + 1}`} width={64} height={64} loading="lazy" className="size-16 rounded-md object-cover" /></li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-caption text-ink-muted">{r.author} · {r.date}</p>
                    </li>
                  ))}
                </ul>
                {query.hasNextPage && (
                  <Button variant="secondary" className="mt-4" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                    Load more reviews
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
