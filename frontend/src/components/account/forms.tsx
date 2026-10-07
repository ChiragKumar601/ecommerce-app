import { cardSchema, isAmex, redeemGiftCardSchema } from '@app/shared';
import { AlertTriangle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { redeemGiftCard, type GiftCard } from '../../features/account';
import { newIdempotencyKey } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-form';
import { Button } from '../ui/button';
import { InlineMessage } from '../ui/feedback';
import { FormField, Input } from '../ui/input';

/** The demo warning shown above every card entry (PAY-001, D-25). */
export function DemoCardWarning() {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2.5 text-small font-semibold text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>This is a demo — do not enter real card details. <Link to="/demo-help" className="underline underline-offset-2">See test cards</Link></span>
    </p>
  );
}

const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export type CardInput = { nameOnCard: string; number: string; expiry: string; cvv: string };

/**
 * Card entry (PRF-005, PAY-003, §12): name, number, expiry, CVV, validated on blur and submit.
 * The number is grouped as it's typed; the CVV is cleared after any error (ERR-001).
 */
export function CardFields({ onSubmit, submitLabel, extra }: { onSubmit: (d: CardInput) => Promise<unknown>; submitLabel: string; extra?: ReactNode }) {
  const f = useZodForm(cardSchema(todayIst()), { nameOnCard: '', number: '', expiry: '', cvv: '' }, { clearOnError: ['cvv'] });
  const number = f.field('number');
  const expiry = f.field('expiry');
  return (
    <form {...f.formProps(async () => onSubmit({ ...f.values, number: f.values.number.replace(/\s+/g, '') }))} className="flex flex-col gap-4">
      {f.formError && <InlineMessage>{f.formError}</InlineMessage>}
      <FormField label="Card number" error={f.errors['number']} required>
        <Input
          {...number}
          inputMode="numeric"
          autoComplete="off"
          placeholder="4000 0001 1000 0009"
          onChange={(e) => f.set('number', e.target.value.replace(/[^\d]/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '))}
        />
      </FormField>
      <FormField label="Name on card" error={f.errors['nameOnCard']} required>
        <Input {...f.field('nameOnCard')} autoComplete="off" />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Expiry (MM/YY)" error={f.errors['expiry']} required>
          <Input
            {...expiry}
            inputMode="numeric"
            placeholder="MM/YY"
            maxLength={5}
            onChange={(e) => {
              const d = e.target.value.replace(/[^\d]/g, '').slice(0, 4);
              f.set('expiry', d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
            }}
          />
        </FormField>
        <FormField label="CVV" error={f.errors['cvv']} required>
          <Input {...f.field('cvv')} type="password" inputMode="numeric" autoComplete="off" maxLength={isAmex(f.values.number) ? 4 : 3} />
        </FormField>
      </div>
      {extra}
      <Button type="submit" loading={f.submitting}>{submitLabel}</Button>
    </form>
  );
}

/** "Redeem gift card" (PRF-004), also used inline at payment (PAY-001). */
export function RedeemGiftCardForm({ onRedeemed, compact }: { onRedeemed?: (g: GiftCard) => void; compact?: boolean }) {
  const [key, setKey] = useState(newIdempotencyKey);
  const [done, setDone] = useState<string | null>(null);
  const f = useZodForm(redeemGiftCardSchema, { code: '' });
  return (
    <form {...f.formProps(async (d) => {
      const g = await redeemGiftCard(d.code, key);
      setKey(newIdempotencyKey());
      setDone(`Gift card ${g.maskedCode} added: ${g.balance.display}`);
      f.set('code', '');
      onRedeemed?.(g);
    })} className="flex flex-col gap-2">
      {f.formError && <InlineMessage>{f.formError}</InlineMessage>}
      <div className="flex items-start gap-2">
        <FormField label="Gift card code" error={f.errors['code']} className="flex-1">
          <Input {...f.field('code')} autoComplete="off" placeholder="e.g. DEMOGIFT500" className="uppercase placeholder:normal-case" onChange={(e) => { setDone(null); f.set('code', e.target.value.toUpperCase()); }} />
        </FormField>
        <Button type="submit" variant={compact ? 'secondary' : 'primary'} loading={f.submitting} className="mt-[1.6rem]">Redeem</Button>
      </div>
      {done && <InlineMessage tone="success">{done}</InlineMessage>}
    </form>
  );
}
