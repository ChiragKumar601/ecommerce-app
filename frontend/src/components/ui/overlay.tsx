import { X } from 'lucide-react';
import { Dialog as DialogPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

const overlay = 'fixed inset-0 z-[60] bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in';

/** Modal dialog: traps focus, closes on Escape and restores focus (FE-004). */
export function Dialog({ open, onOpenChange, title, description, children, footer, className, trigger }: {
  open?: boolean; onOpenChange?: (open: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; className?: string; trigger?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          className={cn('fixed left-1/2 top-1/2 z-[61] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-surface shadow-3 data-[state=open]:animate-slide-up', className)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <DialogPrimitive.Title className="text-h4 font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-small text-ink-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="-mr-2 -mt-1 flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Close">
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-muted/50 px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirmation step for consequential actions (logout, remove, cancel). */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel = 'Cancel', onConfirm, loading, tone = 'primary' }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; loading?: boolean; tone?: 'primary' | 'danger';
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    />
  );
}

const sheetSide = {
  right: 'inset-y-0 right-0 h-full w-[min(26rem,100vw)] data-[state=open]:animate-slide-in-right',
  left: 'inset-y-0 left-0 h-full w-[min(22rem,88vw)] data-[state=open]:animate-slide-in-left',
  bottom: 'inset-x-0 bottom-0 max-h-[88dvh] w-full rounded-t-xl data-[state=open]:animate-slide-up',
};

/** Side or bottom panel (filters, mobile menu): bottom on mobile, side on desktop (plan §8.5). */
export function Sheet({ open, onOpenChange, title, side = 'right', children, footer, className }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; side?: keyof typeof sheetSide; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content className={cn('fixed z-[61] flex flex-col bg-surface shadow-3', sheetSide[side], className)}>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <DialogPrimitive.Title className="text-h4 font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            <DialogPrimitive.Close className="-mr-2 flex size-10 items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Close">
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <div className="flex gap-3 border-t border-line px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Popover({ trigger, children, align = 'start', className }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align={align} sideOffset={8} className={cn('z-50 w-72 rounded-lg border border-line bg-surface p-4 shadow-2 data-[state=open]:animate-fade-in', className)}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-[80] max-w-xs rounded-md bg-ink px-2.5 py-1.5 text-caption text-white shadow-2 data-[state=delayed-open]:animate-fade-in">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
