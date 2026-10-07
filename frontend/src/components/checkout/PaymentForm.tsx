import type { QuoteChange } from '@app/shared';
import { cardExpirySchema, cardNumberSchema, cvvSchema, isAmex, nameOnCardSchema, upiIdSchema } from '@app/shared';
import { Banknote, CreditCard, Gift, Smartphone, Wallet } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { useCards, useCredits, useGiftCards } from '../../features/account';
import type { QuoteView } from '../../features/bag';
import { changeText } from '../../features/checkout';
import { payLabel, waitForOutcome, type AttemptView, type PayPayment, type QuoteSelection } from '../../features/payment';
import { ApiError, errorMessage, newIdempotencyKey } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { DemoCardWarning, RedeemGiftCardForm } from '../account/forms';
import { Button } from '../ui/button';
import { InlineMessage, Spinner } from '../ui/feedback';
import { Checkbox, Switch } from '../ui/form';
import { FormField, Input, Select } from '../ui/input';
import { Dialog } from '../ui/overlay';

const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

function MethodOption({ value, current, onSelect, icon, title, disabled, hint, children }: { value: string; current: string | null; onSelect: () => void; icon: ReactNode; title: string; disabled?: boolean; hint?: string; children?: ReactNode }) {
  const on = current === value;
  return (
    <div className={cn('rounded-lg border transition-colors', on ? 'border-ink bg-surface shadow-1' : 'border-line bg-surface', disabled && 'opacity-60')}>
      <button type="button" role="radio" aria-checked={on} disabled={disabled} onClick={onSelect} className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:cursor-not-allowed">
        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-ink' : 'border-line-strong')}>{on && <span className="size-2.5 rounded-full bg-ink" />}</span>
        <span className="text-ink-soft">{icon}</span>
        <span className="flex-1">
          <span className="block font-semibold">{title}</span>
          {hint && <span className="block text-caption text-ink-muted">{hint}</span>}
        </span>
      </button>
      {on && children && <div className="border-t border-line px-4 py-4">{children}</div>}
    </div>
  );
}

export interface PaymentFormProps {
  quote: QuoteView;
  quoteId: string;
  initial: QuoteSelection;
  /** Re-quotes for a new selection (PAY-002). */
  requote: (s: QuoteSelection) => Promise<void>;
  /** Sends Pay or Retry with an idempotency key; returns the attempt. */
  submit: (payment: PayPayment, idempotencyKey: string) => Promise<AttemptView>;
  onPlaced: (a: AttemptView) => void;
  onUnsuccessful: (a: AttemptView) => void;
  /** QUOTE_CHANGED / OUT_OF_STOCK: refresh the data before the customer continues (ERR-003). */
  onStale: () => Promise<void>;
}

/**
 * Payment step (PAY-001…005): the demo warning, gift card (with inline redeem), credits, the remainder
 * methods, and the final summary from the quote. Every selection change re-quotes; Pay shows the exact remainder.
 */
export function PaymentForm({ quote, quoteId, initial, requote, submit, onPlaced, onUnsuccessful, onStale }: PaymentFormProps) {
  const giftCards = useGiftCards();
  const credits = useCredits(1);
  const cards = useCards();
  const [sel, setSel] = useState<QuoteSelection>(initial);
  const [cardMode, setCardMode] = useState<'saved' | 'new'>(initial.savedCardId ? 'saved' : 'new');
  const [cvv, setCvv] = useState('');
  const [card, setCard] = useState({ number: '', nameOnCard: '', expiry: '', cvv: '', save: false });
  const [upiId, setUpiId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [changes, setChanges] = useState<QuoteChange[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  // One key per Pay action; reused only when the same action is retried after a network failure (ERR-002, PR-21).
  const key = useRef<string | null>(null);
  const ids = useId();

  const usableGifts = giftCards.data?.items.filter((g) => g.usable) ?? [];
  const usableCards = cards.data?.items ?? [];
  const r = quote.remainder;

  const change = async (next: QuoteSelection) => {
    setSel(next);
    setFormError(null);
    try {
      await requote(next);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  // Choosing Card preselects the default saved card, if there is a usable one (PAY-003).
  const chooseCard = () => {
    const def = usableCards.find((c) => c.isDefault && !c.expired) ?? usableCards.find((c) => !c.expired);
    setCardMode(def ? 'saved' : 'new');
    void change({ ...sel, method: 'card', savedCardId: def?.id, cardBin: undefined });
  };

  const onCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 19);
    setCard((c) => ({ ...c, number: digits.replace(/(\d{4})(?=\d)/g, '$1 ') }));
    const bin = digits.length >= 8 ? digits.slice(0, 8) : undefined;
    if (bin !== sel.cardBin) void change({ ...sel, savedCardId: undefined, cardBin: bin });
  };

  const validate = (): PayPayment | null => {
    const e: Record<string, string> = {};
    const base = { giftCardId: sel.giftCardId, useCredits: sel.useCredits, method: r.paise === 0 ? null : sel.method };
    if (r.paise > 0 && !sel.method) e['method'] = 'Choose a payment method';
    let payment: PayPayment = base;
    if (r.paise > 0 && sel.method === 'card') {
      if (cardMode === 'saved' && sel.savedCardId) {
        if (!/^\d{3,4}$/.test(cvv)) e['cvv'] = 'Enter a valid CVV';
        payment = { ...base, savedCardId: sel.savedCardId, cvv };
      } else {
        const number = card.number.replace(/\s/g, '');
        if (!cardNumberSchema.safeParse(number).success) e['number'] = 'Enter a valid card number';
        if (!nameOnCardSchema.safeParse(card.nameOnCard).success) e['nameOnCard'] = 'Enter the name on the card';
        const exp = cardExpirySchema(todayIst()).safeParse(card.expiry);
        if (!exp.success) e['expiry'] = exp.error.issues[0]!.message;
        if (!cvvSchema(number).safeParse(card.cvv).success) e['newCvv'] = 'Enter a valid CVV';
        payment = { ...base, newCard: { ...card, number } };
      }
    }
    if (r.paise > 0 && sel.method === 'upi') {
      if (!upiIdSchema.safeParse(upiId).success) e['upiId'] = 'Enter a valid UPI ID';
      payment = { ...base, upiId: upiId.trim() };
    }
    setErrors(e);
    return Object.keys(e).length ? null : payment;
  };

  const pay = async () => {
    const payment = validate();
    if (!payment || busy) return;
    setBusy(true);
    setFormError(null);
    key.current ??= newIdempotencyKey();
    try {
      const a = await submit(payment, key.current);
      key.current = null;
      if (a.outcome === 'success') return onPlaced(a);
      setProcessing(true);
      const final = await waitForOutcome(a.id);
      setProcessing(false);
      if (final.outcome === 'success') onPlaced(final);
      else onUnsuccessful(final);
    } catch (e) {
      setProcessing(false);
      if (e instanceof ApiError && e.status !== 0) key.current = null; // a definite answer: the next Pay is a new action
      // Secrets are never kept after an error (ERR-001).
      setCvv('');
      setCard((c) => ({ ...c, cvv: '' }));
      if (e instanceof ApiError && e.code === 'QUOTE_CHANGED') setChanges(e.changes);
      else if (e instanceof ApiError && (e.code === 'OUT_OF_STOCK' || e.code === 'PRODUCT_INACTIVE' || e.code === 'ACTION_NOT_ALLOWED')) {
        setFormError(e.message);
        await onStale();
      } else if (e instanceof ApiError && e.fieldErrors.length) {
        const fe: Record<string, string> = {};
        for (const f of e.fieldErrors) fe[f.field === 'newCard.number' ? 'number' : f.field] = f.message;
        setErrors(fe);
        if (!e.fieldErrors.some((f) => f.field.includes('number') || f.field === 'cvv' || f.field === 'upiId')) setFormError(e.message);
      } else setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <DemoCardWarning />
      {formError && <InlineMessage>{formError}</InlineMessage>}

      <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby={`${ids}-wallet`}>
        <h2 id={`${ids}-wallet`} className="mb-3 flex items-center gap-2 font-semibold"><Wallet className="size-4" aria-hidden="true" />Gift card and credits</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Gift card" className="min-w-56 flex-1">
              <Select value={sel.giftCardId ?? ''} onChange={(e) => void change({ ...sel, giftCardId: e.target.value || null })} disabled={busy}>
                <option value="">No gift card</option>
                {usableGifts.map((g) => <option key={g.id} value={g.id}>{g.maskedCode} · {g.balance.display} balance</option>)}
              </Select>
            </FormField>
            <Button variant="link" size="sm" onClick={() => setRedeeming((v) => !v)} aria-expanded={redeeming}><Gift className="size-4" aria-hidden="true" />Redeem a code</Button>
          </div>
          {redeeming && <RedeemGiftCardForm compact onRedeemed={(g) => { setRedeeming(false); void change({ ...sel, giftCardId: g.id }); }} />}
          <Switch
            label={<>Use credits <span className="text-ink-muted">({credits.data?.balance.display ?? '…'} available)</span></>}
            checked={sel.useCredits}
            disabled={busy || (credits.data?.balance.paise ?? 0) === 0}
            onCheckedChange={(v) => void change({ ...sel, useCredits: v })}
          />
          {(quote.wallet.giftCard.paise > 0 || quote.wallet.credits.paise > 0) && (
            <p className="text-small text-success">
              {quote.wallet.giftCard.paise > 0 && <>Gift card: {quote.wallet.giftCard.display}. </>}
              {quote.wallet.credits.paise > 0 && <>Credits: {quote.wallet.credits.display}.</>}
            </p>
          )}
        </div>
      </section>

      {r.paise > 0 ? (
        <section aria-labelledby={`${ids}-methods`}>
          <h2 id={`${ids}-methods`} className="mb-3 font-semibold">Pay the remaining {r.display} with</h2>
          {errors['method'] && <p role="alert" className="mb-2 text-caption font-medium text-danger">{errors['method']}</p>}
          <div role="radiogroup" aria-labelledby={`${ids}-methods`} className="flex flex-col gap-3">
            <MethodOption value="card" current={sel.method} onSelect={chooseCard} icon={<CreditCard className="size-5" aria-hidden="true" />} title="Card" hint="Demo test cards only">
              <div className="flex flex-col gap-4">
                {usableCards.length > 0 && (
                  <div role="radiogroup" aria-label="Saved cards" className="flex flex-col gap-2">
                    {usableCards.map((c) => {
                      const on = cardMode === 'saved' && sel.savedCardId === c.id;
                      return (
                        <button key={c.id} type="button" role="radio" aria-checked={on} disabled={c.expired || busy}
                          onClick={() => { setCardMode('saved'); void change({ ...sel, savedCardId: c.id, cardBin: undefined }); }}
                          className={cn('flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-small', on ? 'border-ink' : 'border-line', c.expired && 'cursor-not-allowed opacity-60')}>
                          <span><span className="font-semibold">{c.label}</span> · {c.issuingBank} {c.cardType}</span>
                          <span className="text-ink-muted">{c.expired ? 'Expired' : `Expires ${c.expiry}`}</span>
                        </button>
                      );
                    })}
                    <button type="button" role="radio" aria-checked={cardMode === 'new'} onClick={() => { setCardMode('new'); void change({ ...sel, savedCardId: undefined, cardBin: undefined }); }}
                      className={cn('rounded-md border px-3 py-2.5 text-left text-small font-semibold', cardMode === 'new' ? 'border-ink' : 'border-line')}>
                      Add new card
                    </button>
                  </div>
                )}
                {cardMode === 'saved' && sel.savedCardId ? (
                  <FormField label="CVV" error={errors['cvv']} className="max-w-32" required>
                    <Input type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} />
                  </FormField>
                ) : (
                  <div className="flex flex-col gap-4">
                    <FormField label="Card number" error={errors['number']} required>
                      <Input inputMode="numeric" autoComplete="off" placeholder="4000 0001 1000 0009" value={card.number} onChange={(e) => onCardNumber(e.target.value)} />
                    </FormField>
                    <FormField label="Name on card" error={errors['nameOnCard']} required>
                      <Input autoComplete="off" value={card.nameOnCard} onChange={(e) => setCard((c) => ({ ...c, nameOnCard: e.target.value }))} />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Expiry (MM/YY)" error={errors['expiry']} required>
                        <Input inputMode="numeric" placeholder="MM/YY" maxLength={5} value={card.expiry} onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setCard((c) => ({ ...c, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }));
                        }} />
                      </FormField>
                      <FormField label="CVV" error={errors['newCvv']} required>
                        <Input type="password" inputMode="numeric" autoComplete="off" maxLength={isAmex(card.number) ? 4 : 3} value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, '') }))} />
                      </FormField>
                    </div>
                    <Checkbox label="Save this card" checked={card.save} onCheckedChange={(v) => setCard((c) => ({ ...c, save: v === true }))} />
                  </div>
                )}
              </div>
            </MethodOption>
            <MethodOption value="upi" current={sel.method} onSelect={() => void change({ ...sel, method: 'upi', savedCardId: undefined, cardBin: undefined })} icon={<Smartphone className="size-5" aria-hidden="true" />} title="UPI">
              <FormField label="UPI ID" error={errors['upiId']} hint="For example name@okbank. Test IDs are on Demo help." required>
                <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} autoComplete="off" placeholder="name@bank" />
              </FormField>
            </MethodOption>
            <MethodOption
              value="cod"
              current={sel.method}
              onSelect={() => void change({ ...sel, method: 'cod', savedCardId: undefined, cardBin: undefined })}
              icon={<Banknote className="size-5" aria-hidden="true" />}
              title="Cash on Delivery"
              disabled={!quote.allowedMethods.includes('cod')}
              hint={quote.allowedMethods.includes('cod') ? 'Pay when your order arrives' : 'Cash on Delivery is available for amounts up to ₹10,000'}
            />
          </div>
        </section>
      ) : (
        <InlineMessage tone="success">Your gift card and credits cover the whole amount. No other payment is needed.</InlineMessage>
      )}

      {quote.bankOffer.text && quote.bankOffer.state !== 'none' && <p className={cn('text-small font-semibold', quote.bankOffer.state === 'applied' ? 'text-success' : 'text-ink-soft')}>{quote.bankOffer.text}</p>}

      <Button size="lg" variant="brand" block onClick={() => void pay()} loading={busy} data-quote={quoteId}>{payLabel(r, sel.method)}</Button>

      <Dialog open={processing} title="Processing payment…" description="Please don't close this page.">
        <div className="flex justify-center py-6"><Spinner className="size-8" label="Processing payment" /></div>
      </Dialog>
      <Dialog
        open={!!changes}
        onOpenChange={(o) => !o && setChanges(null)}
        title="Some details changed:"
        footer={<Button onClick={async () => { setChanges(null); await onStale(); }}>Review and continue</Button>}
      >
        <ul className="list-disc pl-5 text-small">{changes?.map((c, i) => <li key={i}>{changeText(c)}</li>)}</ul>
      </Dialog>
    </div>
  );
}
