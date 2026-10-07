import { DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { DateTime } from 'luxon';

/**
 * Returns the current instant. Overridable via DI so tests (and the "now"
 * line / "Up next" / day-strip "today" ring) can run against a fixed time
 * instead of the real clock.
 */
export const CLOCK_NOW = new InjectionToken<() => DateTime>('CLOCK_NOW', {
  factory: () => () => DateTime.now(),
});

/**
 * The timeline's single source of "now" (R4: the now-line, "Up next", and the
 * day strip's today ring). `now` is a signal that ticks every 60s so those
 * surfaces stay current without a manual refresh or a per-row timer.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly nowFn = inject(CLOCK_NOW);
  private readonly _now = signal(this.nowFn());
  readonly now = this._now.asReadonly();

  constructor() {
    const id = setInterval(() => this._now.set(this.nowFn()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
