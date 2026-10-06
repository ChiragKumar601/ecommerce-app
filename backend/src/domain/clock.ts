/** Injectable clock so time-driven rules can be tested (plan §3.2). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A controllable clock for tests. */
export class FakeClock implements Clock {
  private current: number;
  constructor(start: Date | string = '2026-10-06T06:30:00.000Z') {
    this.current = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
  set(at: Date | string): void {
    this.current = new Date(at).getTime();
  }
}
