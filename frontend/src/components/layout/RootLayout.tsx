import { Outlet, ScrollRestoration } from 'react-router';
import { SITE_FALLBACK, useSite } from '../../features/site';
import { Footer } from '../nav/Footer';
import { Header } from '../nav/Header';
import { Toaster } from '../ui/toast';
import { DemoBanner } from './DemoBanner';
import { Seo } from './Seo';

/** App shell: demo banner, header, page, footer (GLB-001, NAV-*, LND-007). */
export function RootLayout() {
  const site = useSite().data ?? SITE_FALLBACK;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-2">
        Skip to content
      </a>
      <Seo />
      <DemoBanner text={site.demoBanner} />
      <Header brandName={site.brandName} />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer site={site} />
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}
