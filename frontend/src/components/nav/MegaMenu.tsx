import { ArrowRight } from 'lucide-react';
import { NavigationMenu } from 'radix-ui';
import { Link } from 'react-router';
import type { NavNode } from '../../lib/query';

/**
 * Desktop mega menu (NAV-005): opens on hover or keyboard focus, closes on Escape or when the
 * pointer or focus leaves. Built from the catalogue tree, so data changes need no UI changes (NAV-007).
 */
export function MegaMenu({ sections }: { sections: NavNode[] }) {
  return (
    <NavigationMenu.Root delayDuration={120} skipDelayDuration={300} className="hidden h-full lg:flex" aria-label="Shop by section">
      <NavigationMenu.List className="flex h-full items-stretch">
        {sections.map((s) => (
          <NavigationMenu.Item key={s.id} className="flex">
            <NavigationMenu.Trigger className="group relative flex items-center px-3 text-small font-bold uppercase tracking-[0.06em] text-ink transition-colors hover:text-brand data-[state=open]:text-brand xl:px-4">
              {s.name}
              <span className="absolute inset-x-3 bottom-0 h-0.5 scale-x-0 bg-brand transition-transform duration-200 group-data-[state=open]:scale-x-100 xl:inset-x-4" aria-hidden="true" />
            </NavigationMenu.Trigger>
            <NavigationMenu.Content className="absolute left-0 top-0 w-full data-[motion]:animate-fade-in">
              <div className="container-page py-6">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-h4 font-semibold">{s.name}</p>
                  <NavigationMenu.Link asChild>
                    <Link to={s.href} className="inline-flex items-center gap-1.5 text-small font-semibold text-brand hover:underline">
                      Shop all {s.name} <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </NavigationMenu.Link>
                </div>
                <div className="columns-2 gap-8 md:columns-4 xl:columns-5">
                  {s.children.map((c) => (
                    <div key={c.id} className="mb-6 break-inside-avoid">
                      <NavigationMenu.Link asChild>
                        <Link to={c.href} className="text-small font-bold text-brand hover:underline">{c.name}</Link>
                      </NavigationMenu.Link>
                      <ul className="mt-2 space-y-1.5">
                        {c.children.map((sub) => (
                          <li key={sub.id}>
                            <NavigationMenu.Link asChild>
                              <Link to={sub.href} className="text-small text-ink-soft transition-colors hover:text-ink hover:underline">{sub.name}</Link>
                            </NavigationMenu.Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        ))}
      </NavigationMenu.List>
      {/* Positioned against the sticky <header>, so the panel always starts right under it. */}
      <div className="absolute inset-x-0 top-full z-[39] flex justify-center">
        <NavigationMenu.Viewport className="relative h-[min(var(--radix-navigation-menu-viewport-height),70vh)] w-full overflow-y-auto border-b border-line bg-surface shadow-2 transition-[height] duration-200 ease-standard data-[state=closed]:hidden" />
      </div>
    </NavigationMenu.Root>
  );
}
