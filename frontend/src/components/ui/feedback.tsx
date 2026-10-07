import { AlertTriangle, PackageOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} aria-label={label || undefined} className={cn('inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
  );
}

/** Placeholder block shown while content loads (GLB-002). Same size as the content it replaces. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md bg-surface-sunken bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.6),transparent)] bg-[length:400px_100%] bg-no-repeat animate-shimmer', className)}
    />
  );
}

export function EmptyState({ title, description, action, icon, className, level = 2 }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className={cn('mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-14 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-muted text-ink-muted">{icon ?? <PackageOpen className="size-7" aria-hidden="true" />}</div>
      <Heading className="text-h3 font-semibold">{title}</Heading>
      {description && <p className="text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>
      <p className="text-h4 font-semibold">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="h-11 rounded-md border border-line-strong bg-surface px-5 font-semibold hover:border-ink">
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline field or form message from the API catalogue (GLB-003). */
export function InlineMessage({ tone = 'danger', children, className }: { tone?: 'danger' | 'success' | 'info' | 'warning'; children: ReactNode; className?: string }) {
  const tones = {
    danger: 'bg-danger-soft text-danger border-danger/20',
    success: 'bg-success-soft text-success border-success/20',
    info: 'bg-info-soft text-info border-info/20',
    warning: 'bg-warning-soft text-warning border-warning/25',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2.5 text-small font-medium', tones[tone], className)}>
      {children}
    </div>
  );
}
