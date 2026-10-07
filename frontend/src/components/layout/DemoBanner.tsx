import { Info } from 'lucide-react';

/** Non-dismissible demo notice on every page (GLB-001, R-01). */
export function DemoBanner({ text }: { text: string }) {
  return (
    <div role="note" aria-label="Demo notice" className="bg-ink text-white">
      <p className="container-page flex items-center justify-center gap-2 py-2 text-center text-caption font-medium sm:text-small">
        <Info className="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
        <span>{text}</span>
      </p>
    </div>
  );
}
