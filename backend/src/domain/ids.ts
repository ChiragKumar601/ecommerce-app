import { randomInt, randomUUID } from 'node:crypto';

/** Random, non-guessable id for private resources (SEC-006). */
export const newId = (): string => randomUUID();

const ALNUM_LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ALNUM_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomString(length: number, alphabet: string = ALNUM_LOWER): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}

/** Short public id used in product URLs (`/p/<slug>-<id>`). */
export const shortId = (): string => randomString(10, ALNUM_LOWER);

export const randomUpperAlnum = (length: number): string => randomString(length, ALNUM_UPPER);

/** URL slug from a display name. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
