import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';

// Argon2id with the OWASP-recommended baseline (m=19 MiB, t=2, p=1) (AUTH-007, SEC-002).
const ARGON = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashSecret = (secret: string): Promise<string> => hash(secret, ARGON);

/** A fixed hash verified against when there is no account, so every attempt costs one Argon2 verify (AUTH-008). */
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hash('dummy-password-for-timing-1', ARGON));

export async function verifySecret(storedHash: string | null, secret: string): Promise<boolean> {
  try {
    const ok = await verify(storedHash ?? (await dummyHash()), secret);
    return storedHash !== null && ok;
  } catch {
    return false;
  }
}

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
