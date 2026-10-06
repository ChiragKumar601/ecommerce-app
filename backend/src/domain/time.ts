// Business dates are IST calendar dates (spec §0, SD-02). Timestamps are stored in UTC.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
export const MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

/** IST calendar date (`YYYY-MM-DD`) of an instant. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Adds whole calendar days to a `YYYY-MM-DD` date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The UTC instant at which an IST calendar date starts. */
export function istStartOfDay(isoDate: string): Date {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - IST_OFFSET_MS);
}

/** Elapsed-time addition (durations are elapsed time, SD-02). */
export function addMs(at: Date, ms: number): Date {
  return new Date(at.getTime() + ms);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Customer-facing date, e.g. "Thu, 8 Oct 2026". */
export function formatIstDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Customer-facing date and time in IST, e.g. "6 Oct 2026, 5:45 pm". */
export function formatIstDateTime(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const h = ist.getUTCHours();
  const m = String(ist.getUTCMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${h12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}
