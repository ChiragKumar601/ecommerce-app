import { z } from 'zod';
import { V } from './messages.ts';

// Field-level rules from spec §12. Composite form schemas are built from these in later stages.

/** Name: 2–60 characters; letters, spaces, `.`, `'`, `-`. */
export const nameSchema = z
  .string()
  .trim()
  .min(2, V.name)
  .max(60, V.name)
  .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, V.name);

/** Email: basic RFC 5322 form, ≤ 254 characters, stored lower-case. */
export const emailSchema = z
  .string()
  .trim()
  .max(254, V.email)
  .pipe(z.email(V.email))
  .transform((v) => v.toLowerCase());

const PHONE_RE = /^(?:\+91|0)?([6-9]\d{9})$/;

/** Normalises an Indian mobile number to `+91XXXXXXXXXX`, or returns null if it isn't valid. */
export function normalizePhone(input: string): string | null {
  const m = PHONE_RE.exec(input.trim());
  return m ? `+91${m[1]}` : null;
}

/** Phone: Indian mobile, 10 digits starting 6–9; optional `+91` or `0` prefix; stored as `+91XXXXXXXXXX`. */
export const phoneSchema = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, V.phone)
  .transform((v) => normalizePhone(v) as string);

export type IdentifierKind = 'email' | 'phone';

/** Login identifier: contains `@` → email rule; otherwise → phone rule (§12, AUTH-004). */
export function identifierKind(input: string): IdentifierKind {
  return input.includes('@') ? 'email' : 'phone';
}

export const identifierSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (identifierKind(v) === 'email') {
      const r = emailSchema.safeParse(v);
      if (r.success) return { kind: 'email' as const, value: r.data };
      ctx.addIssue({ code: 'custom', message: V.email });
      return z.NEVER;
    }
    const phone = normalizePhone(v);
    if (phone) return { kind: 'phone' as const, value: phone };
    ctx.addIssue({ code: 'custom', message: V.phone });
    return z.NEVER;
  });

/** Password: 8–64 characters, at least one letter and one digit. */
export const passwordSchema = z
  .string()
  .min(8, V.password)
  .max(64, V.password)
  .regex(/\p{L}/u, V.password)
  .regex(/\d/, V.password);

/** Normalises a security answer: lower-case, outer spaces trimmed, inner whitespace collapsed (AUTH-007). */
export function normalizeSecurityAnswer(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Security answer: 2–50 characters after normalisation. */
export const securityAnswerSchema = z
  .string()
  .transform(normalizeSecurityAnswer)
  .pipe(z.string().min(2, V.securityAnswer).max(50, V.securityAnswer));

/** Age confirmation: must be ticked. */
export const ageConfirmSchema = z.literal(true, { error: V.ageConfirm });

/** Whole years between a `YYYY-MM-DD` date of birth and `today` (`YYYY-MM-DD`). */
export function ageInYears(dob: string, today: string): number {
  const [by, bm, bd] = dob.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Date of birth: a valid past date; age ≥ 18 on `today` (`YYYY-MM-DD`, IST calendar date). */
export function dateOfBirthSchema(today: string) {
  return z
    .string()
    .trim()
    .refine((v) => isRealDate(v) && v < today && ageInYears(v, today) >= 18, V.dateOfBirth);
}

/** Required address line (house/flat, street/area): 1–100 characters. */
export const requiredLineSchema = z.string().trim().min(1, V.required).max(100, V.tooLong100);

/** Optional address line (building, landmark): ≤ 100 characters. */
export const optionalLineSchema = z.string().trim().max(100, V.tooLong100).optional().or(z.literal(''));

/** City: 2–50 characters. */
export const citySchema = z.string().trim().min(2, V.city).max(50, V.city);

/** State: must be chosen. Membership in the reference list (DAT-009) is checked by the backend. */
export const stateSchema = z.string().trim().min(1, V.state);

/** Pincode: `^[1-9][0-9]{5}$`. */
export const pincodeSchema = z.string().trim().regex(/^[1-9][0-9]{5}$/, V.pincode);

/** Address label: Home | Work | Other (custom text 1–20 characters). */
export const addressLabelSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Home') }),
  z.object({ type: z.literal('Work') }),
  z.object({ type: z.literal('Other'), text: z.string().trim().min(1, V.label).max(20, V.label) }),
]);

/** Luhn checksum ("standard card number check"). */
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** Card number: 13–19 digits (spaces allowed while typing) passing the checksum. Test-card membership is a backend check. */
export const cardNumberSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .refine((v) => /^\d{13,19}$/.test(v) && passesLuhn(v), V.cardNumber);

/** Amex numbers start with 34 or 37 and use a 4-digit CVV. */
export function isAmex(cardNumber: string): boolean {
  return /^3[47]/.test(cardNumber.replace(/\s+/g, ''));
}

/** Name on card: 2–26 characters, letters and spaces. */
export const nameOnCardSchema = z
  .string()
  .trim()
  .min(2, V.nameOnCard)
  .max(26, V.nameOnCard)
  .regex(/^[\p{L}\p{M} ]+$/u, V.nameOnCard);

/** Card expiry `MM/YY`, not in the past relative to `today` (`YYYY-MM-DD`). Valid through the end of that month. */
export function cardExpirySchema(today: string) {
  return z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, V.cardExpiryFormat)
    .refine((v) => {
      const [mm, yy] = v.split('/').map(Number) as [number, number];
      const [ty, tm] = today.split('-').map(Number) as [number, number];
      const year = 2000 + yy;
      return year > ty || (year === ty && mm >= tm);
    }, V.cardExpired);
}

/** CVV: 3 digits, or 4 for Amex. */
export function cvvSchema(cardNumber?: string) {
  const len = cardNumber && isAmex(cardNumber) ? 4 : 3;
  return z.string().trim().regex(new RegExp(`^\\d{${len}}$`), V.cvv);
}

/** UPI ID: `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`. */
export const upiIdSchema = z.string().trim().regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, V.upi);

/** Coupon code: 3–20 alphanumerics, case-insensitive (normalised to upper case). */
export const couponCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9]{3,20}$/, V.coupon)
  .transform((v) => v.toUpperCase());

/** Gift card code: 8–20 alphanumerics, case-insensitive (normalised to upper case). */
export const giftCardCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9]{8,20}$/, V.giftCard)
  .transform((v) => v.toUpperCase());

/** Delivery OTP: exactly 4 digits. */
export const otpSchema = z.string().trim().regex(/^\d{4}$/, V.otp);

/** Search query: trimmed, 1–100 characters (SRC-010). */
export const searchQuerySchema = z.string().trim().min(1, V.search).max(100);

/** Review rating: 1–5 (REV-005). */
export const ratingSchema = z.number({ error: V.rating }).int(V.rating).min(1, V.rating).max(5, V.rating);

/** Review text: optional, ≤ 2,000 characters, trimmed. */
export const reviewTextSchema = z.string().trim().max(2000, V.reviewText);

/** Return comment: ≤ 500 characters. */
export const returnCommentSchema = z.string().trim().max(500, V.returnComment);

/** Support message: 10–1,000 characters. */
export const supportMessageSchema = z.string().trim().min(10, V.supportMessage).max(1000, V.supportMessage);

/** Confirm-password refinement for objects with `password` and `confirmPassword` fields. */
export function passwordsMatch<T extends { password: string; confirmPassword: string }>(schema: z.ZodType<T>) {
  return schema.refine((v) => v.password === v.confirmPassword, {
    message: V.passwordMismatch,
    path: ['confirmPassword'],
  });
}
