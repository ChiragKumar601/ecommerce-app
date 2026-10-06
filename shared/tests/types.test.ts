import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ORDER_STATUSES, RETURN_STATUSES } from '../src/index.js';

describe('shared types', () => {
  it('lists every §13.1 error code exactly once, plus INTERNAL_ERROR', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect(ERROR_CODES).toContain('QUOTE_CHANGED');
    expect(ERROR_CODES).toContain('INTERNAL_ERROR');
    expect(ERROR_CODES).toHaveLength(42);
  });
  it('lists every §7.1 order status and §7.3 return status', () => {
    expect(ORDER_STATUSES).toHaveLength(12);
    expect(RETURN_STATUSES).toHaveLength(9);
  });
});
