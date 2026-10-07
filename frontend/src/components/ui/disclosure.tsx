import { ChevronDown } from 'lucide-react';
import { Accordion as AccordionPrimitive, Slider as SliderPrimitive, Tabs as TabsPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Tabs({ tabs, defaultValue, className }: { tabs: { value: string; label: ReactNode; content: ReactNode }[]; defaultValue?: string; className?: string }) {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue ?? tabs[0]?.value} className={className}>
      <TabsPrimitive.List className="flex gap-6 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger key={t.value} value={t.value} className="-mb-px whitespace-nowrap border-b-2 border-transparent py-3 text-body font-semibold text-ink-muted transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink">
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((t) => (
        <TabsPrimitive.Content key={t.value} value={t.value} className="pt-5 focus-visible:outline-none">
          {t.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

export function Accordion({ items, type = 'multiple', defaultOpen, className }: { items: { value: string; title: ReactNode; content: ReactNode }[]; type?: 'single' | 'multiple'; defaultOpen?: string[]; className?: string }) {
  const content = items.map((it) => (
    <AccordionPrimitive.Item key={it.value} value={it.value} className="border-b border-line">
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between py-4 text-left text-body font-semibold">
          {it.title}
          <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="pb-4 text-ink-soft">{it.content}</AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  ));
  return type === 'single' ? (
    <AccordionPrimitive.Root type="single" collapsible defaultValue={defaultOpen?.[0]} className={className}>{content}</AccordionPrimitive.Root>
  ) : (
    <AccordionPrimitive.Root type="multiple" defaultValue={defaultOpen} className={className}>{content}</AccordionPrimitive.Root>
  );
}

/** Two-thumb range slider (PLP-002 price filter). */
export function RangeSlider({ min, max, step = 1, value, onValueChange, onValueCommit, labels }: {
  min: number; max: number; step?: number; value: [number, number]; onValueChange: (v: [number, number]) => void; onValueCommit?: (v: [number, number]) => void; labels: [string, string];
}) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-6 w-full touch-none select-none items-center"
      min={min}
      max={max}
      step={step}
      value={value}
      minStepsBetweenThumbs={1}
      onValueChange={(v) => onValueChange([v[0]!, v[1]!])}
      onValueCommit={(v) => onValueCommit?.([v[0]!, v[1]!])}
    >
      <SliderPrimitive.Track className="relative h-1 grow rounded-full bg-line-strong">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-ink" />
      </SliderPrimitive.Track>
      {labels.map((label) => (
        <SliderPrimitive.Thumb key={label} aria-label={label} className="block size-5 rounded-full border-2 border-ink bg-surface shadow-1 transition-transform hover:scale-110" />
      ))}
    </SliderPrimitive.Root>
  );
}

export { cn };
