import type { Money } from '@app/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

// Orders (spec §6.16, §6.17). Detail polls while the order is still moving, so status changes show up.

export interface OrderListItem {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
  headline: string;
  image: { url: string; alt: string } | null;
  firstItem: string;
  moreCount: number;
  units: number;
  total: Money;
  hasUnseenUpdate: boolean;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  headline: string;
  date: string;
  contactPhone: string;
  address: { recipientName: string; oneLine: string; recipientPhone: string; label: string };
  expectedDelivery: string | null;
  lines: { id: string; name: string; brand: string; size: string; href: string; image: { url: string; alt: string } | null; quantity: number; unitPrice: Money; lineNetPaid: Money; lineState: string; returnable: boolean }[];
  amounts: { totalMrp: Money; discountOnMrp: Money; couponDiscount: Money; couponCode: string | null; bankOfferDiscount: Money; deliveryCharge: Money; total: Money; taxText: string };
  payment: { methods: { source: string; label: string; amount: Money; status: string }[]; paidOnline: Money; giftCard: Money; credits: Money; codDue: Money | null; codCollected: Money | null };
  retry: { endsAt: string; minutesLeft: number; canRetry: boolean } | null;
  timeline: { status: string; label: string; at: string; actor: string; note: string | null }[];
  tracking: { courier: string; trackingId: string | null } | null;
  deliveryOtp: string | null;
  simulator: { attempt: number; triesLeft: number; locked: boolean; windowEndsAt: string | null } | null;
  deliveredAt: string | null;
  progress: { steps: { status: string; label: string }[]; current: number };
  hasUnseenUpdate: boolean;
}

const TERMINAL = ['DELIVERED', 'FAILED', 'CANCELLED', 'REJECTED_AT_DELIVERY', 'RETURNED_TO_ORIGIN'];
export const orderKey = (id: string) => ['order', id] as const;

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKey(id),
    queryFn: () => api<OrderDetail>(`/orders/${id}`),
    refetchInterval: (q) => (q.state.data && !TERMINAL.includes(q.state.data.status) ? 3000 : false),
    refetchOnWindowFocus: true,
  });
}

export function useOrders() {
  return useInfiniteQuery({
    queryKey: ['orders', 'list'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<{ items: OrderListItem[]; totalCount: number; page: number; pageCount: number }>(`/orders?page=${pageParam}`),
    getNextPageParam: (last) => (last.page < last.pageCount ? last.page + 1 : undefined),
    refetchOnWindowFocus: true,
  });
}
