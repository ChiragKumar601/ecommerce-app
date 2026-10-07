import { Search } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, PageLayout } from '../../components/ui';
import { SITE_FALLBACK, useNav, useSite } from '../../features/site';

function Suggestions() {
  const popular = (useSite().data ?? SITE_FALLBACK).popularSearches;
  const sections = useNav().data ?? [];
  return (
    <div className="mx-auto mt-2 grid max-w-2xl gap-8 text-left sm:grid-cols-2">
      {popular.length > 0 && (
        <section aria-labelledby="zr-popular">
          <h2 id="zr-popular" className="mb-3 text-caption font-bold uppercase tracking-wider text-ink-muted">Popular searches</h2>
          <ul className="flex flex-wrap gap-2">
            {popular.map((p) => (
              <li key={p}>
                <Link to={`/search?q=${encodeURIComponent(p)}`} className="inline-flex h-9 items-center rounded-full border border-line-strong bg-surface px-3.5 text-small font-medium hover:border-ink">{p}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="zr-sections">
        <h2 id="zr-sections" className="mb-3 text-caption font-bold uppercase tracking-wider text-ink-muted">Shop by section</h2>
        <ul className="grid grid-cols-2 gap-2">
          {sections.map((s) => (
            <li key={s.id}>
              <Link to={s.href} className="flex h-11 items-center rounded-md bg-surface-muted px-4 text-small font-semibold hover:bg-surface-sunken">{s.name}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Zero results (SRC-007): the term, popular searches, and the six sections. */
export function ZeroResults({ term }: { term: string }) {
  return (
    <PageLayout>
      <EmptyState level={1} icon={<Search className="size-7" aria-hidden="true" />} title={`No results for '${term}'`} description="Check the spelling, or try one of these instead." />
      <Suggestions />
    </PageLayout>
  );
}

/** /search with an empty query (SRC-010): nothing is searched; offer starting points. */
export function SearchPrompt() {
  return (
    <PageLayout>
      <EmptyState level={1} icon={<Search className="size-7" aria-hidden="true" />} title="What are you looking for?" description="Search for products, brands and categories using the search bar." />
      <Suggestions />
    </PageLayout>
  );
}
