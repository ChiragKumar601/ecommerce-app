import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useAddresses, type Address } from '../../features/address';
import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/feedback';
import { Dialog } from '../ui/overlay';
import { AddressSummary } from './AddressCard';
import { AddressDialog } from './AddressFlow';

/**
 * Choose a delivery address, or add one (BAG-010 "Change", ADDR-008). With `onlyServiceable`,
 * unserviceable addresses are shown but can't be chosen (CHK-004).
 */
export function AddressPicker({ open, onOpenChange, selectedId, onSelect, onlyServiceable }: { open: boolean; onOpenChange: (o: boolean) => void; selectedId: string | null; onSelect: (a: Address) => void; onlyServiceable?: boolean }) {
  const q = useAddresses();
  const [adding, setAdding] = useState(false);
  if (adding) {
    return <AddressDialog open onOpenChange={(o) => { if (!o) setAdding(false); }} onSaved={(a) => { setAdding(false); if (!onlyServiceable || a.serviceable) onSelect(a); }} />;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Choose a delivery address" className="max-w-xl"
      footer={<Button variant="secondary" onClick={() => setAdding(true)} disabled={q.data?.atLimit}><Plus className="size-4" aria-hidden="true" />Add new address</Button>}>
      {!q.data ? <Skeleton className="h-32 w-full" /> : q.data.items.length === 0 ? <p className="text-ink-muted">You haven't saved any addresses yet.</p> : (
        <ul className="flex flex-col gap-3" role="radiogroup" aria-label="Saved addresses">
          {q.data.items.map((a) => {
            const disabled = onlyServiceable && !a.serviceable;
            const on = a.id === selectedId;
            return (
              <li key={a.id}>
                <button type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onSelect(a)}
                  className={cn('w-full rounded-lg border p-4 text-left transition-colors', on ? 'border-ink bg-surface shadow-1' : 'border-line hover:border-ink-muted', disabled && 'cursor-not-allowed opacity-60 hover:border-line')}>
                  <AddressSummary a={a} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
