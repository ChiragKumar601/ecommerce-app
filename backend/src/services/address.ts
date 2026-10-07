import type { z } from 'zod';
import type { addressSchema } from '@app/shared';
import type { AppContext } from '../api/context.js';
import { AppError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import type { Address } from '../generated/prisma/client.js';
import { checkPincode } from './catalogue/product.js';

// Addresses (spec §6.10; plan S13.1): validation, serviceability, the 10-address limit, default rules.

type AddressInput = z.output<typeof addressSchema>;

export async function addressView(ctx: AppContext, a: Address) {
  const pin = await checkPincode(ctx, a.pincode);
  return {
    id: a.id, recipientName: a.recipientName, recipientPhone: a.recipientPhone, houseFlat: a.houseFlat, building: a.building ?? '',
    streetArea: a.streetArea, landmark: a.landmark ?? '', city: a.city, state: a.state, pincode: a.pincode,
    labelType: a.labelType, labelText: a.labelText ?? '', label: a.labelType === 'Other' ? (a.labelText ?? 'Other') : a.labelType,
    latitude: a.latitude, longitude: a.longitude, isDefault: a.isDefault,
    serviceable: pin.serviceable,
    // CHK-004: "Delivery by <date>" for serviceable addresses; ADDR-004 message otherwise.
    delivery: pin.serviceable ? { date: pin.deliveryDate, message: pin.message } : { date: null, message: `We don't deliver to ${a.pincode} yet` },
    oneLine: [a.houseFlat, a.building, a.streetArea, a.landmark, a.city, `${a.state} ${a.pincode}`].filter(Boolean).join(', '),
  };
}
export type AddressView = Awaited<ReturnType<typeof addressView>>;

export async function listAddresses(ctx: AppContext, accountId: string) {
  const rows = await ctx.db.address.findMany({ where: { accountId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  const max = await ctx.settings.get<number>('addresses.max', 10);
  return { items: await Promise.all(rows.map((a) => addressView(ctx, a))), limit: max, atLimit: rows.length >= max };
}

export async function getOwnAddress(ctx: AppContext, accountId: string, id: string) {
  const a = await ctx.db.address.findFirst({ where: { id, accountId } });
  if (!a) throw new AppError('NOT_FOUND'); // AUTHZ-002
  return a;
}

async function checkState(ctx: AppContext, state: string) {
  const ok = await ctx.db.stateRef.findUnique({ where: { name: state } });
  if (!ok) throw new AppError('VALIDATION_ERROR', { fieldErrors: [{ field: 'state', code: 'invalid', message: 'Select a state' }] });
}

const fields = (d: AddressInput) => ({
  recipientName: d.recipientName, recipientPhone: d.recipientPhone, houseFlat: d.houseFlat, building: d.building || null, streetArea: d.streetArea,
  landmark: d.landmark || null, city: d.city, state: d.state, pincode: d.pincode, labelType: d.labelType,
  labelText: d.labelType === 'Other' ? (d.labelText ?? '').trim() : null,
  latitude: d.latitude ?? null, longitude: d.longitude ?? null,
});

/** Create (ADDR-004, ADDR-006, ADDR-009): unserviceable addresses are saved and flagged; the first becomes the default. */
export async function createAddress(ctx: AppContext, accountId: string, d: AddressInput) {
  await checkState(ctx, d.state);
  const max = await ctx.settings.get<number>('addresses.max', 10);
  const id = newId();
  await ctx.db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { accountId } });
    if (count >= max) throw new AppError('LIMIT_REACHED', { context: 'addresses' });
    await tx.address.create({ data: { id, accountId, ...fields(d), isDefault: count === 0, createdAt: ctx.clock.now() } });
  });
  return addressView(ctx, await getOwnAddress(ctx, accountId, id));
}

/** Edit never touches existing orders: they keep their address snapshot (ADDR-007). */
export async function updateAddress(ctx: AppContext, accountId: string, id: string, d: AddressInput) {
  await getOwnAddress(ctx, accountId, id);
  await checkState(ctx, d.state);
  await ctx.db.address.update({ where: { id }, data: fields(d) });
  return addressView(ctx, await getOwnAddress(ctx, accountId, id));
}

/** Deleting the default makes the most recently added remaining address the default (SD-09, EC-13). */
export async function deleteAddress(ctx: AppContext, accountId: string, id: string) {
  const a = await getOwnAddress(ctx, accountId, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.address.delete({ where: { id } });
    if (a.isDefault) {
      const next = await tx.address.findFirst({ where: { accountId }, orderBy: { createdAt: 'desc' } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  return listAddresses(ctx, accountId);
}

export async function setDefaultAddress(ctx: AppContext, accountId: string, id: string) {
  await getOwnAddress(ctx, accountId, id);
  await ctx.db.$transaction([
    ctx.db.address.updateMany({ where: { accountId, isDefault: true }, data: { isDefault: false } }),
    ctx.db.address.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return listAddresses(ctx, accountId);
}

export async function listStates(ctx: AppContext) {
  return ctx.db.stateRef.findMany({ orderBy: { name: 'asc' }, select: { name: true, type: true } });
}
