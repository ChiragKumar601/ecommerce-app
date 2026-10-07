import { addressSchema } from '@app/shared';
import { MapPinned, PencilLine } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { saveAddress, useStates, type Address } from '../../features/address';
import { useAccount } from '../../features/session';
import { useZodForm } from '../../lib/use-form';
import { Button } from '../ui/button';
import { InlineMessage, Spinner } from '../ui/feedback';
import { RadioGroup } from '../ui/form';
import { FormField, Input, Select } from '../ui/input';
import { Dialog } from '../ui/overlay';
import { toast } from '../ui/toast';
import type { PlaceFill } from './AddressMapStep';

const AddressMapStep = lazy(() => import('./AddressMapStep'));
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const MAP_FAILED = 'Map unavailable — enter your address manually.';

/** Small static map of the chosen pin (ADDR-002); only when there are coordinates and a token. */
function StaticPreview({ lat, lng }: { lat: number; lng: number }) {
  if (!TOKEN) return null;
  const src = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+b3204b(${lng},${lat})/${lng},${lat},15/480x160@2x?access_token=${TOKEN}`;
  return <img src={src} alt="Map showing the chosen location" width={480} height={160} className="h-32 w-full rounded-md object-cover" loading="lazy" />;
}

function DetailsForm({ address, fill, notice, onSaved, onBackToMap }: { address?: Address; fill: PlaceFill | null; notice: string | null; onSaved: (a: Address) => void; onBackToMap?: () => void }) {
  const account = useAccount();
  const states = useStates();
  const coords = fill ? { latitude: fill.latitude, longitude: fill.longitude } : address?.latitude != null ? { latitude: address.latitude, longitude: address.longitude! } : null;
  const f = useZodForm(addressSchema, {
    recipientName: address?.recipientName ?? account?.name ?? '',
    recipientPhone: address?.recipientPhone.replace(/^\+91/, '') ?? account?.phone?.replace(/^\+91/, '') ?? '',
    houseFlat: address?.houseFlat ?? '',
    building: address?.building ?? '',
    streetArea: fill?.streetArea ?? address?.streetArea ?? '',
    landmark: address?.landmark ?? '',
    city: fill?.city ?? address?.city ?? '',
    state: fill?.state ?? address?.state ?? '',
    pincode: fill?.pincode ?? address?.pincode ?? '',
    labelType: (address?.labelType ?? 'Home') as string,
    labelText: address?.labelText ?? '',
  });
  return (
    <form {...f.formProps(async () => {
      const saved = await saveAddress({ ...f.values, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null }, address?.id);
      // ADDR-004: unserviceable addresses are saved, with a notice.
      if (!saved.serviceable) toast({ title: `We don't deliver to ${saved.pincode} yet. You can save this address, but it can't be used for delivery.`, durationMs: 7000 });
      else toast({ title: address ? 'Address updated' : 'Address saved', tone: 'success' });
      onSaved(saved);
    })} className="flex flex-col gap-4">
      {notice && <InlineMessage tone="warning">{notice}</InlineMessage>}
      {coords && (
        <div className="flex flex-col gap-2">
          <StaticPreview lat={coords.latitude} lng={coords.longitude} />
          {onBackToMap && <Button type="button" variant="link" size="sm" className="self-start" onClick={onBackToMap}>Move the pin</Button>}
        </div>
      )}
      {f.formError && <InlineMessage>{f.formError}</InlineMessage>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Recipient name" error={f.errors['recipientName']} required><Input {...f.field('recipientName')} autoComplete="name" /></FormField>
        <FormField label="Recipient phone" error={f.errors['recipientPhone']} required><Input {...f.field('recipientPhone')} type="tel" autoComplete="tel-national" /></FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="House / flat" error={f.errors['houseFlat']} required><Input {...f.field('houseFlat')} autoComplete="address-line1" /></FormField>
        <FormField label="Building" error={f.errors['building']}><Input {...f.field('building')} /></FormField>
      </div>
      <FormField label="Street / area" error={f.errors['streetArea']} required><Input {...f.field('streetArea')} autoComplete="address-line2" /></FormField>
      <FormField label="Landmark" error={f.errors['landmark']}><Input {...f.field('landmark')} /></FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="City" error={f.errors['city']} required><Input {...f.field('city')} autoComplete="address-level2" /></FormField>
        <FormField label="State" error={f.errors['state']} required>
          <Select {...f.field('state')}>
            <option value="">Select a state</option>
            {states.data?.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Pincode" error={f.errors['pincode']} required><Input {...f.field('pincode')} inputMode="numeric" maxLength={6} autoComplete="postal-code" /></FormField>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-small font-semibold">Save as</legend>
        <RadioGroup value={f.values.labelType} onValueChange={(v) => f.set('labelType', v)} options={[{ value: 'Home', label: 'Home' }, { value: 'Work', label: 'Work' }, { value: 'Other', label: 'Other' }]} className="flex-row gap-5" aria-label="Address label" />
        {f.values.labelType === 'Other' && (
          <FormField label="Label" error={f.errors['labelText']} required><Input {...f.field('labelText')} maxLength={20} placeholder="e.g. Parents' home" /></FormField>
        )}
      </fieldset>
      <Button type="submit" size="lg" loading={f.submitting}>{address ? 'Save changes' : 'Save address'}</Button>
    </form>
  );
}

/**
 * Add / edit address flow (ADDR-001…008): map step, then details step. The "Enter address manually"
 * link is always visible on the map step; map failures open the manual details step with a message.
 * Usable from Saved Addresses, the bag's "Change" and checkout (ADDR-008).
 */
export function AddressDialog({ open, onOpenChange, address, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; address?: Address; onSaved?: (a: Address) => void }) {
  const [step, setStep] = useState<'map' | 'details'>(TOKEN ? 'map' : 'details');
  const [fill, setFill] = useState<PlaceFill | null>(null);
  const [notice, setNotice] = useState<string | null>(TOKEN ? null : MAP_FAILED);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={address ? 'Edit address' : 'Add a new address'} className="max-w-2xl">
      {step === 'map' ? (
        <div className="flex flex-col gap-3">
          <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner label="Loading map" /></div>}>
            <AddressMapStep
              initial={address?.latitude != null ? { latitude: address.latitude, longitude: address.longitude! } : null}
              onConfirm={(p) => { setFill(p); setStep('details'); }}
              onFail={() => { setNotice(MAP_FAILED); setStep('details'); }}
            />
          </Suspense>
          <button type="button" onClick={() => setStep('details')} className="inline-flex items-center gap-1.5 self-center text-small font-semibold text-brand hover:underline">
            <PencilLine className="size-4" aria-hidden="true" />Enter address manually
          </button>
        </div>
      ) : (
        <DetailsForm
          address={address}
          fill={fill}
          notice={notice}
          onBackToMap={TOKEN && !notice ? () => setStep('map') : undefined}
          onSaved={(a) => { onSaved?.(a); onOpenChange(false); }}
        />
      )}
      {step === 'details' && TOKEN && notice && (
        <button type="button" onClick={() => { setNotice(null); setStep('map'); }} className="mt-3 inline-flex items-center gap-1.5 text-small font-semibold text-ink-muted hover:text-ink">
          <MapPinned className="size-4" aria-hidden="true" />Try the map again
        </button>
      )}
    </Dialog>
  );
}
