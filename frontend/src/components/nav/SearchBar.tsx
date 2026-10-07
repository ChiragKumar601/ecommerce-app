import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { Form, useSearchParams } from 'react-router';
import { cn } from '../../lib/cn';
import { IconButton } from '../ui';

/**
 * Header search (NAV-008, SRC-005): always visible on desktop; a full-screen overlay on mobile.
 * Pressing Enter goes to /search?q=… Live suggestions arrive in Stage 8.
 */
export function SearchBar({ className, autoFocus, onSubmitted }: { className?: string; autoFocus?: boolean; onSubmitted?: () => void }) {
  const [params] = useSearchParams();
  return (
    <Form action="/search" method="get" role="search" className={cn('relative w-full', className)} onSubmit={(e) => {
      const q = (new FormData(e.currentTarget).get('q') as string | null)?.trim();
      if (!q) e.preventDefault();
      else onSubmitted?.();
    }}>
      <label htmlFor="header-search" className="sr-only">Search for products, brands and more</label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
      <input
        id="header-search"
        name="q"
        type="search"
        autoFocus={autoFocus}
        maxLength={100}
        defaultValue={params.get('q') ?? ''}
        placeholder="Search for products, brands and more"
        className="h-11 w-full rounded-md border border-transparent bg-surface-muted pl-10 pr-4 text-small text-ink placeholder:text-ink-muted transition-colors hover:border-line-strong focus-visible:border-ink focus-visible:bg-surface"
      />
    </Form>
  );
}

/** Mobile search: icon that opens a full-screen search overlay (NAV-008). */
export function MobileSearch() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Search" onClick={() => setOpen(true)} className="lg:hidden">
        <Search className="size-5.5" aria-hidden="true" />
      </IconButton>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-[60] flex flex-col bg-surface animate-fade-in lg:hidden"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div className="flex items-center gap-2 border-b border-line p-3">
            <SearchBar autoFocus onSubmitted={() => setOpen(false)} />
            <IconButton label="Close search" onClick={() => setOpen(false)}><X className="size-5" aria-hidden="true" /></IconButton>
          </div>
        </div>
      )}
    </>
  );
}
