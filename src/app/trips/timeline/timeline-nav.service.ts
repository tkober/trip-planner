import { Injectable, signal } from '@angular/core';

/** One chip in the mobile day strip, including the virtual departure/return days. */
export interface NavDay {
  /** The day's destination-tz ISO date, or 'virtual-leading' / 'virtual-trailing'. */
  key: string;
  /** Weekday short ("Thu"), or "Dep." / "Ret." for the virtual days. */
  topLabel: string;
  /** Day-of-month number, e.g. "9". */
  dayNum: string;
  /** Destination-tz "today" (never true for a virtual day). */
  isToday: boolean;
}

/**
 * Root service bridging the timeline (which knows the days, including the
 * virtual departure/return ones) and the trip shell's mobile day strip (which
 * renders them in the app bar, on the Timeline route only). `TimelineView`
 * publishes `days` whenever it renders on screen — never for the plan export
 * (`tripOverride`/`exportMode`) — and clears it on destroy so the strip
 * disappears on every other route.
 *
 * Also owns the scroll-spy: each day header registers its element here, and a
 * single passive `scroll` listener (rAF-throttled) picks the header currently
 * sitting at/just below the app bar as `activeKey`.
 */
@Injectable({ providedIn: 'root' })
export class TimelineNavService {
  readonly days = signal<NavDay[]>([]);
  readonly activeKey = signal<string | null>(null);

  private readonly headers = new Map<string, HTMLElement>();
  private scrollHandler: (() => void) | null = null;
  private rafPending = false;

  publish(days: NavDay[]): void {
    this.days.set(days);
  }

  /** Called by `TimelineView` on destroy (navigating off the timeline route). */
  clear(): void {
    this.days.set([]);
    this.activeKey.set(null);
    this.headers.clear();
    this.stopSpy();
  }

  registerHeader(key: string, el: HTMLElement): void {
    this.headers.set(key, el);
    this.ensureSpy();
    this.updateActive();
  }

  unregisterHeader(key: string): void {
    this.headers.delete(key);
  }

  /** Scroll the page so `key`'s header sits right under the app bar. */
  scrollTo(key: string): void {
    const el = this.headers.get(key);
    if (!el) return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  private ensureSpy(): void {
    if (this.scrollHandler || typeof window === 'undefined') return;
    this.scrollHandler = () => {
      if (this.rafPending) return;
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        this.updateActive();
      });
    };
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private stopSpy(): void {
    if (this.scrollHandler && typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.scrollHandler);
    }
    this.scrollHandler = null;
  }

  /** The header whose top is at/just above the app bar line is "active". */
  private updateActive(): void {
    if (!this.headers.size || typeof window === 'undefined') return;
    const barHeight =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--app-bar-height',
        ),
      ) || 0;
    const line = barHeight + 1;

    let active: string | null = null;
    let bestTop = -Infinity;
    let earliest: string | null = null;
    let earliestTop = Infinity;
    for (const [key, el] of this.headers) {
      const top = el.getBoundingClientRect().top;
      if (top <= line && top > bestTop) {
        bestTop = top;
        active = key;
      }
      if (top < earliestTop) {
        earliestTop = top;
        earliest = key;
      }
    }
    // Before the first header has reached the line (page still at the very
    // top), default to the earliest (topmost) day.
    const next = active ?? earliest;
    if (next !== this.activeKey()) this.activeKey.set(next);
  }
}
