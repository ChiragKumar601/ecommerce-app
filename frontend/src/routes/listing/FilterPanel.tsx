import { useId, useState, type ReactNode } from 'react';
import type { FacetValue, ListingFacets, ListingScope } from '@app/shared';
import { Checkbox, Input, RangeSlider, Switch } from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatINR } from '../../lib/format';
import { getList, setList, setParam, type ListKey } from '../../features/listing/params';

const VISIBLE = 8;

function Group({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  const id = useId();
  return (
    <section className="border-b border-line py-5 first:pt-0 last:border-b-0" aria-labelledby={id}>
      <h3 id={id} className="mb-3 flex items-center justify-between text-caption font-bold uppercase tracking-wider text-ink">
        {title}
        {count ? <span className="rounded-full bg-ink px-1.5 py-0.5 text-caption leading-none text-white">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function CheckList({ values, selected, onChange, searchable }: { values: FacetValue[]; selected: string[]; onChange: (next: string[]) => void; searchable?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [term, setTerm] = useState('');
  const filtered = term ? values.filter((v) => v.label.toLowerCase().includes(term.toLowerCase())) : values;
  const shown = expanded || term ? filtered : filtered.slice(0, VISIBLE);
  const toggle = (v: string, on: boolean) => onChange(on ? [...selected, v] : selected.filter((x) => x !== v));
  return (
    <div>
      {searchable && values.length > VISIBLE && (
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search ${searchable}`} aria-label={`Search ${searchable}`} className="mb-3 h-9 text-small" />
      )}
      <ul className="space-y-1">
        {shown.map((v) => (
          <li key={v.value} className="flex items-center justify-between gap-2">
            <Checkbox
              checked={selected.includes(v.value)}
              onCheckedChange={(c) => toggle(v.value, c === true)}
              disabled={v.count === 0 && !selected.includes(v.value)}
              label={<span className="text-small">{v.label}</span>}
              className="min-h-9 flex-1"
            />
            <span className="tabular text-caption text-ink-muted">{v.count.toLocaleString('en-IN')}</span>
          </li>
        ))}
      </ul>
      {!term && filtered.length > VISIBLE && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-2 min-h-9 text-small font-semibold text-brand hover:underline">
          {expanded ? 'Show less' : `+ ${filtered.length - VISIBLE} more`}
        </button>
      )}
    </div>
  );
}

function RadioList({ name, values, selected, onChange }: { name: string; values: FacetValue[]; selected: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-1" role="radiogroup" aria-label={name}>
      {values.map((v) => {
        const active = selected === v.value;
        return (
          <div key={v.value}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active ? null : v.value)}
              className="flex min-h-9 w-full items-center justify-between gap-2 rounded-sm text-left text-small"
            >
              <span className="flex items-center gap-2.5">
                <span className={cn('flex size-[1.125rem] items-center justify-center rounded-full border', active ? 'border-ink' : 'border-line-strong')} aria-hidden="true">
                  {active && <span className="size-2.5 rounded-full bg-ink" />}
                </span>
                {v.label}
              </span>
              <span className="tabular text-caption text-ink-muted">{v.count.toLocaleString('en-IN')}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SizeGrid({ values, selected, onChange }: { values: FacetValue[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? values : values.slice(0, 18);
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {shown.map((v) => {
          const on = selected.includes(v.value);
          return (
            <li key={v.value}>
              <button
                type="button"
                aria-pressed={on}
                disabled={v.count === 0 && !on}
                onClick={() => onChange(on ? selected.filter((x) => x !== v.value) : [...selected, v.value])}
                className={cn(
                  'h-9 min-w-11 rounded-full border px-3 text-small font-medium transition-colors duration-150',
                  on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:border-ink',
                  'disabled:opacity-40',
                )}
                aria-label={`Size ${v.value}, ${v.count} products`}
              >
                {v.label}
              </button>
            </li>
          );
        })}
      </ul>
      {values.length > 18 && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-2 min-h-9 text-small font-semibold text-brand hover:underline">
          {expanded ? 'Show less' : `+ ${values.length - 18} more`}
        </button>
      )}
    </div>
  );
}

function PriceFilter({ bounds, params, onChange }: { bounds: { min: number; max: number }; params: URLSearchParams; onChange: (p: URLSearchParams) => void }) {
  const lo = Number(params.get('priceMin') ?? bounds.min);
  const hi = Number(params.get('priceMax') ?? bounds.max);
  const [value, setValue] = useState<[number, number]>([Math.max(bounds.min, Math.min(lo, bounds.max)), Math.min(bounds.max, Math.max(hi, bounds.min))]);
  const [text, setText] = useState<[string, string]>([String(value[0]), String(value[1])]);

  const commit = ([a, b]: [number, number]) => {
    const min = Math.max(0, Math.min(a, b));
    const max = Math.max(a, b);
    let next = setParam(params, 'priceMin', min > bounds.min ? String(min) : null);
    next = setParam(next, 'priceMax', max < bounds.max ? String(max) : null);
    onChange(next);
  };
  const commitText = () => {
    const a = Number(text[0] || bounds.min);
    const b = Number(text[1] || bounds.max);
    if (a !== value[0] || b !== value[1]) commit([a, b]);
  };
  const step = bounds.max - bounds.min > 5000 ? 100 : 10;
  if (bounds.max <= bounds.min) return <p className="text-small text-ink-muted">{formatINR(bounds.min * 100)}</p>;
  return (
    <div>
      <RangeSlider min={bounds.min} max={bounds.max} step={step} value={value} onValueChange={(v) => { setValue(v); setText([String(v[0]), String(v[1])]); }} onValueCommit={commit} labels={['Minimum price', 'Maximum price']} />
      <div className="mt-4 flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Minimum price in rupees</span>
          <Input inputMode="numeric" value={text[0]} onChange={(e) => setText([e.target.value.replace(/\D/g, ''), text[1]])} onBlur={commitText} onKeyDown={(e) => e.key === 'Enter' && commitText()} className="h-9 text-small" />
        </label>
        <span className="text-ink-muted" aria-hidden="true">–</span>
        <label className="flex-1">
          <span className="sr-only">Maximum price in rupees</span>
          <Input inputMode="numeric" value={text[1]} onChange={(e) => setText([text[0], e.target.value.replace(/\D/g, '')])} onBlur={commitText} onKeyDown={(e) => e.key === 'Enter' && commitText()} className="h-9 text-small" />
        </label>
      </div>
    </div>
  );
}

/** Every facet the listing returned, in a fixed order (PLP-002). Facets missing from the response are hidden. */
export function FilterPanel({ facets, params, onChange, scope }: { facets: ListingFacets; params: URLSearchParams; onChange: (p: URLSearchParams) => void; scope: ListingScope }) {
  const list = (key: ListKey, title: string, values: FacetValue[] | undefined, searchable?: string) =>
    values && (
      <Group title={title} count={getList(params, key).length}>
        <CheckList values={values} selected={getList(params, key)} onChange={(next) => onChange(setList(params, key, next))} searchable={searchable} />
      </Group>
    );
  return (
    <div>
      {facets.inStock && (
        <Group title="Availability">
          <Switch label="In-stock only" checked={params.get('inStock') === '1'} onCheckedChange={(on) => onChange(setParam(params, 'inStock', on ? '1' : null))} />
        </Group>
      )}
      {scope === 'bank-offer' && (
        <Group title="Offer">
          <Switch label="HDFC Bank offer eligible" checked={params.get('bankOffer') !== '0'} onCheckedChange={(on) => onChange(setParam(params, 'bankOffer', on ? null : '0'))} />
        </Group>
      )}
      {list('category', 'Category', facets.category, 'categories')}
      {list('gender', 'Gender', facets.gender)}
      {list('brand', 'Brand', facets.brand, 'brands')}
      {facets.price && (
        <Group title="Price">
          {/* Remounts when the URL or bounds change, so local slider state never goes stale. */}
          <PriceFilter key={`${params.get('priceMin')}-${params.get('priceMax')}-${facets.price.min}-${facets.price.max}`} bounds={facets.price} params={params} onChange={onChange} />
        </Group>
      )}
      {list('colour', 'Colour', facets.colour, 'colours')}
      {facets.discount && (
        <Group title="Discount">
          <RadioList name="Discount" values={facets.discount} selected={params.get('discount')} onChange={(v) => onChange(setParam(params, 'discount', v))} />
        </Group>
      )}
      {facets.size && (
        <Group title="Size" count={getList(params, 'size').length}>
          <SizeGrid values={facets.size} selected={getList(params, 'size')} onChange={(next) => onChange(setList(params, 'size', next))} />
        </Group>
      )}
      {facets.rating && (
        <Group title="Customer rating">
          <RadioList name="Customer rating" values={facets.rating} selected={params.get('rating')} onChange={(v) => onChange(setParam(params, 'rating', v))} />
        </Group>
      )}
    </div>
  );
}
