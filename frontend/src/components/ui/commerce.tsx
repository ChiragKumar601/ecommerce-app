import { Check, Minus, Plus, Star } from 'lucide-react';
import type { Money } from '@app/shared';
import { cn } from '../../lib/cn';
import { compactCount } from '../../lib/format';

/** Selling price, struck-through MRP and "(d% OFF)" when discounted (PLP-012, PDP-002). */
export function PriceTag({ price, mrp, discountPercent, size = 'md', className }: { price: Money; mrp?: Money; discountPercent?: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const discounted = mrp && mrp.paise > price.paise && (discountPercent ?? 0) > 0;
  const sizes = { sm: 'text-small', md: 'text-body', lg: 'text-h2' };
  return (
    <p className={cn('tabular flex flex-wrap items-baseline gap-x-1.5', sizes[size], className)}>
      <span className="font-bold text-ink">{price.display}</span>
      {discounted && (
        <>
          <span className="sr-only">, was </span>
          <s className={cn('text-ink-muted', size === 'lg' ? 'text-h4 font-normal' : 'text-caption')}>{mrp.display}</s>
          <span className={cn('font-semibold text-sale', size === 'lg' ? 'text-h4' : 'text-caption')}>({discountPercent}% OFF)</span>
        </>
      )}
    </p>
  );
}

/** "4.3 ★ | 1.2k" (PLP-011). Hidden by callers when there are no visible reviews (PLP-013). */
export function RatingBadge({ average, count, className }: { average: number; count: number; className?: string }) {
  return (
    <span className={cn('tabular inline-flex items-center gap-1 rounded-sm bg-surface/95 px-1.5 py-0.5 text-caption font-semibold text-ink shadow-1', className)} aria-label={`Rated ${average.toFixed(1)} out of 5 by ${count} customers`}>
      {average.toFixed(1)}
      <Star className="size-3 fill-success text-success" aria-hidden="true" />
      <span className="text-ink-muted" aria-hidden="true">| {compactCount(count)}</span>
    </span>
  );
}

export function QuantityStepper({ value, min = 1, max, onChange, disabled, label = 'Quantity' }: { value: number; min?: number; max: number; onChange: (v: number) => void; disabled?: boolean; label?: string }) {
  return (
    <div className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className="flex size-10 items-center justify-center rounded-l-md hover:bg-surface-muted disabled:opacity-40">
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="tabular w-8 text-center font-semibold" aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className="flex size-10 items-center justify-center rounded-r-md hover:bg-surface-muted disabled:opacity-40">
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Checkout step indicator (CHK-001). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4" aria-label="Checkout progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-2 sm:gap-4" aria-current={active ? 'step' : undefined}>
            <span className={cn('flex size-7 items-center justify-center rounded-full text-caption font-bold', done && 'bg-success text-white', active && 'bg-ink text-white', !done && !active && 'border border-line-strong text-ink-muted')}>
              {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className={cn('text-small font-semibold', active ? 'text-ink' : 'text-ink-muted', 'hidden sm:inline')}>{s}</span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-line-strong sm:w-12" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
