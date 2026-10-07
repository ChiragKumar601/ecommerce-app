import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { ArrowRight, BadgePercent, Heart, MapPin, RotateCcw, Ruler, ShoppingBag, Tag, Truck, Zap } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { promptLogin } from '../../components/auth/AuthDialogs';
import { toast } from '../../components/ui/toast';
import { bagAction } from '../../features/bag';
import { useAccount } from '../../features/session';
import { useAddresses } from '../../features/address';
import { queryClient } from '../../lib/query';
import { Gallery } from '../../components/product/Gallery';
import { RecommendationRail } from '../../components/product/Rail';
import { ReviewSection } from '../../components/product/ReviewSection';
import { Accordion, Breadcrumbs, Button, Dialog, EmptyState, Input, PageLayout, PriceTag, RatingBadge } from '../../components/ui';
import { parseProductParam, productQuery, recsQuery, type ActiveProduct, type Product, type Variant } from '../../features/product';
import { toggleWishlist, useWishlistIds } from '../../features/wishlist';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { deviceStore, useDevice } from '../../lib/device-store';

/**
 * Breadcrumbs (NAV-010): the listing the customer came from, when it contains this product;
 * otherwise the primary section → first category → first subcategory.
 */
function useCrumbs(p: Product) {
  const from = (useLocation().state as { from?: string } | null)?.from;
  const fromPath = from?.startsWith('/shop/') ? from.slice(6) : from?.slice(1);
  const byPath = new Map(p.breadcrumbs.nodes.map((n) => [n.path, n]));
  let chain = p.breadcrumbs.primary;
  if (fromPath && byPath.has(fromPath)) {
    const parts = fromPath.split('/');
    chain = parts.map((_, i) => byPath.get(parts.slice(0, i + 1).join('/'))!).filter(Boolean).map((n) => ({ label: n.label, href: n.href }));
  }
  return [{ label: 'Home', to: '/' }, ...chain.map((c) => ({ label: c.label, to: c.href })), { label: p.name }];
}

/** Size selector (PDP-003): out-of-stock sizes disabled, struck through, named "… Out of stock". */
function SizeSelector({ variants, selected, onSelect, error, sizeGuide }: { variants: Variant[]; selected: string | null; onSelect: (id: string) => void; error?: string | null; sizeGuide: ActiveProduct['sizeGuide'] }) {
  const id = useId();
  const [guide, setGuide] = useState(false);
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 id={id} className="text-small font-bold uppercase tracking-wider">Select size</h2>
        {sizeGuide && (
          <button type="button" onClick={() => setGuide(true)} className="inline-flex min-h-9 items-center gap-1.5 text-small font-semibold text-brand hover:underline">
            <Ruler className="size-4" aria-hidden="true" /> Size guide
          </button>
        )}
      </div>
      <div role="radiogroup" aria-labelledby={id} aria-describedby={error ? `${id}-err` : undefined} className="flex flex-wrap gap-2.5" data-size-selector>
        {variants.map((v) => {
          const out = v.available === 0;
          const on = selected === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={out}
              aria-label={out ? `${v.sizeLabel}, Out of stock` : v.sizeLabel}
              onClick={() => onSelect(v.id)}
              className={cn(
                'relative h-12 min-w-12 rounded-full border px-4 text-small font-semibold transition-colors duration-150',
                on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:border-ink',
                out && 'cursor-not-allowed border-line text-ink-muted line-through hover:border-line',
              )}
            >
              {v.sizeLabel}
              {!out && v.available <= 3 && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-warning-soft px-1.5 text-[0.625rem] font-bold leading-4 text-warning no-underline">{v.available} left</span>}
            </button>
          );
        })}
      </div>
      {error && <p id={`${id}-err`} role="alert" className="mt-3 text-small font-medium text-danger">{error}</p>}
      {sizeGuide && (
        <Dialog open={guide} onOpenChange={setGuide} title={`Size guide — ${sizeGuide.name}`} className="max-w-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-line text-left">{sizeGuide.table.columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-semibold">{c}</th>)}</tr>
              </thead>
              <tbody>
                {sizeGuide.table.rows.map((r) => (
                  <tr key={r.join('|')} className="border-b border-line last:border-0">
                    {r.map((cell, i) => (i === 0 ? <th key={i} scope="row" className="px-3 py-2 text-left font-semibold">{cell}</th> : <td key={i} className="tabular px-3 py-2">{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-small text-ink-muted">{sizeGuide.notes}</p>
        </Dialog>
      )}
    </div>
  );
}

/** Pincode check (PDP-007): guest pincode remembered on the device. */
function PincodeCheck() {
  const account = useAccount();
  const addresses = useAddresses();
  const devicePin = useDevice((d) => d.pincode);
  // PDP-007: a logged-in customer's pincode defaults to their default address.
  const defaultPin = addresses.data?.items.find((a) => a.isDefault)?.pincode ?? null;
  const remembered = account ? defaultPin ?? devicePin : devicePin;
  return <PincodeCheckForm key={remembered ?? 'none'} remembered={remembered} />;
}

function PincodeCheckForm({ remembered }: { remembered: string | null }) {
  const [value, setValue] = useState(remembered ?? '');
  const [pin, setPin] = useState<string | null>(remembered);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const result = useQuery({
    queryKey: ['pincode', pin],
    queryFn: () => api<{ serviceable: boolean; message: string; rule?: string }>(`/pincode/${pin}`),
    enabled: !!pin,
    staleTime: 10 * 60_000,
  });
  const check = () => {
    const v = value.trim();
    if (!/^[1-9]\d{5}$/.test(v)) {
      setError('Enter a valid 6-digit pincode');
      return;
    }
    setError(null);
    setPin(v);
    deviceStore.update((d) => ({ ...d, pincode: v }));
  };
  return (
    <div className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-small font-bold uppercase tracking-wider"><Truck className="size-4" aria-hidden="true" />Delivery options</h2>
      <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <label htmlFor={id} className="sr-only">Pincode</label>
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input id={id} inputMode="numeric" maxLength={6} placeholder="Enter pincode" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className="pl-9" />
        </div>
        <Button type="submit" variant="secondary" loading={result.isFetching}>Check</Button>
      </form>
      <div aria-live="polite" className="mt-2 min-h-6 text-small">
        {error ? (
          <p id={`${id}-err`} className="text-danger">{error}</p>
        ) : result.data ? (
          result.data.serviceable ? (
            <p><span className="font-semibold text-success">{result.data.message}</span>{result.data.rule && <span className="block text-ink-muted">{result.data.rule}</span>}</p>
          ) : (
            <p className="font-medium text-danger">{result.data.message}</p>
          )
        ) : result.isError ? (
          <p className="text-danger">{result.error instanceof ApiError ? result.error.message : "Couldn't check this pincode."}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Offers block (PDP-005): bank offer and up to 3 eligible coupons. */
function OffersBlock({ offers }: { offers: ActiveProduct['offers'] }) {
  const [terms, setTerms] = useState(false);
  if (!offers.bank && offers.coupons.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-small font-bold uppercase tracking-wider"><Tag className="size-4" aria-hidden="true" />Best offers</h2>
      <ul className="space-y-3 rounded-lg border border-line bg-surface p-4 text-small">
        {offers.bank && (
          <li className="flex gap-3">
            <BadgePercent className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <span className="font-semibold">{offers.bank.summary}</span>{' '}
              <button type="button" onClick={() => setTerms(true)} className="font-semibold text-brand underline-offset-2 hover:underline">T&amp;C apply</button>
            </span>
          </li>
        )}
        {offers.coupons.map((c) => (
          <li key={c.code} className="flex gap-3">
            <Tag className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <span>
              Use code <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-bold tracking-wide text-ink">{c.code}</code> — {c.description}.{' '}
              <span className="text-ink-muted">Min. order {c.minEligibleValue.display}.</span>
            </span>
          </li>
        ))}
      </ul>
      {offers.bank && (
        <Dialog open={terms} onOpenChange={setTerms} title={`${offers.bank.bankName} offer — terms`}>
          <p className="whitespace-pre-line text-ink-soft">{offers.bank.termsText}</p>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Add to Bag and Buy Now (PDP-004, PDP-008, PDP-009, PDP-012). A size is required when there's more
 * than one; after adding, the control becomes "Go to Bag". Refusals refresh the product and show the
 * specific message; a new price is shown with "Price updated".
 */
function PurchaseActions({ p, selected, onNeedSize, added, setAdded, disabled }: { p: ActiveProduct; selected: string | null; onNeedSize: () => void; added: boolean; setAdded: (v: boolean) => void; disabled: boolean }) {
  const [busy, setBusy] = useState<'bag' | 'buy' | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const account = useAccount();
  const navigate = useNavigate();
  const variant = p.variants.find((v) => v.id === selected) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['product', p.id] });

  const refused = (e: unknown) => {
    if (e instanceof ApiError && (e.code === 'PRODUCT_INACTIVE' || e.code === 'OUT_OF_STOCK')) {
      setBlocked(e.message);
      void refresh();
    }
    toast({ title: errorMessage(e), tone: 'danger' });
  };

  const addToBag = async () => {
    if (!variant) return onNeedSize();
    setBusy('bag');
    try {
      const view = await bagAction({ type: 'add', variantId: variant.id });
      const line = view.lines.find((l) => l.variantId === variant.id);
      if (line && line.unitPrice.paise !== variant.price.paise) {
        void refresh();
        toast({ title: 'Price updated', description: `${p.name} is now ${line.unitPrice.display}` });
      }
      setAdded(true);
      toast({ title: view.message ?? 'Added to bag', description: view.message ? undefined : `${p.brand.name} ${p.name} · ${variant.sizeLabel}`, tone: view.message ? 'default' : 'success', action: { label: 'View bag', onClick: () => navigate('/bag') } });
    } catch (e) {
      refused(e);
    } finally {
      setBusy(null);
    }
  };

  const buyNow = async () => {
    if (!variant) return onNeedSize();
    if (!account) return promptLogin({ action: 'buy-now', payload: { variantId: variant.id }, title: 'Log in to buy now' });
    navigate(`/checkout/buy-now?variant=${encodeURIComponent(variant.id)}`);
  };

  const off = disabled || !!blocked || (variant !== null && variant.available === 0);
  return (
    <div className="mt-6">
      {blocked && <p role="alert" className="mb-3 text-small font-semibold text-danger">{blocked}</p>}
      <div className="flex gap-3">
        {added ? (
          <Button asChild variant="brand" size="lg" block><Link to="/bag">Go to Bag <ArrowRight className="size-5" aria-hidden="true" /></Link></Button>
        ) : (
          <Button variant="brand" size="lg" block onClick={addToBag} loading={busy === 'bag'} disabled={off}>
            <ShoppingBag className="size-5" aria-hidden="true" />Add to Bag
          </Button>
        )}
        <Button size="lg" block onClick={buyNow} loading={busy === 'buy'} disabled={off}>
          <Zap className="size-5" aria-hidden="true" />Buy Now
        </Button>
      </div>
    </div>
  );
}

function Rails({ id, similarOnly }: { id: string; similarOnly?: boolean }) {
  const { data } = useQuery(recsQuery(id));
  if (!data) return null;
  return (
    <>
      <RecommendationRail title="Similar products" products={data.similar} />
      {!similarOnly && (
        <>
          <RecommendationRail title="Complete the look" products={data.completeTheLook} />
          <RecommendationRail title="Frequently bought together" products={data.boughtTogether} />
          <RecommendationRail title="You may also like" products={data.related} />
        </>
      )}
    </>
  );
}

function ActiveProductView({ p }: { p: ActiveProduct }) {
  const crumbs = useCrumbs(p);
  const wishlist = useWishlistIds();
  const [selected, setSelected] = useState<string | null>(p.oneSize ? p.variants[0]!.id : null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const shown = p.variants.find((v) => v.id === (selected ?? p.defaultVariantId)) ?? p.variants[0]!;
  const wished = wishlist.has(p.id);
  const allOut = p.variants.every((v) => v.available === 0);
  return (
    <PageLayout>
      <Breadcrumbs items={crumbs} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
        <Gallery images={p.images} />
        <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start">
          <Link to={`/search?q=${encodeURIComponent(p.brand.name)}&brand=${p.brand.slug}`} className="text-h4 font-bold text-ink hover:underline">{p.brand.name}</Link>
          <h1 className="mt-1 text-h3 font-normal text-ink-soft md:text-h2 md:font-normal">{p.name}</h1>
          <p className="mt-1 text-small text-ink-muted">{p.subtitle}</p>
          {p.rating && (
            <a href="#reviews" className="mt-3 inline-block rounded-sm" aria-label={`Rated ${p.rating.average.toFixed(1)} out of 5 by ${p.rating.count} customers. Go to reviews`}>
              <RatingBadge average={p.rating.average} count={p.rating.count} className="border border-line shadow-none" />
            </a>
          )}
          <div className="mt-5 border-t border-line pt-5">
            <PriceTag price={shown.price} mrp={shown.mrp} discountPercent={shown.discountPercent} size="lg" />
            <p className="mt-1 text-small font-semibold text-success">Inclusive of all taxes</p>
            {allOut && <p className="mt-2 text-small font-semibold text-danger">This item is currently out of stock</p>}
          </div>

          {p.colours.length > 1 && (
            <div className="mt-6">
              <h2 className="mb-3 text-small font-bold uppercase tracking-wider">More colours</h2>
              <ul className="flex flex-wrap gap-2.5">
                {p.colours.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={c.href}
                      replace
                      aria-label={c.current ? `${c.colour}, current colour` : c.colour}
                      aria-current={c.current ? 'true' : undefined}
                      className={cn('block w-14 overflow-hidden rounded-md border-2', c.current ? 'border-ink' : 'border-transparent hover:border-line-strong')}
                    >
                      {c.image ? <img src={c.image} alt="" width={56} height={75} className="aspect-[3/4] w-full object-cover" /> : <span className="block aspect-[3/4] bg-surface-muted" />}
                    </Link>
                    <span className="mt-1 block w-14 truncate text-center text-caption text-ink-muted">{c.colour}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <SizeSelector variants={p.variants} selected={selected} onSelect={(id) => { setSelected(id); setSizeError(null); setAdded(false); }} error={sizeError} sizeGuide={p.sizeGuide} />

          <PurchaseActions p={p} selected={selected} onNeedSize={() => {
            setSizeError('Please select a size');
            document.querySelector<HTMLElement>('[data-size-selector] [role=radio]:not([disabled])')?.focus();
          }} added={added} setAdded={setAdded} disabled={allOut} />
          <div className="mt-3">
            <Button variant="secondary" size="lg" block aria-pressed={wished} onClick={() => toggleWishlist(p.id, p.name)}>
              <Heart className={cn('size-5', wished && 'fill-brand text-brand')} aria-hidden="true" />
              {wished ? 'Wishlisted' : 'Wishlist'}
            </Button>
          </div>

          <PincodeCheck />
          <OffersBlock offers={p.offers} />
          <p className={cn('mt-6 flex items-center gap-2 text-small font-semibold', p.returns.returnable ? 'text-ink' : 'text-ink-muted')}>
            <RotateCcw className="size-4" aria-hidden="true" /> {p.returns.text}
          </p>

          <Accordion
            className="mt-6 border-t border-line"
            defaultOpen={['description']}
            items={[
              { value: 'description', title: 'Product details', content: <p className="whitespace-pre-line text-ink-soft">{p.description}</p> },
              { value: 'care', title: 'Material & care', content: <p className="text-ink-soft">{p.materialCare}</p> },
              {
                value: 'specs',
                title: 'Specifications',
                content: (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-small">
                    {p.specifications.map((s) => (
                      <div key={s.key} className="border-b border-line pb-2">
                        <dt className="text-ink-muted">{s.key}</dt>
                        <dd className="font-medium text-ink">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                ),
              },
            ]}
          />
        </div>
      </div>
      <div className="mt-12">
        <ReviewSection product={p} />
      </div>
      <Rails id={p.id} />
    </PageLayout>
  );
}

/** Inactive product (PDP-013): message and Similar products, no purchase controls. */
function InactiveProductView({ p }: { p: Product }) {
  const crumbs = useCrumbs(p);
  return (
    <PageLayout>
      <Breadcrumbs items={crumbs} />
      <EmptyState level={1} title="This product is no longer available" description={`${p.brand.name} ${p.name} has been discontinued. Here are similar products you might like.`} action={<Button asChild variant="secondary"><Link to={p.breadcrumbs.primary.at(-1)?.href ?? '/'}>Browse similar items</Link></Button>} />
      <Rails id={p.id} similarOnly />
    </PageLayout>
  );
}

export function ProductPage() {
  const { slugId } = useParams();
  const id = parseProductParam(slugId)!;
  const { data } = useSuspenseQuery(productQuery(id));
  return data.active ? <ActiveProductView key={data.id} p={data} /> : <InactiveProductView p={data} />;
}
