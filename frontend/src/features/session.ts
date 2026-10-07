import { useQuery } from '@tanstack/react-query';
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { toast } from '../components/ui/toast';
import { api } from '../lib/api-client';
import { deviceStore } from '../lib/device-store';
import { queryClient } from '../lib/query';

// Session layer (plan §8.2): who is logged in, login / sign-up / logout, route guards (AUTH-015),
// guest-data merge on login (AUTH-012) and logout clean-up (AUTH-013).

export interface Account {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export type SessionInfo =
  | { authenticated: false; expired?: boolean }
  | { authenticated: true; account: Account; hasUnseenOrderUpdates: boolean };

export const sessionQuery = {
  queryKey: ['session'] as const,
  queryFn: () => api<SessionInfo>('/auth/session'),
  staleTime: 60_000,
  // The unseen-orders dot is refreshed when the window regains focus (PRF-007).
  refetchOnWindowFocus: true,
};

export function useSession() {
  return useQuery(sessionQuery);
}

/** The logged-in account, or null for guests (and while the session is loading). */
export function useAccount(): Account | null {
  const { data } = useSession();
  return data?.authenticated ? data.account : null;
}

function setSession(value: SessionInfo) {
  queryClient.setQueryData(sessionQuery.queryKey, () => value);
}

export function isAuthenticated(): boolean {
  return !!queryClient.getQueryData<SessionInfo>(sessionQuery.queryKey)?.authenticated;
}

const safeReturn = (to: string | null | undefined) => (to && to.startsWith('/') && !to.startsWith('//') ? to : null);

/** Protected routes (AUTH-015): without a session, show the login page and come back afterwards. */
export async function requireAuth({ request }: LoaderFunctionArgs) {
  const s = await queryClient.fetchQuery(sessionQuery);
  if (!s.authenticated) {
    const url = new URL(request.url);
    throw redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return s;
}

/** Login and sign-up pages: an existing session goes straight to the destination. */
export async function guestOnly({ request }: LoaderFunctionArgs) {
  const s = await queryClient.fetchQuery(sessionQuery);
  if (s.authenticated) throw redirect(safeReturn(new URL(request.url).searchParams.get('returnTo')) ?? '/account');
  return null;
}

export function returnToFrom(search: string, fallback = '/'): string {
  return safeReturn(new URLSearchParams(search).get('returnTo')) ?? fallback;
}

// ── Guest data merged into the account (AUTH-012) ────────────────────────────

/** Guest device data sent with login and sign-up. */
export function guestPayload() {
  const d = deviceStore.get();
  return { recentSearches: d.recentSearches };
}

/** Device data that moves to the account at login (the bag and wishlist join in Stage 11). */
const MERGED_PARTS: Parameters<typeof deviceStore.clear>[0] = ['recentSearches'];

interface AuthResult {
  account: Account;
  messages: string[];
  notice: string | null;
}

// The password-change notice (AUTH-010) is shown once, by the layout, after the next login.
let pendingNotice: string | null = null;
const noticeListeners = new Set<() => void>();
export function takeNotice(): string | null {
  const n = pendingNotice;
  pendingNotice = null;
  return n;
}
export function subscribeNotice(cb: () => void) {
  noticeListeners.add(cb);
  return () => noticeListeners.delete(cb);
}

async function afterAuth(out: AuthResult) {
  // Guest data now lives on the account; the device copy is cleared (AUTH-012).
  deviceStore.clear(MERGED_PARTS);
  setSession({ authenticated: true, account: out.account, hasUnseenOrderUpdates: false });
  // Everything cached as a guest (bag, wishlist, recent searches) is refetched for the account.
  await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
  void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
  for (const m of out.messages) toast({ title: m, durationMs: 6000 });
  if (out.notice) {
    pendingNotice = out.notice;
    noticeListeners.forEach((l) => l());
  }
}

export async function login(identifier: string, password: string) {
  const out = await api<AuthResult>('/auth/login', { method: 'POST', body: { identifier, password, guest: guestPayload() } });
  await afterAuth(out);
  return out;
}

export async function signup(body: Record<string, unknown>) {
  const out = await api<AuthResult>('/auth/signup', { method: 'POST', body: { ...body, guest: guestPayload() } });
  await afterAuth(out);
  return out;
}

/** Logout (AUTH-013): revoke the session, then remove all account data from the device. */
export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  queryClient.clear();
  deviceStore.clear(MERGED_PARTS);
  setSession({ authenticated: false });
}

/** Marks the local session as gone (after SESSION_EXPIRED) without calling the API. */
export function markSignedOut() {
  setSession({ authenticated: false, expired: true });
}
