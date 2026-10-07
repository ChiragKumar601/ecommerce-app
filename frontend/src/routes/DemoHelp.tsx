import { useQuery } from '@tanstack/react-query';
import { Copy, CreditCard, Gift, Image as ImageIcon, RotateCcw, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, Button, ErrorState, PageHeader, PageLayout, Skeleton } from '../components/ui';
import { toast } from '../components/ui/toast';
import { demoHelpQuery } from '../features/account';
import { errorMessage } from '../lib/api-client';

function Block({ id, icon, title, note, children }: { id: string; icon: ReactNode; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 id={id} className="flex items-center gap-2 text-h3 font-semibold">{icon}{title}</h2>
      {note && <p className="mt-1 text-small text-ink-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => void navigator.clipboard?.writeText(value.replace(/\s/g, '')).then(() => toast({ title: 'Copied', description: value, durationMs: 1500 }), () => undefined)}
      className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
    >
      <Copy className="size-4" aria-hidden="true" />
    </button>
  );
}

const CREDITS_SHOWN = 60;

/** Demo guide (spec §10.1; DAT-006, DAT-007, RET-006) plus image credits for every product photo (OD-7, OD-11, D-22). */
export function DemoHelpPage() {
  const q = useQuery(demoHelpQuery);
  const [allCredits, setAllCredits] = useState(false);
  if (q.isError) return <PageLayout><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></PageLayout>;
  const d = q.data;
  return (
    <PageLayout narrow>
      <PageHeader eyebrow={<Badge tone="brand" size="md">Demo store</Badge>} title="Demo help" subtitle="Everything you need to try checkout, payments, delivery and returns. Nothing here is real: no money moves and nothing ships." />
      {!d ? <Skeleton className="h-96 w-full rounded-xl" /> : (
        <>
          <Block id="cards" icon={<CreditCard className="size-5" aria-hidden="true" />} title="Test cards" note={d.cardNote}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-small">
                <thead><tr className="border-b border-line text-left text-ink-muted"><th scope="col" className="py-2 pr-3 font-semibold">Card number</th><th scope="col" className="py-2 pr-3 font-semibold">Bank · type</th><th scope="col" className="py-2 font-semibold">Outcome</th></tr></thead>
                <tbody>
                  {d.cards.map((c) => (
                    <tr key={c.number} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-3"><span className="tabular inline-flex items-center gap-1 font-mono font-semibold">{c.number}<CopyButton value={c.number} label={`card ${c.number}`} /></span></td>
                      <td className="py-1.5 pr-3">{c.bank} · {c.network} {c.type}</td>
                      <td className="py-1.5">{c.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-caption text-ink-muted">HDFC Bank cards get the bank offer on eligible items.</p>
          </Block>
          <Block id="upi" icon={<Smartphone className="size-5" aria-hidden="true" />} title="Test UPI IDs" note={d.upiNote}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.upi.map((u) => (
                <li key={u.upiId} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-1.5 text-small">
                  <span><span className="font-mono font-semibold">{u.upiId}</span> <span className="text-ink-muted">· {u.outcome}</span></span>
                  <CopyButton value={u.upiId} label={u.upiId} />
                </li>
              ))}
            </ul>
          </Block>
          <Block id="gift" icon={<Gift className="size-5" aria-hidden="true" />} title="Gift card codes" note="Redeem in Account → Gift Cards, or at payment. Each code works once per account.">
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.giftCards.map((g) => (
                <li key={g.code} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-1.5 text-small">
                  <span><span className="font-mono font-semibold">{g.code}</span> <span className="text-ink-muted">· {g.value.display}, valid {g.validity}</span></span>
                  <CopyButton value={g.code} label={g.code} />
                </li>
              ))}
            </ul>
          </Block>
          <Block id="returns" icon={<RotateCcw className="size-5" aria-hidden="true" />} title="Return test tags" note="Add one of these to the return comment to force the outcome.">
            <ul className="flex flex-col gap-2 text-small">
              {d.returnTags.map((r) => <li key={r.tag}><code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-bold">{r.tag}</code> — {r.effect}</li>)}
            </ul>
            <p className="mt-3 text-small text-ink-muted">Orders move forward on their own every couple of minutes. When an order is Out for Delivery, use the Delivery simulator on the order page with the OTP shown there.</p>
          </Block>
          <Block id="credits" icon={<ImageIcon className="size-5" aria-hidden="true" />} title="Image credits" note={`Product photos come from Wikimedia Commons and Openverse under licences that allow reuse. ${d.imageCredits.length} images are used.`}>
            <ul className="grid gap-x-6 gap-y-1.5 text-caption sm:grid-cols-2">
              {(allCredits ? d.imageCredits : d.imageCredits.slice(0, CREDITS_SHOWN)).map((c) => (
                <li key={c.url} className="truncate">
                  <a href={c.source} target="_blank" rel="noreferrer noopener" className="underline-offset-2 hover:underline">{c.author || 'Unknown author'}</a>
                  <span className="text-ink-muted"> · {c.licence} · {c.provider}</span>
                </li>
              ))}
            </ul>
            {!allCredits && d.imageCredits.length > CREDITS_SHOWN && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => setAllCredits(true)}>Show all {d.imageCredits.length} credits</Button>
            )}
          </Block>
        </>
      )}
    </PageLayout>
  );
}
