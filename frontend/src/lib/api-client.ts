import type { ErrorCode, ErrorEnvelope, FieldError, QuoteChange } from '@app/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const GENERIC = 'Something went wrong. Please try again.';

/** An API failure carrying the §13 envelope; `message` is always customer-safe (GLB-003). */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors: FieldError[];
  readonly changes: QuoteChange[];
  readonly details: Record<string, unknown>;
  readonly retryAfterSeconds?: number;
  constructor(status: number, env: ErrorEnvelope) {
    super(env.message || GENERIC);
    this.name = 'ApiError';
    this.status = status;
    this.code = env.code;
    this.fieldErrors = env.fieldErrors ?? [];
    this.changes = env.changes ?? [];
    this.details = env.details ?? {};
    this.retryAfterSeconds = env.retryAfterSeconds;
  }
  /** Field error message for one form field, if any. */
  field(name: string): string | undefined {
    return this.fieldErrors.find((f) => f.field === name)?.message;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Reuse the same key when retrying the same action (API-003, PR-21). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

type UnauthorizedHandler = (err: ApiError, retry: () => Promise<unknown>) => Promise<unknown> | null;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registered by the session layer (Stage 10): opens the login dialog and retries (AUTH-011). */
export function setUnauthorizedHandler(h: UnauthorizedHandler | null) {
  onUnauthorized = h;
}

export const newIdempotencyKey = () => crypto.randomUUID();

/** JSON request to the backend through the same-origin proxy (plan §7.1). */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const run = async (): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: opts.method ?? 'GET',
        credentials: 'same-origin',
        signal: opts.signal,
        headers: {
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ApiError(0, { code: 'INTERNAL_ERROR', message: GENERIC });
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const env = (data && typeof data === 'object' && 'code' in data ? data : { code: 'INTERNAL_ERROR', message: GENERIC }) as ErrorEnvelope;
      throw new ApiError(res.status, env);
    }
    return data as T;
  };
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && e.code === 'SESSION_EXPIRED' && onUnauthorized) {
      const retried = onUnauthorized(e, run);
      if (retried) return (await retried) as T;
    }
    throw e;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Customer-facing message for any thrown error. */
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : GENERIC;
}
