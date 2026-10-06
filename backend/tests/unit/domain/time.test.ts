import { describe, expect, it } from 'vitest';
import { addDays, addMs, formatIstDate, formatIstDateTime, istDate, istStartOfDay, MS } from '../../../src/domain/time.js';
import { FakeClock } from '../../../src/domain/clock.js';

describe('time (IST, spec §0)', () => {
  it('gives the IST calendar date of an instant', () => {
    expect(istDate(new Date('2026-10-06T18:29:59Z'))).toBe('2026-10-06');
    expect(istDate(new Date('2026-10-06T18:30:00Z'))).toBe('2026-10-07');
  });
  it('adds calendar days across month and year ends', () => {
    expect(addDays('2026-10-30', 4)).toBe('2026-11-03');
    expect(addDays('2026-12-30', 2)).toBe('2027-01-01');
  });
  it('finds the UTC instant an IST day starts', () => {
    expect(istStartOfDay('2026-10-07').toISOString()).toBe('2026-10-06T18:30:00.000Z');
  });
  it('formats customer-facing dates in IST', () => {
    expect(formatIstDate('2026-10-08')).toBe('Thu, 8 Oct 2026');
    expect(formatIstDateTime(new Date('2026-10-06T12:15:00Z'))).toBe('6 Oct 2026, 5:45 pm');
    expect(formatIstDateTime(new Date('2026-10-06T18:45:00Z'))).toBe('7 Oct 2026, 12:15 am');
  });
  it('adds elapsed time and supports a controllable clock', () => {
    const clock = new FakeClock('2026-10-06T00:00:00Z');
    clock.advance(15 * MS.minute);
    expect(clock.now().toISOString()).toBe('2026-10-06T00:15:00.000Z');
    expect(addMs(clock.now(), MS.day).toISOString()).toBe('2026-10-07T00:15:00.000Z');
  });
});
