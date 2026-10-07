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
  /** R5: the night's stay colour, filling the chip's colour bar; unset → no bar. */
  color?: string;
}

/**
 * Root service bridging the timeline (which knows the days, including the
 * virtual departure/return ones) and the trip shell's mobile day strip (which
 * renders them in the app bar, on the Timeline route only). `TimelineView`
 * publishes `days` whenever it renders on screen — never for the plan export
 * (`tripOverride`/`exportMode`) — and clears it on destroy so the strip
 * disappears on every other route.
 *
 * Also owns the scroll-spy: each day header (mobile) and/or day marker
 * (desktop, R10) registers its element here under the same key, and a single
 * passive `scroll` listener (rAF-throttled) picks whichever registered
 * element is currently both visible (the other breakpoint's candidate for
 * that key sits `display: none` and collapses to a zero-size rect) and
 * sitting at/just below the app bar (0 on desktop, no sticky bar there) as
 * `activeKey`.
 */
@Injectable({ providedIn: 'root' })
export class TimelineNavService {
  readonly days = signal<NavDay[]>([]);
  readonly activeKey = signal<string | null>(null);

  private readonly headers = new Map<string, HTMLElement>();
  private readonly markers = new Map<string, HTMLElement>();
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
    this.markers.clear();
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

  /** R10: a desktop day marker — the scroll target there (headers are mobile-only). */
  registerMarker(key: string, el: HTMLElement): void {
    this.markers.set(key, el);
    this.ensureSpy();
    this.updateActive();
  }

  unregisterMarker(key: string): void {
    this.markers.delete(key);
  }

  private candidatesFor(key: string): HTMLElement[] {
    const out: HTMLElement[] = [];
    const h = this.headers.get(key);
    if (h) out.push(h);
    const m = this.markers.get(key);
    if (m) out.push(m);
    return out;
  }

  /** The candidate for `key` that actually has a box right now (the other is
   * `display: none` at the current viewport width). */
  private visibleEl(key: string): HTMLElement | undefined {
    const candidates = this.candidatesFor(key);
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) return el;
    }
    return candidates[0];
  }

  /** Scroll the page so `key`'s header/marker sits right under the app bar
   * (mobile) or at the top of the viewport (desktop — no sticky bar there). */
  scrollTo(key: string): void {
    const el = this.visibleEl(key);
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

  /** The header/marker whose top is at/just above the app bar line is "active". */
  private updateActive(): void {
    const keys = new Set<string>([...this.headers.keys(), ...this.markers.keys()]);
    if (!keys.size || typeof window === 'undefined') return;
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
    for (const key of keys) {
      const el = this.visibleEl(key);
      if (!el) continue;
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
