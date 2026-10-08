import { Component, inject, input } from '@angular/core';
import { TimelineView } from './timeline';
import { TimelineViewModeService } from './timeline-view-mode.service';

/**
 * Thin host for the Timeline route (issue #45): renders whichever view the
 * desktop segmented control (`TripPage`) has selected via
 * `TimelineViewModeService`. Only `'list'` exists yet — D3/D4/D6 add a
 * `@case` each as Columns/Week/Map come online, so adding a view later is a
 * one-line change here. Mobile always lands on `list` too, since the
 * switcher itself never renders there (`mode` just stays at its default).
 */
@Component({
  selector: 'app-timeline-host',
  imports: [TimelineView],
  template: `
    @switch (viewMode.mode()) {
      @case ('list') {
        <app-timeline-view [id]="id()" />
      }
      @default {
        <app-timeline-view [id]="id()" />
      }
    }
  `,
})
export class TimelineHost {
  /** Route param, forwarded to `TimelineView` — see withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly viewMode = inject(TimelineViewModeService);
}
