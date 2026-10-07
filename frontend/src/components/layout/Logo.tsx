import { Link } from 'react-router';

/**
 * Wordmark logo; always links to the landing page (NAV-001). Below 400 px a compact "W&Co."
 * mark keeps the header within the width while touch targets stay 44 px (FE-001, FE-004).
 */
export function Logo({ name = 'Wardrobe & Co.' }: { name?: string }) {
  const [first, ...rest] = name.split(' ');
  const initials = `${first?.[0] ?? ''}&${rest.filter((w) => w !== '&').join(' ')}`;
  return (
    <Link to="/" aria-label={`${name} — home`} className="group inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap rounded-sm">
      <span className="hidden items-baseline gap-1 min-[400px]:inline-flex" aria-hidden="true">
        <span className="text-h4 font-extrabold tracking-tight text-ink sm:text-h3">{first}</span>
        <span className="text-h4 font-light tracking-tight text-brand sm:text-h3">{rest.join(' ')}</span>
      </span>
      <span className="inline-flex items-baseline min-[400px]:hidden" aria-hidden="true">
        <span className="text-h4 font-extrabold tracking-tight text-ink">{initials.split('&')[0]}</span>
        <span className="text-h4 font-light text-brand">&amp;{initials.split('&')[1]}</span>
      </span>
    </Link>
  );
}
