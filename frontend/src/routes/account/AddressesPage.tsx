import { ChevronLeft, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AddressSummary } from '../../components/address/AddressCard';
import { AddressDialog } from '../../components/address/AddressFlow';
import { Button, ConfirmDialog, EmptyState, ErrorState, InlineMessage, PageLayout, Skeleton } from '../../components/ui';
import { toast } from '../../components/ui/toast';
import { addressAction, useAddresses, type Address } from '../../features/address';
import { errorMessage } from '../../lib/api-client';

/** Saved Addresses (ADDR-005, ADDR-006, ADDR-009). */
export function AddressesPage() {
  const q = useAddresses();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const atLimit = !!q.data?.atLimit;
  return (
    <PageLayout narrow>
      <Link to="/account" className="mb-3 inline-flex min-h-9 items-center gap-1 text-small font-semibold text-ink-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden="true" />My account</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h2 font-bold md:text-h1">Saved Addresses</h1>
        <Button onClick={() => (atLimit ? toast({ title: 'You can save up to 10 addresses. Delete one to add another.' }) : setEditing('new'))}><Plus className="size-4" aria-hidden="true" />Add address</Button>
      </div>
      {atLimit && <InlineMessage tone="info" className="mb-4">You can save up to 10 addresses. Delete one to add another.</InlineMessage>}
      {q.isError && !q.data ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : !q.data ? (
        <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}</div>
      ) : q.data.items.length === 0 ? (
        <EmptyState icon={<MapPin className="size-7" aria-hidden="true" />} title="No saved addresses" description="Add an address to see delivery dates and check out faster." action={<Button onClick={() => setEditing('new')}>Add address</Button>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((a) => (
            <li key={a.id} className="rounded-lg border border-line bg-surface p-4" aria-label={`${a.label} address, ${a.oneLine}`}>
              <AddressSummary a={a} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(a)} disabled={busy}><Pencil className="size-4" aria-hidden="true" />Edit</Button>
                {!a.isDefault && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => addressAction(`/me/addresses/${a.id}/default`, 'POST'))}><Star className="size-4" aria-hidden="true" />Set as default</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleting(a)}><Trash2 className="size-4" aria-hidden="true" />Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <AddressDialog open onOpenChange={(o) => !o && setEditing(null)} address={editing === 'new' ? undefined : editing} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this address?"
        description={deleting?.isDefault ? 'This is your default address. Your most recently added address will become the default.' : 'Orders already placed keep their delivery address.'}
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onConfirm={() => void run(async () => {
          await addressAction(`/me/addresses/${deleting!.id}`, 'DELETE');
          setDeleting(null);
          toast({ title: 'Address deleted' });
        })}
      />
    </PageLayout>
  );
}
