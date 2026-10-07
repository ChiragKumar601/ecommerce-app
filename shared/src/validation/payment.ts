import { z } from 'zod';
import { V } from './messages.ts';
import { cardExpirySchema, cardNumberSchema, cvvSchema, nameOnCardSchema, upiIdSchema } from './fields.ts';

// Payment step (PAY-001…005). The quote selection carries no secrets: a saved card id, or the first
// digits of a new card so the bank offer can be previewed (PRC-006) without sending the full number.

export const paymentQuoteSelectionSchema = z.object({
  giftCardId: z.uuid().nullable().default(null),
  useCredits: z.boolean().default(false),
  method: z.enum(['card', 'upi', 'cod']).nullable().default(null),
  savedCardId: z.uuid().optional(),
  cardBin: z.string().regex(/^\d{8}$/).optional(),
});
export type PaymentQuoteSelection = z.input<typeof paymentQuoteSelectionSchema>;

/** Pay / Retry (PAY-003, PAY-004, PAY-006): the full instrument goes only to the payment simulator. */
export function payPaymentSchema(today: string) {
  return z
    .object({
      giftCardId: z.uuid().nullable().default(null),
      useCredits: z.boolean().default(false),
      method: z.enum(['card', 'upi', 'cod']).nullable().default(null),
      savedCardId: z.uuid().optional(),
      cvv: z.string().optional(),
      newCard: z.object({ number: cardNumberSchema, nameOnCard: nameOnCardSchema, expiry: cardExpirySchema(today), cvv: z.string(), save: z.boolean().default(false) }).optional(),
      upiId: upiIdSchema.optional(),
    })
    .superRefine((v, c) => {
      if (v.method === 'card') {
        if (v.newCard) {
          if (!cvvSchema(v.newCard.number).safeParse(v.newCard.cvv).success) c.addIssue({ code: 'custom', path: ['newCard', 'cvv'], message: V.cvv });
        } else if (!v.savedCardId) {
          c.addIssue({ code: 'custom', path: ['savedCardId'], message: 'Choose a card or add a new one' });
        } else if (!/^\d{3,4}$/.test(v.cvv ?? '')) {
          c.addIssue({ code: 'custom', path: ['cvv'], message: V.cvv });
        }
      }
      if (v.method === 'upi' && !v.upiId) c.addIssue({ code: 'custom', path: ['upiId'], message: V.upi });
    });
}

export function paySchema(today: string) {
  return z.object({ quoteId: z.uuid(), payment: payPaymentSchema(today) });
}
