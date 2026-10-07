/**
 * Interrupted actions (AUTH-020, R-22): before the login prompt, the action and its inputs are kept
 * in sessionStorage; after login or sign-up the action carries on with the same inputs.
 * Handlers are registered by the features that own the action (bag, checkout, reviews).
 */
export interface PendingIntent {
  action: string;
  payload?: unknown;
  /** Where the customer was when the action was interrupted. */
  returnTo: string;
  at: number;
}

const KEY = 'wco.intent.v1';
const MAX_AGE_MS = 30 * 60_000;

type Handler = (payload: unknown) => Promise<string | void> | string | void;
const handlers = new Map<string, Handler>();

export function registerIntent(action: string, handler: Handler) {
  handlers.set(action, handler);
}

export function saveIntent(action: string, payload: unknown, returnTo: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ action, payload, returnTo, at: Date.now() } satisfies PendingIntent));
  } catch {
    /* storage unavailable: the customer simply returns to returnTo */
  }
}

export function peekIntent(): PendingIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingIntent;
    return Date.now() - p.at > MAX_AGE_MS ? null : p;
  } catch {
    return null;
  }
}

export function clearIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Runs the pending action, if any, and returns where to go next: the handler's destination,
 * the intent's returnTo, or `fallback`.
 */
export async function resumeIntent(fallback: string): Promise<string> {
  const p = peekIntent();
  clearIntent();
  if (!p) return fallback;
  const h = handlers.get(p.action);
  if (!h) return p.returnTo || fallback;
  try {
    const dest = await h(p.payload);
    return dest || p.returnTo || fallback;
  } catch {
    return p.returnTo || fallback;
  }
}
