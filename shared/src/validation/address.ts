import { z } from 'zod';
import { V } from './messages.ts';
import { citySchema, nameSchema, optionalLineSchema, phoneSchema, pincodeSchema, requiredLineSchema, stateSchema } from './fields.ts';

/** Address details step (ADDR-002, §12). The state must be one of the reference list (checked by the server). */
export const addressSchema = z
  .object({
    recipientName: nameSchema,
    recipientPhone: phoneSchema,
    houseFlat: requiredLineSchema,
    building: optionalLineSchema,
    streetArea: requiredLineSchema,
    landmark: optionalLineSchema,
    city: citySchema,
    state: stateSchema,
    pincode: pincodeSchema,
    labelType: z.enum(['Home', 'Work', 'Other'], { error: V.label }),
    labelText: z.string().trim().max(20, V.label).optional().or(z.literal('')),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine((v) => v.labelType !== 'Other' || (v.labelText ?? '').trim().length > 0, { path: ['labelText'], message: V.label });

export type AddressInput = z.input<typeof addressSchema>;
