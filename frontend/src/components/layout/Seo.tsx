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
    const match = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title);
    const title = match ? (match.handle as RouteHandle).title!(match.data) : null;
    document.title = title ? `${title} – ${BRAND}` : `${BRAND} — Fashion, beauty & home`;
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
