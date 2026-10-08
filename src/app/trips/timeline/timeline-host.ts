import { Component, inject, input } from '@angular/core';
import { TimelineView } from './timeline';
import { TimelineViewModeService } from './timeline-view-mode.service';
import { ColumnsView } from '../desktop/columns-view';
import { EditModeService } from '../../services/edit-mode.service';

/**
 * Thin host for the Timeline route (issue #45): renders whichever view the
 * desktop segmented control (`TripPage`) has selected via
 * `TimelineViewModeService`. D3 (#47) adds the `'columns'` case — D4/D6 add a
 * `@case` each as Week/Map come online, so adding a view later is a
 * one-line change here. Mobile always lands on `list`, overriding a stored
 * desktop choice — the switcher never renders on mobile, but the mode is
 * persisted across viewport sizes (same session, a narrowed window), so this
 * guard is what actually keeps mobile on `list`.
 */
@Component({
  selector: 'app-timeline-host',
  imports: [TimelineView, ColumnsView],
  template: `
    @switch (editMode.isMobile() ? 'list' : viewMode.mode()) {
      @case ('columns') {
        <app-columns-view [id]="id()" />
      }
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
  protected readonly editMode = inject(EditModeService);
}
