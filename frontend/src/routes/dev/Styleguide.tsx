import { Heart, Search, ShoppingBag } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Accordion, Badge, Breadcrumbs, Button, Card, CardBody, CardHeader, Checkbox, Chip, ConfirmDialog, EmptyState, ErrorState, FormField,
  IconButton, InlineMessage, Input, PageHeader, PageLayout, PriceTag, QuantityStepper, RadioGroup, RangeSlider, RatingBadge, Select, Sheet,
  Skeleton, Spinner, Stepper, Switch, Tabs, Textarea, toast, Tooltip,
} from '../../components/ui';
import { formatINR } from '../../lib/format';

const money = (p: number) => ({ paise: p, display: formatINR(p) });

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-6">
      <CardHeader><h2 className="text-h4 font-semibold">{title}</h2></CardHeader>
      <CardBody className="flex flex-wrap items-start gap-4">{children}</CardBody>
    </Card>
  );
}

/** Dev-only catalogue of every primitive and state (plan §8.5 verification). Not in production builds. */
export function Styleguide() {
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [qty, setQty] = useState(2);
  const [range, setRange] = useState<[number, number]>([500, 4000]);
  return (
    <PageLayout>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Dev' }, { label: 'Styleguide' }]} />
      <PageHeader title="Styleguide" subtitle="Tokens and components used across every route." />
      <Block title="Typography">
        <div className="space-y-2">
          <p className="text-display font-bold">Display</p>
          <p className="text-h1 font-bold">Heading 1</p>
          <p className="text-h2 font-bold">Heading 2</p>
          <p className="text-h3 font-semibold">Heading 3</p>
          <p className="text-h4 font-semibold">Heading 4</p>
          <p className="text-body">Body — The quick brown fox jumps over the lazy dog.</p>
          <p className="text-small text-ink-soft">Small — secondary information.</p>
          <p className="text-caption text-ink-muted">Caption — tertiary detail.</p>
        </div>
      </Block>
      <Block title="Colour">
        {['bg-ink', 'bg-ink-soft', 'bg-brand', 'bg-sale', 'bg-success', 'bg-warning', 'bg-danger', 'bg-info', 'bg-surface-muted', 'bg-line-strong'].map((c) => (
          <div key={c} className="text-center text-caption"><div className={`${c} size-14 rounded-md border border-line`} />{c.replace('bg-', '')}</div>
        ))}
      </Block>
      <Block title="Buttons">
        <Button>Primary</Button>
        <Button variant="brand">Brand</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button variant="danger">Danger</Button>
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <IconButton label="Search"><Search className="size-5" /></IconButton>
        <IconButton label="Wishlist" variant="secondary"><Heart className="size-5" /></IconButton>
        <Tooltip content="Your bag"><IconButton label="Bag"><ShoppingBag className="size-5" /></IconButton></Tooltip>
      </Block>
      <Block title="Form controls">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <FormField label="Email" hint="We never share it." required><Input placeholder="you@example.com" /></FormField>
          <FormField label="Pincode" error="Enter a valid 6-digit pincode"><Input defaultValue="0123" /></FormField>
          <FormField label="State"><Select defaultValue=""><option value="" disabled>Select a state</option><option>Karnataka</option></Select></FormField>
          <FormField label="Message"><Textarea placeholder="Describe your issue" /></FormField>
        </div>
        <Checkbox label="I am 18 or older" />
        <Switch label="Use credits (₹500 available)" />
        <RadioGroup defaultValue="card" options={[{ value: 'card', label: 'Card' }, { value: 'upi', label: 'UPI' }, { value: 'cod', label: 'Cash on Delivery', disabled: true }]} />
        <div className="w-64">
          <RangeSlider min={0} max={10000} step={100} value={range} onValueChange={setRange} labels={['Minimum price', 'Maximum price']} />
          <p className="mt-2 text-small text-ink-muted">{formatINR(range[0] * 100)} – {formatINR(range[1] * 100)}</p>
        </div>
      </Block>
      <Block title="Badges and chips">
        <Badge>Neutral</Badge><Badge tone="brand">Best seller</Badge><Badge tone="success">In stock</Badge><Badge tone="warning">Only 2 left</Badge>
        <Badge tone="danger">Out of stock</Badge><Badge tone="solid">New</Badge><Badge tone="outline">Free size</Badge>
        <Chip onRemove={() => undefined}>Brand: Northlane</Chip><Chip onRemove={() => undefined}>₹500–₹2,000</Chip>
      </Block>
      <Block title="Commerce">
        <PriceTag price={money(99900)} mrp={money(149900)} discountPercent={33} />
        <PriceTag price={money(279900)} mrp={money(399900)} discountPercent={30} size="lg" />
        <PriceTag price={money(71900)} />
        <RatingBadge average={4.3} count={1234} />
        <QuantityStepper value={qty} max={10} onChange={setQty} />
        <Stepper steps={['Address', 'Summary', 'Payment']} current={1} />
      </Block>
      <Block title="Messages and states">
        <InlineMessage tone="danger">Incorrect email/phone or password.</InlineMessage>
        <InlineMessage tone="success">Address saved.</InlineMessage>
        <InlineMessage tone="info">Delivery by Thu, 8 Oct 2026.</InlineMessage>
        <InlineMessage tone="warning">Only 2 left.</InlineMessage>
        <Spinner />
        <div className="w-48 space-y-2"><Skeleton className="aspect-[3/4] w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
        <EmptyState title="Your bag is empty" description="Add items you love to your bag." action={<Button>Continue shopping</Button>} />
        <ErrorState message="Something went wrong. Please try again." onRetry={() => undefined} />
      </Block>
      <Block title="Overlays and disclosure">
        <Button variant="secondary" onClick={() => setConfirm(true)}>Confirm dialog</Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>Sheet</Button>
        <Button variant="secondary" onClick={() => toast({ title: 'Removed from bag', action: { label: 'Undo', onClick: () => undefined } })}>Toast with undo</Button>
        <Button variant="secondary" onClick={() => toast({ title: 'Added to wishlist', tone: 'success' })}>Success toast</Button>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Log out?" confirmLabel="Log out" onConfirm={() => setConfirm(false)} />
        <Sheet open={sheet} onOpenChange={setSheet} title="Filters" footer={<><Button variant="secondary" block>Clear</Button><Button block>Apply</Button></>}>
          <p className="text-ink-muted">Sheet content.</p>
        </Sheet>
        <div className="w-full">
          <Tabs tabs={[{ value: 'a', label: 'Description', content: 'Product description.' }, { value: 'b', label: 'Material & care', content: 'Machine wash cold.' }]} />
          <Accordion items={[{ value: 'one', title: 'How do I track my order?', content: 'From Profile › Orders.' }, { value: 'two', title: 'Can I cancel?', content: 'Before it ships.' }]} />
        </div>
      </Block>
    </PageLayout>
  );
}
