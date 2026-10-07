import { useEffect } from 'react';
import { useLocation, useMatches } from 'react-router';

export interface RouteHandle {
  /** Page title from the route's loader data (FE-007). */
  title?: (data: unknown) => string;
}

const BRAND = 'Wardrobe & Co.';

/** Sets a unique document title and a canonical link for every route (FE-007). */
export function Seo() {
  const matches = useMatches();
  const location = useLocation();
  useEffect(() => {
    // The deepest route that can build a title from its data. A route whose loader failed has no data,
    // so its handler may throw; errors fall back to the generic title (the error page sets its own).
    let title: string | null = null;
    let failed = false;
    for (const m of [...matches].reverse()) {
      const fn = (m.handle as RouteHandle | undefined)?.title;
      if (!fn) continue;
      try {
        title = fn(m.data);
      } catch {
        failed = true; // the route's error element sets the title (see NotFound / RouteError)
      }
      break;
    }
    if (!failed) document.title = title ? `${title} – ${BRAND}` : `${BRAND} — Fashion, beauty & home`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = `${window.location.origin}${location.pathname}`;
  }, [matches, location.pathname]);
  return null;
}

/** Sets the document title from an error element, where route handles have no data. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} – ${BRAND}`;
  }, [title]);
}
