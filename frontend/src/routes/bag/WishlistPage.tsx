import { useQuery } from '@tanstack/react-query';
import { Heart, ShoppingBag, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Dialog, EmptyState, ErrorState, PageHeader, PageLayout, PriceTag, Skeleton } from '../../components/ui';
import { toast } from '../../components/ui/toast';
import { productQuery, type ActiveProduct } from '../../features/product';
import { moveToBag, removeFromWishlist, useWishlistPages, type WishlistItem } from '../../features/wishlist';
import { errorMessage } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';

/** Size picker for Move to Bag (WSH-002): only sizes with stock. */
function SizePicker({ item, onClose }: { item: WishlistItem; onClose: () => void }) {
  const { data } = useQuery(productQuery(item.card.id));
  const product: ActiveProduct | null = data?.active ? data : null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sizes = product?.variants.filter((v) => v.available > 0) ?? [];
  const confirm = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const view = await moveToBag(item.card.id, chosen);
      toast({ title: view.message ?? 'Moved to bag', description: item.card.name, tone: 'success' });
      onClose();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Select size" description={`${item.card.brand} ${item.card.name}`} footer={<Button onClick={confirm} disabled={!chosen} loading={busy}>Move to Bag</Button>}>
      {!product ? (
        <div className="flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="size-12 rounded-full" />)}</div>
      ) : (
        <div role="radiogroup" aria-label="Sizes in stock" className="flex flex-wrap gap-2.5">
          {sizes.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={chosen === v.id} onClick={() => setChosen(v.id)} className={cn('h-12 min-w-12 rounded-full border px-4 text-small font-semibold', chosen === v.id ? 'border-ink bg-ink text-white' : 'border-line-strong hover:border-ink')}>
              {v.sizeLabel}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function WishlistCard({ item, onMove, busy, setBusy }: { item: WishlistItem; onMove: (i: WishlistItem) => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const p = item.card;
  const unavailable = item.status !== 'ok';
  return (
    <article className="flex flex-col" aria-labelledby={`wl-${p.id}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-muted">
        <Link to={p.href} tabIndex={-1} aria-hidden="true" className="absolute inset-0">
          {p.image && <img src={p.image.url} alt="" width={300} height={400} loading="lazy" className={cn('size-full object-cover', unavailable && 'opacity-50')} />}
        </Link>
        {unavailable && <Badge tone="solid" className="absolute left-2 top-2">{item.status === 'unavailable' ? 'Unavailable' : 'Out of stock'}</Badge>}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await removeFromWishlist(p.id);
              toast({ title: 'Removed from wishlist', description: p.name });
            } catch (e) {
              toast({ title: errorMessage(e), tone: 'danger' });
            } finally {
              setBusy(false);
            }
          }}
          aria-label={`Remove ${p.name} from wishlist`}
          className="absolute right-1 top-1 flex size-11 items-center justify-center"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-surface/90 shadow-1"><X className="size-4" aria-hidden="true" /></span>
        </button>
      </div>
      <div className="mt-2.5 flex min-w-0 flex-col gap-0.5 px-0.5">
        <p className="truncate text-small font-bold">{p.brand}</p>
        <h2 id={`wl-${p.id}`} className="truncate text-small text-ink-soft"><Link to={p.href} className="hover:underline">{p.name}</Link></h2>
        <PriceTag price={p.price} mrp={p.mrp} discountPercent={p.discountPercent} size="sm" className="mt-1" />
      </div>
      <Button variant="secondary" size="sm" className="mt-3" disabled={unavailable || busy} onClick={() => onMove(item)}>
        <ShoppingBag className="size-4" aria-hidden="true" />Move to Bag
      </Button>
    </article>
  );
}

/** Wishlist page (WSH-001…004): cards with Remove and Move to Bag, 24 at a time. */
export function WishlistPage() {
  const q = useWishlistPages();
  const [picking, setPicking] = useState<WishlistItem | null>(null);
  const [busy, setBusy] = useState(false);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.totalCount ?? 0;

  const onMove = async (item: WishlistItem) => {
    // One available size (or a one-size product) moves straight away; otherwise pick a size.
    setBusy(true);
    try {
      const p = await queryClient.fetchQuery(productQuery(item.card.id));
      const sizes = p.active ? p.variants.filter((v) => v.available > 0) : [];
      if (p.active && sizes.length === 1) {
        const view = await moveToBag(item.card.id, sizes[0]!.id);
        toast({ title: view.message ?? 'Moved to bag', description: item.card.name, tone: 'success' });
      } else {
        setPicking(item);
      }
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  if (q.isError && !q.data) return <PageLayout><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></PageLayout>;
  if (q.isLoading && !q.data) {
    return (
      <PageLayout>
        <Skeleton className="mb-6 h-9 w-48" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] w-full" />)}</div>
      </PageLayout>
    );
  }
  if (items.length === 0) {
    return (
      <PageLayout narrow>
        <EmptyState level={1} icon={<Heart className="size-7" aria-hidden="true" />} title="Your wishlist is empty" description="Save items you love by tapping the heart on any product." action={<Button asChild size="lg"><Link to="/">Continue Shopping</Link></Button>} />
      </PageLayout>
    );
  }
  return (
    <PageLayout>
      <PageHeader title="Wishlist" subtitle={`${total} item${total === 1 ? '' : 's'}`} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((i) => <WishlistCard key={i.card.id} item={i} onMove={onMove} busy={busy} setBusy={setBusy} />)}
      </div>
      {q.hasNextPage && (
        <div className="mt-10 flex justify-center">
          <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button>
        </div>
      )}
      {picking && <SizePicker item={picking} onClose={() => setPicking(null)} />}
    </PageLayout>
  );
}
