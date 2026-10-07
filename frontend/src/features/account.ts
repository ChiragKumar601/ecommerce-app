import type { Money } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { queryClient } from '../lib/query';

// Account section data (PRF-001…006). All account queries start with 'me', so logout clears them.

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  securityQuestion: { id: string; text: string } | null;
}

export interface SavedCard {
  id: string;
  nameOnCard: string;
  last4: string;
  network: string;
  issuingBank: string;
  cardType: string;
  label: string;
  expiry: string;
  isDefault: boolean;
  expired: boolean;
}

export interface GiftCard {
  id: string;
  maskedCode: string;
  balance: Money;
  initialBalance: Money;
  status: 'active' | 'exhausted' | 'expired';
  expiresOn: string;
  usable: boolean;
  transactions: { id: string; date: string; description: string; amount: Money; order: { id: string; number: string | null } | null }[];
}

export interface CreditsPage {
  balance: Money;
  entries: { id: string; date: string; description: string; type: string; amount: Money; order: { id: string; number: string | null } | null }[];
  totalCount: number;
  page: number;
  pageCount: number;
}

export interface SupportRequest {
  id: string;
  requestNumber: string;
  typeLabel: string;
  orderId: string | null;
  message: string;
  status: string;
  date: string;
}

export const meKeys = {
  profile: ['me', 'profile'] as const,
  cards: ['me', 'cards'] as const,
  giftCards: ['me', 'gift-cards'] as const,
  credits: (page: number) => ['me', 'credits', page] as const,
  support: ['me', 'support'] as const,
};

export const useProfile = () => useQuery({ queryKey: meKeys.profile, queryFn: () => api<Profile>('/me') });
export const useCards = () => useQuery({ queryKey: meKeys.cards, queryFn: () => api<{ items: SavedCard[] }>('/me/cards') });
export const useGiftCards = () => useQuery({ queryKey: meKeys.giftCards, queryFn: () => api<{ items: GiftCard[] }>('/me/gift-cards') });
export const useCredits = (page: number) => useQuery({ queryKey: meKeys.credits(page), queryFn: () => api<CreditsPage>(`/me/credits?page=${page}`), placeholderData: (p) => p });
export const useSupportRequests = () => useQuery({ queryKey: meKeys.support, queryFn: () => api<{ items: SupportRequest[] }>('/me/support-requests') });

export async function redeemGiftCard(code: string, idempotencyKey: string): Promise<GiftCard> {
  const g = await api<GiftCard>('/me/gift-cards/redeem', { method: 'POST', body: { code }, idempotencyKey });
  await queryClient.invalidateQueries({ queryKey: meKeys.giftCards });
  return g;
}

export async function addCard(body: { nameOnCard: string; number: string; expiry: string; cvv: string }) {
  const r = await api<{ items: SavedCard[] }>('/me/cards', { method: 'POST', body });
  queryClient.setQueryData(meKeys.cards, r);
  return r;
}

export interface DemoHelp {
  cards: { number: string; network: string; bank: string; type: string; outcome: string }[];
  cardNote: string;
  upi: { upiId: string; outcome: string }[];
  upiNote: string;
  giftCards: { code: string; value: Money; validity: string }[];
  returnTags: { tag: string; effect: string }[];
  imageCredits: { url: string; author: string; authorUrl: string | null; licence: string; source: string; provider: string }[];
}
export const demoHelpQuery = { queryKey: ['demo-help'], queryFn: () => api<DemoHelp>('/demo-help'), staleTime: 10 * 60_000 };
