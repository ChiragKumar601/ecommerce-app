import { useSyncExternalStore } from 'react';

/**
 * Guest device data (FE-003, spec §4.5 GuestDeviceData): bag, wishlist, recent searches and the
 * remembered pincode, in localStorage with a `lastUpdatedAt` and a 30-day expiry (T-57).
 * When storage is unavailable, data lives in memory for this tab and `persistent` is false, so the
 * UI can show "Your bag can't be saved on this device" (EC-18).
 */
export interface DeviceBagLine {
  variantId: string;
  quantity: number;
  addedAt: number;
  lastSeenUnitPrice?: number;
}
export interface DeviceData {
  bag: DeviceBagLine[];
  bagCoupon: string | null;
  wishlist: { productId: string; addedAt: number }[];
  recentSearches: string[];
  pincode: string | null;
  lastUpdatedAt: number;
}

const KEY = 'wco.device.v1';
export const GUEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const empty = (): DeviceData => ({ bag: [], bagCoupon: null, wishlist: [], recentSearches: [], pincode: null, lastUpdatedAt: Date.now() });

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = `${KEY}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function read(s: Storage | null): DeviceData {
  if (!s) return empty();
  try {
    const raw = s.getItem(KEY);
    if (!raw) return empty();
    const d = { ...empty(), ...(JSON.parse(raw) as Partial<DeviceData>) };
    if (Date.now() - d.lastUpdatedAt > GUEST_RETENTION_MS) {
      s.removeItem(KEY);
      return empty();
    }
    return d;
  } catch {
    return empty();
  }
}

class DeviceStore {
  private store = typeof window === 'undefined' ? null : storage();
  private data: DeviceData = read(this.store);
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      // Keep tabs in sync.
      window.addEventListener('storage', (e) => {
        if (e.key !== KEY) return;
        this.data = read(this.store);
        this.emit();
      });
    }
  }

  get persistent(): boolean {
    return this.store !== null;
  }

  get = (): DeviceData => this.data;

  update(fn: (d: DeviceData) => DeviceData): DeviceData {
    this.data = { ...fn(this.data), lastUpdatedAt: Date.now() };
    try {
      this.store?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      this.store = null; // quota or privacy mode: keep working in memory
    }
    this.emit();
    return this.data;
  }

  /** Clears guest data (after a merge into an account, or on logout — AUTH-012/013). */
  clear(parts: (keyof Omit<DeviceData, 'lastUpdatedAt'>)[]) {
    this.update((d) => {
      const next = { ...d };
      const blank = empty();
      for (const p of parts) (next as Record<string, unknown>)[p] = blank[p];
      return next;
    });
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private emit() {
    for (const l of this.listeners) l();
  }
}

export const deviceStore = new DeviceStore();

/** Subscribes a component to one slice of device data. */
export function useDevice<T>(select: (d: DeviceData) => T): T {
  return useSyncExternalStore(deviceStore.subscribe, () => select(deviceStore.get()), () => select(deviceStore.get()));
}
