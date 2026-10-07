import { Accordion } from 'radix-ui';
import { ChevronDown, Menu } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { NavNode } from '../../lib/query';
import { IconButton } from '../ui/button';
import { Sheet } from '../ui/overlay';

/** Slide-out menu below 1024 px (NAV-006): Section → Category → Subcategory; traps and restores focus. */
export function MobileDrawer({ sections }: { sections: NavNode[] }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return (
    <>
      <IconButton ref={opener} label="Open menu" onClick={() => setOpen(true)} className="lg:hidden" aria-expanded={open} aria-haspopup="dialog">
        <Menu className="size-6" aria-hidden="true" />
      </IconButton>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" side="left" className="lg:hidden" returnFocusRef={opener}>
        <Accordion.Root type="single" collapsible className="-mx-5">
          {sections.map((s) => (
            <Accordion.Item key={s.id} value={s.id} className="border-b border-line">
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between px-5 py-4 text-left font-bold uppercase tracking-[0.06em]">
                  {s.name}
                  <ChevronDown className="size-5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="bg-surface-muted/60 pb-2">
                <Link to={s.href} onClick={close} className="block px-5 py-2.5 text-small font-semibold text-brand">Shop all {s.name}</Link>
                <Accordion.Root type="single" collapsible>
                  {s.children.map((c) => (
                    <Accordion.Item key={c.id} value={c.id}>
                      <Accordion.Header>
                        <Accordion.Trigger className="group flex w-full items-center justify-between px-5 py-2.5 text-left text-body font-semibold">
                          {c.name}
                          <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                        </Accordion.Trigger>
                      </Accordion.Header>
                      <Accordion.Content>
                        <ul className="pb-2 pl-8">
                          <li><Link to={c.href} onClick={close} className="block py-2 text-small font-semibold text-ink">All {c.name}</Link></li>
                          {c.children.map((sub) => (
                            <li key={sub.id}><Link to={sub.href} onClick={close} className="block py-2 text-small text-ink-soft">{sub.name}</Link></li>
                          ))}
                        </ul>
                      </Accordion.Content>
                    </Accordion.Item>
                  ))}
                </Accordion.Root>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </Sheet>
    </>
  );
}
