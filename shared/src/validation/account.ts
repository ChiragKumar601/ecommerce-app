import { z } from 'zod';
import { V } from './messages.ts';
import {
  cardExpirySchema, cardNumberSchema, cvvSchema, dateOfBirthSchema, emailSchema, giftCardCodeSchema, nameOnCardSchema, nameSchema, passwordSchema,
  phoneSchema, securityAnswerSchema, supportMessageSchema,
} from './fields.ts';

// Account section schemas (PRF-002…006). `today` is the IST calendar date (YYYY-MM-DD).

const blankToUndefined = <T extends z.ZodType>(schema: T) => z.union([z.literal('').transform(() => undefined), schema]).optional();

export const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'] as const;

/** Edit Profile (PRF-002): sensitive changes need the current password (checked by the server). */
export function profileSchema(today: string) {
  return z
    .object({
      name: nameSchema,
      email: blankToUndefined(emailSchema),
      phone: blankToUndefined(phoneSchema),
      gender: blankToUndefined(z.enum(GENDERS)),
      dateOfBirth: blankToUndefined(dateOfBirthSchema(today)),
      currentPassword: z.string().max(128).optional(),
      newPassword: blankToUndefined(passwordSchema),
      confirmNewPassword: z.string().optional(),
      securityQuestionId: blankToUndefined(z.string().min(1).max(64)),
      securityAnswer: blankToUndefined(securityAnswerSchema),
    })
    .refine((v) => !!v.email || !!v.phone, { path: ['email'], message: 'Keep an email address or a mobile number' })
    .refine((v) => !v.newPassword || v.newPassword === v.confirmNewPassword, { path: ['confirmNewPassword'], message: V.passwordMismatch })
    .refine((v) => !v.securityQuestionId || !!v.securityAnswer, { path: ['securityAnswer'], message: V.securityAnswer });
}

/** Add card (PRF-005, §12). Test-card membership is checked by the server (NOT_TEST_CARD). */
export function cardSchema(today: string) {
  return z
    .object({ nameOnCard: nameOnCardSchema, number: cardNumberSchema, expiry: cardExpirySchema(today), cvv: z.string() })
    .superRefine((v, c) => {
      if (!cvvSchema(v.number).safeParse(v.cvv).success) c.addIssue({ code: 'custom', path: ['cvv'], message: V.cvv });
    });
}

export const redeemGiftCardSchema = z.object({ code: giftCardCodeSchema });

export const SUPPORT_TYPES = ['order_issue', 'payment', 'return_refund', 'account', 'account_deletion', 'other'] as const;
export const SUPPORT_TYPE_LABELS: Record<(typeof SUPPORT_TYPES)[number], string> = {
  order_issue: 'Order issue', payment: 'Payment', return_refund: 'Return or refund', account: 'Account', account_deletion: 'Delete my account', other: 'Other',
};

export const supportRequestSchema = z.object({
  type: z.enum(SUPPORT_TYPES, { error: 'Choose a request type' }),
  orderId: blankToUndefined(z.string().min(1).max(64)),
  message: supportMessageSchema,
});
