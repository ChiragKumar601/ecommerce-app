import { z } from 'zod';
import { V } from './messages.ts';
import { deviceBagLineSchema } from './bag.ts';
import { ageConfirmSchema, emailSchema, identifierSchema, nameSchema, passwordSchema, phoneSchema, securityAnswerSchema } from './fields.ts';

// Auth form schemas (AUTH-001, AUTH-004, AUTH-008/009). The same rules run on the client and the server (VAL-001).

const optional = <T extends z.ZodType>(schema: T) => z.union([z.literal('').transform(() => undefined), schema]).optional();

/** Guest device data sent with login/sign-up for merging (AUTH-012). */
export const guestDataSchema = z
  .object({
    recentSearches: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
    bag: z.array(deviceBagLineSchema).max(50).default([]),
    wishlist: z.array(z.string().min(1).max(64)).max(1000).default([]),
    coupon: z.string().max(20).nullable().default(null),
  })
  .default({ recentSearches: [], bag: [], wishlist: [], coupon: null });

export const signupSchema = z
  .object({
    name: nameSchema,
    email: optional(emailSchema),
    phone: optional(phoneSchema),
    password: passwordSchema,
    confirmPassword: z.string(),
    securityQuestionId: z.string().min(1, 'Choose a security question'),
    securityAnswer: securityAnswerSchema,
    ageConfirmed: ageConfirmSchema,
    guest: guestDataSchema,
  })
  .refine((v) => !!v.email || !!v.phone, { path: ['email'], message: 'Enter an email address or a mobile number' })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: V.passwordMismatch });

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'Enter your password').max(128),
  guest: guestDataSchema,
});

export const resetVerifySchema = z.object({
  identifier: identifierSchema,
  securityQuestionId: z.string().min(1, 'Choose your security question'),
  securityAnswer: securityAnswerSchema,
});

export const resetCompleteSchema = z
  .object({
    resetToken: z.string().min(20).max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: V.passwordMismatch });

export type SignupInput = z.input<typeof signupSchema>;
export type LoginInput = z.input<typeof loginSchema>;
