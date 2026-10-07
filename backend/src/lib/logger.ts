/** Keys whose values are never logged (SEC-002, SEC-003). Matched case-insensitively, at any depth. */
const REDACT = /pass(word)?|answer|card.?number|^number$|pan|cvv|otp|cookie|token|authorization|secret/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? '[redacted]' : redact(v, depth + 1)]),
  );
}

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export interface Logger {
  log(level: Level, msg: string, fields?: Record<string, unknown>): void;
}

/** Structured JSON logger with redaction. */
export function createLogger(minLevel: Level | 'silent' = 'info', sink: (line: string) => void = (l) => process.stdout.write(`${l}\n`)): Logger {
  return {
    log(level, msg, fields = {}) {
      if (ORDER[level] < ORDER[minLevel]) return;
      sink(JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact(fields) as object) }));
    },
  };
}
