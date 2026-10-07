import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '../lib/api-client';
import { queryClient } from '../lib/query';
import { useSession } from './session';

// Addresses (spec §6.10). The query key starts with 'me', so logout clears it.

export interface Address {
  id: string;
  recipientName: string;
  recipientPhone: string;
  houseFlat: string;
  building: string;
  streetArea: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  labelType: 'Home' | 'Work' | 'Other';
  labelText: string;
  label: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  serviceable: boolean;
  delivery: { date: string | null; message: string };
  oneLine: string;
}

export interface AddressList {
  items: Address[];
  limit: number;
  atLimit: boolean;
}

export const addressesKey = ['me', 'addresses'] as const;

export function useAddresses() {
  const authed = !!useSession().data?.authenticated;
  return useQuery({ queryKey: addressesKey, queryFn: () => api<AddressList>('/me/addresses'), enabled: authed });
}

export const useStates = () => useQuery({ queryKey: ['states'], queryFn: () => api<{ name: string; type: string }[]>('/states'), staleTime: Infinity });

export async function saveAddress(body: Record<string, unknown>, id?: string): Promise<Address> {
  const a = await api<Address>(id ? `/me/addresses/${id}` : '/me/addresses', { method: id ? 'PATCH' : 'POST', body });
  await queryClient.invalidateQueries({ queryKey: addressesKey });
  return a;
}

export async function addressAction(path: string, method: 'POST' | 'DELETE') {
  queryClient.setQueryData(addressesKey, await api<AddressList>(path, { method }));
}

// The address chosen for delivery from the bag's "Change" (BAG-010, ADDR-008); checkout preselects it.
const SELECTED_KEY = 'wco.selectedAddress';
const listeners = new Set<() => void>();
let selected: string | null = (() => {
  try {
    return sessionStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
})();

export function selectAddress(id: string | null) {
  selected = id;
  try {
    if (id) sessionStorage.setItem(SELECTED_KEY, id);
    else sessionStorage.removeItem(SELECTED_KEY);
  } catch {
    /* in-memory only */
  }
  listeners.forEach((l) => l());
}

export function useSelectedAddressId(): string | null {
  return useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => selected, () => selected);
}

/** The delivery address to show: the one selected this session if it still exists, else the default. */
export function pickDeliveryAddress(list: Address[] | undefined, selectedId: string | null): Address | null {
  if (!list?.length) return null;
  return list.find((a) => a.id === selectedId) ?? list.find((a) => a.isDefault) ?? list[0]!;
}
