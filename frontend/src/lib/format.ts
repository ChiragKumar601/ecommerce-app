/**
 * Display-only ₹ formatting for client-generated labels (e.g. price-slider values). Amounts from
 * the API arrive with a backend-formatted `display` string (API-005); this mirrors that format
 * (SD-01): Indian digit grouping, paise only when non-zero. Parity is checked by tests.
 */
export function formatINR(paise: number): string {
  const sign = paise < 0 ? '−' : '';
  const abs = Math.abs(Math.round(paise));
  const whole = String(Math.floor(abs / 100));
  const fraction = abs % 100;
  const grouped = whole.length <= 3 ? whole : `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}`;
  return `${sign}₹${grouped}${fraction ? `.${String(fraction).padStart(2, '0')}` : ''}`;
}

/** Compact counts for rating badges: 950 → "950", 1234 → "1.2k" (PLP-011). */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.floor(n / 100) / 10;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
}
