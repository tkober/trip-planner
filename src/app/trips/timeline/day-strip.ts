import { Component, ElementRef, effect, inject, viewChildren } from '@angular/core';
import { TimelineNavService } from './timeline-nav.service';

/**
 * The mobile app bar's horizontal day strip (R4): one chip per day, including
 * the virtual departure/return days, backed by `TimelineNavService`. Renders
 * nothing when the service holds no days (every route but Timeline, and
 * desktop, which never publishes).
 */
@Component({
  selector: 'app-day-strip',
  imports: [],
  templateUrl: './day-strip.html',
  styleUrl: './day-strip.scss',
})
export class DayStrip {
  readonly nav = inject(TimelineNavService);

  private readonly chipRefs = viewChildren<ElementRef<HTMLElement>>('chipRef');

  constructor() {
    // Keep the active chip in view as the scroll spy moves — horizontally
    // only, never scrolling the page itself.
    effect(() => {
      const key = this.nav.activeKey();
      if (!key) return;
      const idx = this.nav.days().findIndex((d) => d.key === key);
      this.chipRefs()[idx]?.nativeElement.scrollIntoView({
        inline: 'center',
        block: 'nearest',
      });
    });
  }

  onTap(key: string): void {
    this.nav.scrollTo(key);
  }
}
