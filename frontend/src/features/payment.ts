import type { Money } from '@app/shared';
import { api } from '../lib/api-client';

// Payment (spec §6.15). The quote selection carries no secrets; the full instrument goes only with Pay.

export interface QuoteSelection {
  giftCardId: string | null;
  useCredits: boolean;
  method: 'card' | 'upi' | 'cod' | null;
  savedCardId?: string;
  cardBin?: string;
}

export interface PayPayment {
  giftCardId: string | null;
  useCredits: boolean;
  method: 'card' | 'upi' | 'cod' | null;
  savedCardId?: string;
  cvv?: string;
  newCard?: { number: string; nameOnCard: string; expiry: string; cvv: string; save: boolean };
  upiId?: string;
}

export interface AttemptView {
  id: string;
  outcome: 'pending' | 'success' | 'failure' | 'cancelled' | 'timed_out';
  message: string;
  method: string;
  amount: Money;
  order: { id: string; orderNumber: string; status: string; retryEndsAt: string; minutesLeft: number; canRetry: boolean };
}

export const getAttempt = (id: string) => api<AttemptView>(`/payment-attempts/${id}`);

/** Polls the attempt every second until its outcome is final (PAY-008: 2–4 s of "Processing payment…"). */
export async function waitForOutcome(id: string, signal?: AbortSignal): Promise<AttemptView> {
  for (;;) {
    const a = await getAttempt(id);
    if (a.outcome !== 'pending') return a;
    if (signal?.aborted) return a;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** The Pay button's label from the quote's remainder (PAY-002). */
export function payLabel(remainder: Money, method: QuoteSelection['method']): string {
  if (remainder.paise === 0) return 'Place order';
  if (method === 'cod') return `Place order (pay ${remainder.display} on delivery)`;
  return `Pay ${remainder.display}`;
}
