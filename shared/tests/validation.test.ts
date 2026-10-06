import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  V,
  addressLabelSchema,
  ageConfirmSchema,
  ageInYears,
  cardExpirySchema,
  cardNumberSchema,
  citySchema,
  couponCodeSchema,
  cvvSchema,
  dateOfBirthSchema,
  emailSchema,
  giftCardCodeSchema,
  identifierKind,
  identifierSchema,
  nameOnCardSchema,
  nameSchema,
  normalizePhone,
  normalizeSecurityAnswer,
  optionalLineSchema,
  otpSchema,
  passesLuhn,
  passwordSchema,
  passwordsMatch,
  phoneSchema,
  pincodeSchema,
  ratingSchema,
  requiredLineSchema,
  returnCommentSchema,
  reviewTextSchema,
  searchQuerySchema,
  securityAnswerSchema,
  stateSchema,
  supportMessageSchema,
  upiIdSchema,
} from '../src/index.js';
import { z as zod } from 'zod';

function msg(schema: z.ZodType, value: unknown): string | undefined {
  const r = schema.safeParse(value);
  return r.success ? undefined : r.error.issues[0]?.message;
}
const ok = (schema: z.ZodType, value: unknown) => expect(schema.safeParse(value).success).toBe(true);

describe('§12 Name', () => {
  it('accepts 2–60 letters with spaces . \' -', () => {
    ok(nameSchema, 'Al');
    ok(nameSchema, "Anne-Marie O'Neil Jr.");
    ok(nameSchema, 'राहुल शर्मा');
    ok(nameSchema, 'a'.repeat(60));
  });
  it('rejects bad names with the §12 message', () => {
    expect(msg(nameSchema, 'A')).toBe(V.name);
    expect(msg(nameSchema, 'a'.repeat(61))).toBe(V.name);
    expect(msg(nameSchema, 'R2D2')).toBe(V.name);
    expect(msg(nameSchema, '   ')).toBe(V.name);
  });
});

describe('§12 Email', () => {
  it('accepts and stores lower-case', () => {
    expect(emailSchema.parse('  Chirag@Example.COM ')).toBe('chirag@example.com');
  });
  it('rejects invalid or too long', () => {
    expect(msg(emailSchema, 'not-an-email')).toBe(V.email);
    expect(msg(emailSchema, `${'a'.repeat(250)}@x.io`)).toBe(V.email);
  });
});

describe('§12 Phone', () => {
  it('normalises to +91XXXXXXXXXX with optional +91 or 0 prefix', () => {
    expect(phoneSchema.parse('9876543210')).toBe('+919876543210');
    expect(phoneSchema.parse('+919876543210')).toBe('+919876543210');
    expect(phoneSchema.parse('09876543210')).toBe('+919876543210');
    expect(normalizePhone('6000000000')).toBe('+916000000000');
  });
  it('rejects numbers not starting 6–9 or not 10 digits', () => {
    expect(msg(phoneSchema, '5876543210')).toBe(V.phone);
    expect(msg(phoneSchema, '987654321')).toBe(V.phone);
    expect(msg(phoneSchema, '98765432101')).toBe(V.phone);
    expect(msg(phoneSchema, '+449876543210')).toBe(V.phone);
  });
});

describe('§12 Login identifier', () => {
  it('uses the email rule when it contains @, otherwise the phone rule', () => {
    expect(identifierKind('a@b.co')).toBe('email');
    expect(identifierKind('9876543210')).toBe('phone');
    expect(identifierSchema.parse('A@B.co')).toEqual({ kind: 'email', value: 'a@b.co' });
    expect(identifierSchema.parse('09876543210')).toEqual({ kind: 'phone', value: '+919876543210' });
    expect(msg(identifierSchema, 'x@')).toBe(V.email);
    expect(msg(identifierSchema, '12345')).toBe(V.phone);
  });
});

describe('§12 Password and confirmation', () => {
  it('needs 8–64 characters with a letter and a digit', () => {
    ok(passwordSchema, 'abcdefg1');
    ok(passwordSchema, `a1${'x'.repeat(62)}`);
    expect(msg(passwordSchema, 'abc1234')).toBe(V.password);
    expect(msg(passwordSchema, 'abcdefgh')).toBe(V.password);
    expect(msg(passwordSchema, '12345678')).toBe(V.password);
    expect(msg(passwordSchema, `a1${'x'.repeat(63)}`)).toBe(V.password);
  });
  it('reports a mismatch on confirmPassword', () => {
    const form = passwordsMatch(zod.object({ password: zod.string(), confirmPassword: zod.string() }));
    const r = form.safeParse({ password: 'abcdefg1', confirmPassword: 'abcdefg2' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ message: V.passwordMismatch, path: ['confirmPassword'] });
  });
});

describe('§12 Security answer', () => {
  it('normalises case and whitespace before checking 2–50 characters', () => {
    expect(normalizeSecurityAnswer('  New   DELHI ')).toBe('new delhi');
    expect(securityAnswerSchema.parse('  New   DELHI ')).toBe('new delhi');
    expect(msg(securityAnswerSchema, ' a ')).toBe(V.securityAnswer);
    expect(msg(securityAnswerSchema, 'x'.repeat(51))).toBe(V.securityAnswer);
  });
});

describe('§12 Age confirmation and date of birth', () => {
  it('requires the 18+ box to be ticked', () => {
    ok(ageConfirmSchema, true);
    expect(msg(ageConfirmSchema, false)).toBe(V.ageConfirm);
  });
  it('computes whole years', () => {
    expect(ageInYears('2008-10-06', '2026-10-06')).toBe(18);
    expect(ageInYears('2008-10-07', '2026-10-06')).toBe(17);
  });
  it('accepts age ≥ 18 and rejects under-18, future and invalid dates', () => {
    const dob = dateOfBirthSchema('2026-10-06');
    ok(dob, '2008-10-06');
    expect(msg(dob, '2008-10-07')).toBe(V.dateOfBirth);
    expect(msg(dob, '2030-01-01')).toBe(V.dateOfBirth);
    expect(msg(dob, '2001-02-30')).toBe(V.dateOfBirth);
  });
});

describe('§12 Address fields', () => {
  it('requires house/flat and street/area (1–100)', () => {
    ok(requiredLineSchema, 'Flat 4B');
    expect(msg(requiredLineSchema, '  ')).toBe(V.required);
    expect(msg(requiredLineSchema, 'x'.repeat(101))).toBe(V.tooLong100);
  });
  it('allows empty building/landmark up to 100', () => {
    ok(optionalLineSchema, '');
    ok(optionalLineSchema, undefined);
    expect(msg(optionalLineSchema, 'x'.repeat(101))).toBe(V.tooLong100);
  });
  it('checks city, state, pincode and label', () => {
    ok(citySchema, 'Pune');
    expect(msg(citySchema, 'P')).toBe(V.city);
    expect(msg(stateSchema, '')).toBe(V.state);
    ok(pincodeSchema, '560001');
    expect(msg(pincodeSchema, '060001')).toBe(V.pincode);
    expect(msg(pincodeSchema, '56001')).toBe(V.pincode);
    ok(addressLabelSchema, { type: 'Home' });
    ok(addressLabelSchema, { type: 'Other', text: 'Gym' });
    expect(msg(addressLabelSchema, { type: 'Other', text: '' })).toBe(V.label);
    expect(msg(addressLabelSchema, { type: 'Other', text: 'x'.repeat(21) })).toBe(V.label);
  });
});

describe('§12 Card fields', () => {
  it('checks 13–19 digits with the Luhn checksum, ignoring spaces', () => {
    expect(passesLuhn('4111111111111111')).toBe(true);
    expect(cardNumberSchema.parse('4111 1111 1111 1111')).toBe('4111111111111111');
    expect(msg(cardNumberSchema, '4111111111111112')).toBe(V.cardNumber);
    expect(msg(cardNumberSchema, '411111111111')).toBe(V.cardNumber);
  });
  it('checks name on card', () => {
    ok(nameOnCardSchema, 'CHIRAG KUMAR');
    expect(msg(nameOnCardSchema, 'C')).toBe(V.nameOnCard);
    expect(msg(nameOnCardSchema, 'J0hn')).toBe(V.nameOnCard);
  });
  it('accepts expiry in the current or a future month only', () => {
    const exp = cardExpirySchema('2026-10-06');
    ok(exp, '10/26');
    ok(exp, '01/27');
    expect(msg(exp, '09/26')).toBe(V.cardExpired);
    expect(msg(exp, '13/26')).toBe(V.cardExpiryFormat);
  });
  it('needs a 3-digit CVV, or 4 digits for Amex', () => {
    ok(cvvSchema('4111111111111111'), '123');
    expect(msg(cvvSchema('4111111111111111'), '1234')).toBe(V.cvv);
    ok(cvvSchema('378282246310005'), '1234');
    expect(msg(cvvSchema('378282246310005'), '123')).toBe(V.cvv);
  });
});

describe('§12 Other codes and texts', () => {
  it('checks UPI IDs', () => {
    ok(upiIdSchema, 'success@demo');
    ok(upiIdSchema, 'chirag.k-1@okaxis');
    expect(msg(upiIdSchema, 'a@b')).toBe(V.upi);
    expect(msg(upiIdSchema, 'no-at-sign')).toBe(V.upi);
  });
  it('normalises coupon and gift card codes to upper case', () => {
    expect(couponCodeSchema.parse('welcome10')).toBe('WELCOME10');
    expect(msg(couponCodeSchema, 'AB')).toBe(V.coupon);
    expect(msg(couponCodeSchema, 'WELCOME-10')).toBe(V.coupon);
    expect(giftCardCodeSchema.parse('demogift500')).toBe('DEMOGIFT500');
    expect(msg(giftCardCodeSchema, 'SHORT1')).toBe(V.giftCard);
  });
  it('checks OTP, search, rating, review, return comment and support message', () => {
    ok(otpSchema, '0427');
    expect(msg(otpSchema, '427')).toBe(V.otp);
    expect(searchQuerySchema.parse('  sneakers ')).toBe('sneakers');
    expect(searchQuerySchema.safeParse('   ').success).toBe(false);
    expect(searchQuerySchema.safeParse('x'.repeat(101)).success).toBe(false);
    ok(ratingSchema, 5);
    expect(msg(ratingSchema, 0)).toBe(V.rating);
    expect(msg(ratingSchema, 4.5)).toBe(V.rating);
    ok(reviewTextSchema, 'x'.repeat(2000));
    expect(msg(reviewTextSchema, 'x'.repeat(2001))).toBe(V.reviewText);
    expect(msg(returnCommentSchema, 'x'.repeat(501))).toBe(V.returnComment);
    ok(supportMessageSchema, 'Where is my order?');
    expect(msg(supportMessageSchema, 'Help')).toBe(V.supportMessage);
    expect(msg(supportMessageSchema, 'x'.repeat(1001))).toBe(V.supportMessage);
  });
});
