import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ToastItem {
  id: number;
  title: string;
  description?: ReactNode;
  tone?: 'default' | 'success' | 'danger';
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows a toast from anywhere (e.g. "Removed from bag · Undo", BAG-003). */
export function toast(t: Omit<ToastItem, 'id'>): number {
  const id = nextId++;
  items = [...items, { ...t, id }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
}

const icons = { default: Info, success: CheckCircle2, danger: XCircle };

export function Toaster() {
  const list = useToasts();
  return (
    <ToastPrimitive.Provider swipeDirection="down">
      {list.map((t) => {
        const Icon = icons[t.tone ?? 'default'];
        return (
          <ToastPrimitive.Root
            key={t.id}
            duration={t.durationMs ?? (t.action ? 5000 : 4000)}
            onOpenChange={(open) => !open && dismissToast(t.id)}
            className="flex w-full items-start gap-3 rounded-lg bg-ink px-4 py-3 text-white shadow-3 data-[state=open]:animate-slide-up"
          >
            <Icon className={cn('mt-0.5 size-5 shrink-0', t.tone === 'success' && 'text-[#6ee7b7]', t.tone === 'danger' && 'text-[#fca5a5]')} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="font-semibold">{t.title}</ToastPrimitive.Title>
              {t.description && <ToastPrimitive.Description className="mt-0.5 text-small text-white/80">{t.description}</ToastPrimitive.Description>}
            </div>
            {t.action && (
              <ToastPrimitive.Action altText={t.action.label} asChild>
                <button type="button" onClick={t.action.onClick} className="rounded-md px-2 py-1 text-small font-bold uppercase tracking-wide text-[#fda4b8] hover:bg-white/10">
                  {t.action.label}
                </button>
              </ToastPrimitive.Action>
            )}
            <ToastPrimitive.Close aria-label="Dismiss" className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white">
              <X className="size-4" aria-hidden="true" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed bottom-4 left-1/2 z-[70] flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
