import { Heart, ShoppingBag, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useSearchParams } from 'react-router';
import { useSession } from '../../features/session';
import { useBagCount } from '../../features/bag';
import { useNav } from '../../features/site';
import { cn } from '../../lib/cn';
import { Logo } from '../layout/Logo';
import { MegaMenu } from './MegaMenu';
import { MobileDrawer } from './MobileDrawer';
import { MobileSearch, SearchBar } from './SearchBar';

function IconLink({ to, label, icon, badge, dot }: { to: string; label: string; icon: ReactNode; badge?: number; dot?: string }) {
  return (
    <NavLink
      to={to}
      aria-label={badge ? `${label}, ${badge} item${badge === 1 ? '' : 's'}` : dot ? `${label}, ${dot}` : label}
      className={({ isActive }) => cn('relative flex min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1 text-ink transition-colors hover:text-brand', isActive && 'text-brand')}
    >
      <span className="relative">
        {icon}
        {badge ? (
          <span className="tabular absolute -right-2.5 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[0.6875rem] font-bold leading-none text-white ring-2 ring-surface">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : dot ? (
          <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-brand ring-2 ring-surface" aria-hidden="true" />
        ) : null}
      </span>
      <span className="hidden text-[0.6875rem] font-semibold sm:block">{label}</span>
    </NavLink>
  );
}

/** Global header (NAV-001…NAV-008). */
export function Header({ brandName }: { brandName: string }) {
  const nav = useNav();
  const sections = nav.data ?? [];
  const bagCount = useBagCount();
  const session = useSession().data;
  // PRF-007: a dot on Profile when any order has an update the customer hasn't seen.
  const unseen = session?.authenticated && session.hasUnseenOrderUpdates ? 'order updates' : undefined;
  const searchQ = useSearchParams()[0].get('q') ?? '';
  return (
    <header className="sticky top-0 z-[40] border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="container-page flex h-16 items-center gap-2 lg:h-[4.5rem] lg:gap-6">
        <MobileDrawer sections={sections} />
        <Logo name={brandName} />
        <MegaMenu sections={sections} />
        <div className="ml-auto hidden max-w-md flex-1 lg:block">
          {/* Keyed by ?q so the box shows the current search after navigation. */}
          <SearchBar key={searchQ} />
        </div>
        <nav aria-label="Account and bag" className="ml-auto flex items-center gap-0.5 sm:gap-2 lg:ml-0">
          <MobileSearch />
          <IconLink to="/account" label="Profile" icon={<User className="size-5.5" aria-hidden="true" />} dot={unseen} />
          <IconLink to="/wishlist" label="Wishlist" icon={<Heart className="size-5.5" aria-hidden="true" />} />
          <IconLink to="/bag" label="Bag" icon={<ShoppingBag className="size-5.5" aria-hidden="true" />} badge={bagCount} />
        </nav>
      </div>
    </header>
  );
}
