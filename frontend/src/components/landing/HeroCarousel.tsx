import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';

export interface HeroSlide {
  id: string;
  image: { url: string; alt: string };
  headline: string;
  subheadline: string | null;
  ctaLabel: string;
  href: string;
}

const AUTOPLAY_MS = 5000;

/**
 * Accessible hero carousel (LND-002, R-38): autoplays every 5 s; pauses on hover, on keyboard
 * focus inside it, and via Pause; visible Previous / Next / Pause-Play controls; each slide links to
 * its href. The first image is the LCP element, so it loads eagerly with high priority (FE-006).
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = slides.length;
  const playing = count > 1 && !userPaused && !hovered && !focused;
  const touch = useRef<number | null>(null);

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => go(1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, go]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured collections"
      className="relative overflow-hidden rounded-xl bg-surface-sunken"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touch.current;
        const end = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (start !== null && end !== undefined && Math.abs(end - start) > 40) go(end < start ? 1 : -1);
      }}
    >
      <div className="relative aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/8]" aria-live={playing ? 'off' : 'polite'}>
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${s.headline}`}
              aria-hidden={!active}
              inert={!active}
              className={cn('absolute inset-0 transition-opacity duration-700 ease-standard motion-reduce:transition-none', active ? 'z-10 opacity-100' : 'z-0 opacity-0')}
            >
              <Link to={s.href} className="group absolute inset-0 block focus-visible:outline-offset-[-4px]">
                <img
                  src={s.image.url}
                  alt=""
                  width={1600}
                  height={610}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : 'low'}
                  decoding={i === 0 ? 'sync' : 'async'}
                  className="size-full object-cover object-[50%_25%] transition-transform duration-[6000ms] ease-out group-hover:scale-[1.02] motion-reduce:transition-none"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent sm:bg-gradient-to-r sm:from-ink/75 sm:via-ink/30" aria-hidden="true" />
                <span className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-5 pb-16 text-white sm:inset-y-0 sm:max-w-xl sm:justify-center sm:p-10 lg:p-14">
                  <span className="text-h1 font-bold leading-tight sm:text-display">{s.headline}</span>
                  {s.subheadline && <span className="max-w-md text-body text-white/90 sm:text-h4 sm:font-normal">{s.subheadline}</span>}
                  <span className="mt-2 inline-flex h-11 items-center rounded-md bg-white px-5 text-body font-semibold text-ink shadow-2 transition-transform duration-200 group-hover:-translate-y-0.5">
                    {s.ctaLabel}
                  </span>
                </span>
              </Link>
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 sm:bottom-5 sm:right-5">
          <div className="mr-1 hidden items-center gap-1.5 sm:flex" role="group" aria-label="Choose slide">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                className="flex size-6 items-center justify-center"
              >
                <span className={cn('h-1.5 rounded-full bg-white transition-all duration-300', i === index ? 'w-6' : 'w-1.5 opacity-60')} />
              </button>
            ))}
          </div>
          <CtrlButton label="Previous slide" onClick={() => go(-1)}><ChevronLeft className="size-5" aria-hidden="true" /></CtrlButton>
          <CtrlButton label={userPaused ? 'Play slideshow' : 'Pause slideshow'} onClick={() => setUserPaused((p) => !p)}>
            {userPaused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
          </CtrlButton>
          <CtrlButton label="Next slide" onClick={() => go(1)}><ChevronRight className="size-5" aria-hidden="true" /></CtrlButton>
        </div>
      )}
    </section>
  );
}

function CtrlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full bg-surface/90 text-ink shadow-2 backdrop-blur transition-colors duration-150 hover:bg-surface"
    >
      {children}
    </button>
  );
}
