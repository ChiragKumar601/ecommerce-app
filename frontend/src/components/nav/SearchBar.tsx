import { Clock, Search, TrendingUp, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { addRecentSearch, clearRecentSearches, SUGGEST_MAX, SUGGEST_MIN_CHARS, useDebounced, useRecentSearches, useSuggestions } from '../../features/search';
import { SITE_FALLBACK, useSite } from '../../features/site';
import { cn } from '../../lib/cn';
import { IconButton } from '../ui/button';

type Option = { key: string; href: string; term?: string; group: string; content: ReactNode };

/**
 * Header search with suggestions (NAV-008, SRC-001…002, SRC-005), as an ARIA combobox.
 * - Empty input + focus: up to 5 recent and 5 popular searches.
 * - ≥ 2 characters, 250 ms after typing stops: matching recent searches, categories, brands,
 *   products, popular searches; at most 8.
 * - Enter: the active suggestion, or /search?q=… for the typed text.
 */
export function SearchBar({ className, autoFocus, onSubmitted, inline }: { className?: string; autoFocus?: boolean; onSubmitted?: () => void; inline?: boolean }) {
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const recent = useRecentSearches();
  const popularAll = (useSite().data ?? SITE_FALLBACK).popularSearches;
  const term = value.trim();
  const debounced = useDebounced(term, 250);
  const typing = [...term].length >= SUGGEST_MIN_CHARS;
  const suggest = useSuggestions(typing ? debounced : '');

  const options: Option[] = useMemo(() => {
    const opt = (group: string, key: string, href: string, content: ReactNode, t?: string): Option => ({ group, key, href, content, term: t });
    const searchHref = (t: string) => `/search?q=${encodeURIComponent(t)}`;
    if (!term) {
      return [
        ...recent.slice(0, 5).map((r) => opt('Recent searches', `r:${r}`, searchHref(r), <><Clock className="size-4 text-ink-muted" aria-hidden="true" />{r}</>, r)),
        ...popularAll.slice(0, 5).map((p) => opt('Popular searches', `p:${p}`, searchHref(p), <><TrendingUp className="size-4 text-ink-muted" aria-hidden="true" />{p}</>, p)),
      ];
    }
    if (!typing) return [];
    const lower = term.toLowerCase();
    const out: Option[] = recent
      .filter((r) => r.toLowerCase().includes(lower))
      .slice(0, 3)
      .map((r) => opt('Recent searches', `r:${r}`, searchHref(r), <><Clock className="size-4 text-ink-muted" aria-hidden="true" />{r}</>, r));
    const s = suggest.data;
    if (s) {
      out.push(...s.categories.map((c) => opt('Categories', `c:${c.href}`, c.href, <span className="flex flex-col"><span>{c.label}</span>{c.context && <span className="text-caption text-ink-muted">in {c.context}</span>}</span>)));
      out.push(...s.brands.map((b) => opt('Brands', `b:${b.href}`, b.href, <span>{b.label} <span className="text-caption text-ink-muted">· Brand</span></span>, b.label)));
      out.push(...s.products.map((p) => opt('Products', `pr:${p.href}`, p.href, (
        <span className="flex items-center gap-3">
          {p.image ? <img src={p.image} alt="" width={36} height={48} className="h-12 w-9 shrink-0 rounded-xs bg-surface-muted object-cover" /> : null}
          <span className="flex min-w-0 flex-col"><span className="truncate">{p.label}</span><span className="text-caption text-ink-muted">{p.brand} · {p.price}</span></span>
        </span>
      ))));
      const seen = new Set(out.filter((o) => o.term).map((o) => o.term!.toLowerCase()));
      out.push(...s.popular.filter((p) => !seen.has(p.toLowerCase())).map((p) => opt('Popular searches', `p:${p}`, searchHref(p), <><TrendingUp className="size-4 text-ink-muted" aria-hidden="true" />{p}</>, p)));
    }
    return out.slice(0, SUGGEST_MAX);
  }, [term, typing, recent, popularAll, suggest.data]);

  const showPanel = open && (options.length > 0 || (typing && !suggest.isFetching && !!suggest.data));
  const go = (o: Option) => {
    if (o.term && o.href.startsWith('/search')) addRecentSearch(o.term);
    setOpen(false);
    setActive(-1);
    if (o.term) setValue(o.term);
    onSubmitted?.();
    void navigate(o.href);
  };
  const submit = () => {
    const q = term.slice(0, 100);
    if (!q) return;
    addRecentSearch(q);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    onSubmitted?.();
    void navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const groups: { name: string; items: { o: Option; i: number }[] }[] = [];
  options.forEach((o, i) => {
    const g = groups.at(-1);
    if (g && g.name === o.group) g.items.push({ o, i });
    else groups.push({ name: o.group, items: [{ o, i }] });
  });

  return (
    <div className={cn('relative w-full', className)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && options[active]) go(options[active]);
          else submit();
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">Search for products, brands and more</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-o${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={100}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (options.length ? (a + 1) % options.length : -1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (options.length ? (a <= 0 ? options.length - 1 : a - 1) : -1));
            } else if (e.key === 'Escape') {
              if (open) {
                // Close the list only; don't let the browser also clear the search field.
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setActive(-1);
              }
            }
          }}
          placeholder="Search for products, brands and more"
          className="h-11 w-full rounded-md border border-transparent bg-surface-muted pl-10 pr-4 text-small text-ink placeholder:text-ink-muted transition-colors hover:border-line-strong focus-visible:border-ink focus-visible:bg-surface [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {showPanel && (
        <div
          className={cn(
            'z-50 overflow-y-auto bg-surface',
            inline ? 'mt-2' : 'absolute inset-x-0 top-[calc(100%+0.5rem)] max-h-[min(32rem,70dvh)] rounded-lg border border-line shadow-3 animate-fade-in',
          )}
        >
          <ul id={listId} role="listbox" aria-label="Search suggestions" className="py-2">
            {groups.map((g) => (
              <li key={g.name} role="presentation">
                <div className="flex items-center justify-between px-4 pb-1 pt-3 text-caption font-bold uppercase tracking-wider text-ink-muted" role="presentation">
                  {g.name}
                  {g.name === 'Recent searches' && !term && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => clearRecentSearches()}
                      className="min-h-8 normal-case tracking-normal text-brand hover:underline"
                    >
                      Clear recent searches
                    </button>
                  )}
                </div>
                <ul role="group" aria-label={g.name}>
                  {g.items.map(({ o, i }) => (
                    <li
                      key={o.key}
                      id={`${listId}-o${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(o)}
                      onMouseEnter={() => setActive(i)}
                      className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-4 py-1.5 text-small text-ink', i === active && 'bg-surface-muted')}
                    >
                      {o.content}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {options.length === 0 && typing && (
              <li role="presentation" className="px-4 py-3 text-small text-ink-muted">
                No suggestions. Press Enter to search for “{term}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
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
          <div className="flex items-start gap-2 overflow-y-auto border-b border-line p-3">
            <SearchBar autoFocus inline onSubmitted={() => setOpen(false)} />
            <IconButton label="Close search" onClick={() => setOpen(false)}><X className="size-5" aria-hidden="true" /></IconButton>
          </div>
        </div>
      )}
    </>
  );
}
