import { BadgeCheck, RotateCcw, Truck } from 'lucide-react';
import { Link } from 'react-router';
import type { SiteInfo } from '../../lib/query';

const TRUST_ICONS = [BadgeCheck, RotateCcw, Truck];

/** Footer in the LND-007 order: links + trust → popular searches → company → how we make shopping easy → social. */
export function Footer({ site }: { site: SiteInfo }) {
  const f = site.footer;
  const linkClass = 'text-small text-ink-soft transition-colors hover:text-ink hover:underline';
  return (
    <footer className="mt-12 border-t border-line bg-surface" aria-label="Footer">
      <div className="container-page py-10">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr_2fr]">
          <div>
            <h2 className="mb-3 text-caption font-bold uppercase tracking-[0.1em] text-ink">Useful links</h2>
            <ul className="space-y-2">{f.usefulLinks?.map((l) => <li key={l.href}><Link to={l.href} className={linkClass}>{l.label}</Link></li>)}</ul>
          </div>
          <div>
            <h2 className="mb-3 text-caption font-bold uppercase tracking-[0.1em] text-ink">Policies</h2>
            <ul className="space-y-2">{f.policyLinks?.map((l) => <li key={l.href}><Link to={l.href} className={linkClass}>{l.label}</Link></li>)}</ul>
          </div>
          <ul className="grid gap-4 sm:grid-cols-3" aria-label="Our promises">
            {f.trustPointers?.map((t, i) => {
              const Icon = TRUST_ICONS[i % TRUST_ICONS.length]!;
              return (
                <li key={t.title} className="flex gap-3 rounded-lg bg-surface-muted p-4">
                  <Icon className="size-6 shrink-0 text-brand" aria-hidden="true" />
                  <div><p className="text-small font-bold">{t.title}</p><p className="mt-0.5 text-caption text-ink-muted">{t.text}</p></div>
                </li>
              );
            })}
          </ul>
        </div>

        {site.popularSearches.length > 0 && (
          <div className="mt-10 border-t border-line pt-8">
            <h2 className="mb-3 text-caption font-bold uppercase tracking-[0.1em] text-ink">Popular searches</h2>
            <p className="text-small leading-7 text-ink-muted">
              {site.popularSearches.map((term, i) => (
                <span key={term}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  <Link to={`/search?q=${encodeURIComponent(term)}`} className="hover:text-ink hover:underline">{term}</Link>
                </span>
              ))}
            </p>
          </div>
        )}

        <div className="mt-8 border-t border-line pt-8">
          <h2 className="mb-2 text-caption font-bold uppercase tracking-[0.1em] text-ink">Registered office <span className="font-semibold normal-case tracking-normal text-ink-muted">· Sample details</span></h2>
          <address className="text-small not-italic leading-6 text-ink-muted">
            {site.company.legalName && <span className="block">{site.company.legalName}</span>}
            {site.company.registeredAddress && <span className="block">{site.company.registeredAddress}</span>}
            {site.company.telephone && <span className="block">Telephone: {site.company.telephone}</span>}
            {site.company.cin && <span className="block">CIN: {site.company.cin}</span>}
          </address>
        </div>

        {f.howWeMakeShoppingEasy && (
          <div className="mt-8 border-t border-line pt-8">
            <h2 className="mb-4 text-h4 font-bold">How we make shopping easy</h2>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {f.howWeMakeShoppingEasy.map((b) => (
                <li key={b.title}><p className="font-semibold">{b.title}</p><p className="mt-1 text-small text-ink-muted">{b.text}</p></li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="text-caption text-ink-muted">© 2026 {site.brandName} · Demo store</p>
          <ul className="flex gap-4" aria-label="Social media">
            {f.social?.map((s) => <li key={s.label}><a href={s.href} target="_blank" rel="noopener noreferrer" className={linkClass}>{s.label}</a></li>)}
          </ul>
        </div>
      </div>
    </footer>
  );
}
