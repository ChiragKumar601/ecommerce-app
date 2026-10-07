import { useQuery } from '@tanstack/react-query';
import { Outlet, ScrollRestoration } from 'react-router';
import { api } from '../../lib/api-client';
import { qk, type SiteInfo } from '../../lib/query';
import { Toaster } from '../ui';
import { DemoBanner } from './DemoBanner';
import { Logo } from './Logo';
import { Seo } from './Seo';

const FALLBACK: SiteInfo = { brandName: 'Wardrobe & Co.', demoBanner: 'Demo store — for showcase only. No real orders, payments or deliveries.' };

/** App shell (S4.3b): demo banner, header, page, footer. Header and footer grow in Stage 5. */
export function RootLayout() {
  const site = useQuery({ queryKey: qk.site, queryFn: () => api<SiteInfo>('/site'), staleTime: 5 * 60_000 });
  const info = site.data ?? FALLBACK;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-2">
        Skip to content
      </a>
      <Seo />
      <DemoBanner text={info.demoBanner} />
      <header className="sticky top-0 z-[40] border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="container-page flex h-16 items-center">
          <Logo name={info.brandName} />
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="container-page py-8 text-small text-ink-muted">© 2026 {info.brandName} · Demo store</div>
      </footer>
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}
