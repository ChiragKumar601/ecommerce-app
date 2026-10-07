import { Link } from 'react-router';

/** Wordmark logo; always links to the landing page (NAV-001). */
export function Logo({ name = 'Wardrobe & Co.' }: { name?: string }) {
  const [first, ...rest] = name.split(' ');
  return (
    <Link to="/" aria-label={`${name} — home`} className="group inline-flex items-baseline gap-1 rounded-sm">
      <span className="text-h3 font-extrabold tracking-tight text-ink">{first}</span>
      <span className="text-h3 font-light tracking-tight text-brand">{rest.join(' ')}</span>
    </Link>
  );
}
