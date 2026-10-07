import type { ReactNode } from 'react';
import type { Address } from '../../features/address';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/badge';

/** One address, as shown on Saved Addresses, in the bag picker and at checkout. */
export function AddressSummary({ a, children, className }: { a: Address; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 text-small', className)}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-body">{a.recipientName}</span>
        <Badge tone="outline">{a.label}</Badge>
        {a.isDefault && <Badge tone="solid">Default</Badge>}
        {!a.serviceable && <Badge tone="danger">Not deliverable</Badge>}
      </p>
      <p className="text-ink-soft">{a.oneLine}</p>
      <p className="text-ink-muted">Phone: {a.recipientPhone}</p>
      <p className={cn('font-semibold', a.serviceable ? 'text-success' : 'text-danger')}>{a.delivery.message}</p>
      {children}
    </div>
  );
}
