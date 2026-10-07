import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';

/** Shared page frame: consistent gutters and vertical rhythm on every route (plan §8.5). */
export function PageLayout({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn('container-page py-6 md:py-8', narrow && 'max-w-3xl', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-h2 font-bold md:text-h1">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={cn('py-8 md:py-12', className)} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {title && (
        <div className="mb-5 flex items-end justify-between gap-4 md:mb-7">
          <h2 id={id ? `${id}-title` : undefined} className="text-h2 font-bold tracking-tight md:text-h1">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-small text-ink-muted">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
            {it.to && i < items.length - 1 ? (
              <Link to={it.to} className="hover:text-ink hover:underline">{it.label}</Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined} className={i === items.length - 1 ? 'font-medium text-ink' : undefined}>{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
