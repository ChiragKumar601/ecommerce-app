import { registerIntent } from '../lib/intent-resume';

// Actions a guest can start before logging in (AUTH-020). Registered at start-up, so the login
// and sign-up pages can resume them whichever page was loaded first.

/** Buy Now (PDP-009): checkout with only this variant, quantity 1. */
registerIntent('buy-now', (p) => `/checkout/buy-now?variant=${encodeURIComponent((p as { variantId: string }).variantId)}`);

/** Proceed to Checkout from the bag (BAG-011): the merged bag is re-validated when checkout starts. */
registerIntent('checkout', () => '/checkout');

/** A protected page or action that only needs the customer to come back where they were. */
registerIntent('return', () => undefined);
