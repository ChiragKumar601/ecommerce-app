import { ERROR_CODES } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CATALOGUE, internalErrorEnvelope, messageFor } from '../../../src/domain/errors.js';

describe('error catalogue (spec §13.1)', () => {
  it('has an entry for every shared error code', () => {
    for (const code of ERROR_CODES) expect(ERROR_CATALOGUE[code]).toBeDefined();
    expect(Object.keys(ERROR_CATALOGUE).sort()).toEqual([...ERROR_CODES].sort());
  });
  it('uses the exact §13 texts', () => {
    expect(messageFor('INVALID_CREDENTIALS')).toBe('Incorrect email/phone or password.');
    expect(messageFor('ACCOUNT_LOCKED', { minutes: 12 })).toBe('Too many attempts. Try again in 12 minutes.');
    expect(messageFor('RESET_FAILED')).toBe("The details you entered don't match our records.");
    expect(messageFor('IDENTIFIER_TAKEN')).toBe('An account with this email/phone already exists.');
    expect(messageFor('IDENTIFIER_TAKEN', { context: 'profile' })).toBe('This email/phone is already linked to another account.');
    expect(messageFor('OUT_OF_STOCK', { item: 'Sneakers, UK 9' })).toBe('Sneakers, UK 9 is out of stock.');
    expect(messageFor('OUT_OF_STOCK', { available: 2 })).toBe('Only 2 left.');
    expect(messageFor('COUPON_NOT_ELIGIBLE', { reason: 'min_value', shortfall: '₹150' })).toBe('Add items worth ₹150 more to use this coupon');
    expect(messageFor('COUPON_NOT_ELIGIBLE', { reason: 'no_eligible_items' })).toBe("This coupon doesn't apply to items in your bag");
    expect(messageFor('COUPON_NOT_ELIGIBLE', { reason: 'limit_reached' })).toBe("You've already used this coupon");
    expect(messageFor('ADDRESS_NOT_SERVICEABLE', { pincode: '999999' })).toBe("We don't deliver to 999999 yet.");
    expect(messageFor('LIMIT_REACHED', { context: 'addresses' })).toBe('You can save up to 10 addresses. Delete one to add another.');
    expect(messageFor('PAYMENT_FAILED')).toBe('Payment failed. No money was taken.');
    expect(messageFor('OTP_LOCKED')).toBe('Too many incorrect OTPs. Delivery will be re-attempted.');
    expect(messageFor('INVOICE_NOT_AVAILABLE')).toBe('The invoice will be available once your order ships.');
  });
  it('builds a customer-safe envelope with only public details', () => {
    const err = new AppError('OUT_OF_STOCK', { available: 1, sqlState: 'secret', changes: [] });
    expect(err.status).toBe(409);
    expect(err.toEnvelope()).toEqual({ code: 'OUT_OF_STOCK', message: 'Only 1 left.', details: { available: 1 } });
    expect(new AppError('RATE_LIMITED', { retryAfterSeconds: 30 }).toEnvelope()).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment and try again.',
      retryAfterSeconds: 30,
    });
    expect(internalErrorEnvelope()).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
  });
});
