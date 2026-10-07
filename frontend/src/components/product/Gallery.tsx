import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';
import { cn } from '../../lib/cn';

type Img = { url: string; alt: string };

/**
 * Product gallery (PDP-001): images in order with thumbnails; selecting an image opens a
 * full-screen viewer with click-to-zoom (pinch on touch), swipe / arrow navigation and Escape.
 */
export function Gallery({ images }: { images: Img[] }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState(false);
  const count = images.length;
  const current = images[index] ?? images[0];
  if (!current) return <div className="aspect-[3/4] rounded-lg bg-surface-muted" />;
  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start lg:self-start">
      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto lg:max-h-[42rem] lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-y-auto" aria-label="Product images">
          {images.map((img, i) => (
            <li key={img.url + i} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${count}`}
                aria-current={i === index ? 'true' : undefined}
                className={cn('block w-16 overflow-hidden rounded-md border-2 lg:w-full', i === index ? 'border-ink' : 'border-transparent opacity-80 hover:opacity-100')}
              >
                <img src={img.url} alt="" width={80} height={107} loading="lazy" className="aspect-[3/4] w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setViewer(true)}
        className="group relative block w-full flex-1 self-start overflow-hidden rounded-lg bg-surface-muted"
        aria-label={`Open full-screen view of image ${index + 1}`}
      >
        <img src={current.url} alt={current.alt} width={720} height={960} fetchPriority="high" className="aspect-[3/4] w-full object-cover" />
        <span className="absolute bottom-3 right-3 flex size-10 items-center justify-center rounded-full bg-surface/90 text-ink shadow-2 opacity-90 transition-opacity group-hover:opacity-100" aria-hidden="true">
          <ZoomIn className="size-5" />
        </span>
      </button>
      <Lightbox open={viewer} onOpenChange={setViewer} images={images} index={index} onIndex={setIndex} />
    </div>
  );
}

function Lightbox({ open, onOpenChange, images, index, onIndex }: { open: boolean; onOpenChange: (o: boolean) => void; images: Img[]; index: number; onIndex: (i: number) => void }) {
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const touch = useRef<number | null>(null);
  const count = images.length;
  const go = (d: number) => {
    setZoom(null);
    onIndex((index + d + count) % count);
  };
  const img = images[index]!;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { setZoom(null); onOpenChange(o); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-ink/95 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[71] flex flex-col text-white outline-none"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(1);
            if (e.key === 'ArrowLeft') go(-1);
          }}
        >
          <div className="flex items-center justify-between p-3 sm:p-4">
            <DialogPrimitive.Title className="text-small font-semibold">Image {index + 1} of {count}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Use the arrow keys to move between images. Select the image to zoom.</DialogPrimitive.Description>
            <DialogPrimitive.Close className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close">
              <X className="size-6" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-6 sm:px-16"
            style={{ touchAction: 'pinch-zoom' }}
            onTouchStart={(e) => (touch.current = e.touches.length === 1 ? (e.touches[0]?.clientX ?? null) : null)}
            onTouchEnd={(e) => {
              const start = touch.current;
              const end = e.changedTouches[0]?.clientX;
              touch.current = null;
              if (!zoom && start !== null && end !== undefined && Math.abs(end - start) > 50) go(end < start ? 1 : -1);
            }}
          >
            <img
              src={img.url}
              alt={img.alt}
              onClick={(e) => {
                if (zoom) return setZoom(null);
                const r = e.currentTarget.getBoundingClientRect();
                setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
              className={cn('max-h-full max-w-full select-none object-contain transition-transform duration-300 ease-standard', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
              style={zoom ? { transform: 'scale(2.2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              draggable={false}
            />
            {count > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute left-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:left-4">
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute right-2 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:right-4">
                  <ChevronRight className="size-6" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
