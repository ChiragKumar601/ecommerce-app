import { beforeEach, describe, expect, it } from 'vitest';
import { peekIntent, registerIntent, resumeIntent, saveIntent } from '../../src/lib/intent-resume';

describe('intent resume (AUTH-020)', () => {
  beforeEach(() => sessionStorage.clear());

  it('replays the saved action with the same inputs, once', async () => {
    const seen: unknown[] = [];
    registerIntent('buy-now', (p) => {
      seen.push(p);
      return '/checkout/buy-now';
    });
    saveIntent('buy-now', { variantId: 'v1', qty: 1 }, '/p/x');
    expect(await resumeIntent('/')).toBe('/checkout/buy-now');
    expect(seen).toEqual([{ variantId: 'v1', qty: 1 }]);
    expect(peekIntent()).toBeNull();
    expect(await resumeIntent('/fallback')).toBe('/fallback');
  });

  it('returns to where the customer was when the handler fails or is unknown', async () => {
    registerIntent('boom', () => {
      throw new Error('x');
    });
    saveIntent('boom', null, '/bag');
    expect(await resumeIntent('/')).toBe('/bag');
    saveIntent('unknown', null, '/wishlist');
    expect(await resumeIntent('/')).toBe('/wishlist');
  });
});
