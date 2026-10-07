import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full font-semibold leading-none', {
  variants: {
    tone: {
      neutral: 'bg-surface-muted text-ink-soft',
      brand: 'bg-brand-soft text-brand',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      info: 'bg-info-soft text-info',
      solid: 'bg-ink text-white',
      outline: 'border border-line-strong bg-surface text-ink',
    },
    size: { sm: 'px-2 py-1 text-caption', md: 'px-2.5 py-1.5 text-small' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});

export function Badge({ className, tone, size, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/** Removable filter chip (PLP-006). */
export function Chip({ children, onRemove, removeLabel }: { children: ReactNode; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-surface pl-3 pr-1 text-small font-medium">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel ?? `Remove ${String(children)}`} className="flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
