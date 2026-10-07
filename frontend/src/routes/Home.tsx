import { useSuspenseQuery } from '@tanstack/react-query';
import { ArrowRight, BadgePercent } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { HeroCarousel, type HeroSlide } from '../components/landing/HeroCarousel';
import { Dialog, PageLayout, Section } from '../components/ui';
import { api } from '../lib/api-client';
import { queryClient } from '../lib/query';

interface Landing {
  slides: HeroSlide[];
  bankOffer: { id: string; bankName: string; summary: string; termsText: string; href: string } | null;
  cards: { id: string; name: string; image: { url: string; alt: string }; discountText: string; href: string }[];
}

const landingQuery = { queryKey: ['landing'], queryFn: () => api<Landing>('/content/landing'), staleTime: 5 * 60_000 };

export const homeLoader = () => queryClient.ensureQueryData(landingQuery);

/** Bank-offer tile (LND-004): opens the offer listing; "T&C apply" opens the terms. */
function BankOfferTile({ offer }: { offer: NonNullable<Landing['bankOffer']> }) {
  const [terms, setTerms] = useState(false);
  return (
    <div className="group relative mt-6 flex flex-col gap-4 overflow-hidden rounded-xl border border-brand/20 bg-brand-soft p-5 transition-shadow duration-200 hover:shadow-2 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand" aria-hidden="true">
        <BadgePercent className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-caption font-bold uppercase tracking-wider text-brand">{offer.bankName} offer</p>
        <h2 className="mt-1 text-h4 font-bold text-ink sm:text-h3">
          <Link to={offer.href} className="after:absolute after:inset-0 focus-visible:outline-none">{offer.summary}</Link>
        </h2>
      </div>
      <div className="relative z-10 flex items-center gap-4">
        <button type="button" onClick={() => setTerms(true)} className="min-h-11 text-small font-semibold text-ink-soft underline underline-offset-4 hover:text-ink">
          T&amp;C apply
        </button>
        <span className="pointer-events-none inline-flex items-center gap-1.5 text-small font-bold text-brand" aria-hidden="true">
          Shop offer <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
      <Dialog open={terms} onOpenChange={setTerms} title={`${offer.bankName} offer — terms`}>
        <p className="whitespace-pre-line text-body text-ink-soft">{offer.termsText}</p>
      </Dialog>
    </div>
  );
}

/** Shop by Category (LND-005, LND-006): data-driven cards, fixed 3:4 crop, 2/4/5/6 columns. */
function ShopByCategory({ cards }: { cards: Landing['cards'] }) {
  if (cards.length === 0) return null;
  return (
    <Section title="Shop by Category" id="shop-by-category">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {cards.map((c, i) => (
          <li key={c.id}>
            <Link to={c.href} className="group block rounded-lg focus-visible:outline-offset-4">
              <div className="aspect-[3/4] overflow-hidden rounded-lg bg-surface-muted">
                <img
                  src={c.image.url}
                  alt=""
                  width={300}
                  height={400}
                  loading={i < 6 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="size-full object-cover transition-transform duration-500 ease-standard group-hover:scale-105 motion-reduce:transition-none"
                />
              </div>
              <div className="mt-3 text-center">
                <p className="truncate text-small font-semibold text-ink sm:text-body">{c.name}</p>
                <p className="mt-0.5 text-body font-bold text-sale sm:text-h4">{c.discountText}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-wider text-ink-soft group-hover:text-ink">
                  Shop Now <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Landing page in LND-001 order: hero carousel, bank-offer tile, Shop by Category (footer from the layout). */
export function Home() {
  const { data } = useSuspenseQuery(landingQuery);
  return (
    <PageLayout className="pt-4 md:pt-6">
      <h1 className="sr-only">Wardrobe &amp; Co. — fashion, beauty and home</h1>
      <HeroCarousel slides={data.slides} />
      {data.bankOffer && <BankOfferTile offer={data.bankOffer} />}
      <ShopByCategory cards={data.cards} />
    </PageLayout>
  );
}
