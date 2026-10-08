import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { DateTime } from 'luxon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TripActionsService } from '../../services/trip-actions.service';
import { EditModeService } from '../../services/edit-mode.service';
import { TimelineViewModeService } from '../timeline/timeline-view-mode.service';
import { ExportHost } from '../export/export-host';
import { DayStrip } from '../timeline/day-strip';
import { formatRange, zoneLabel } from '../../shared/format/date-format';
import { tripContextLabel } from '../../shared/format/trip-context';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

/**
 * The trip page shell: on desktop (D1, #45) a full-width sticky top bar (back
 * button, trip title + context line, the section tabs, the timeline-only view
 * switcher, the trip kebab); on mobile its own sticky app bar + fixed bottom
 * nav instead (see below). Either way, a `<router-outlet>` hosts the active
 * section view (timeline / overview / accommodations / car rentals /
 * transport / reservations).
 */
@Component({
  selector: 'app-trip-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    ExportHost,
    DayStrip,
  ],
  templateUrl: './trip-page.html',
  styleUrl: './trip-page.scss',
})
export class TripPage {
  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly store = inject(TripStore);
  private readonly actions = inject(TripActionsService);
  private readonly router = inject(Router);
  readonly editMode = inject(EditModeService);
  readonly viewMode = inject(TimelineViewModeService);

  readonly loaded = this.store.loaded;
  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  /** Section nav — both the desktop top bar's tabs (full icon+label, or
   * icon-only + tooltip below ~1200px, see trip-page.scss) and the mobile
   * bottom nav's two "More" items reuse these path/icon pairs; Timeline
   * leads per the desktop design. */
  readonly nav: NavItem[] = [
    { path: 'timeline', label: 'Timeline', icon: 'calendar_view_day' },
    { path: 'overview', label: 'Overview', icon: 'info' },
    { path: 'accommodations', label: 'Stays', icon: 'hotel' },
    { path: 'car-reservations', label: 'Car rentals', icon: 'directions_car' },
    { path: 'transport', label: 'Transport', icon: 'commute' },
    {
      path: 'reservations',
      label: 'Reservations',
      icon: 'confirmation_number',
    },
  ];

  /** Mobile app bar subtitle, e.g. "Day 7 of 16 · Thu, 9 Apr". */
  readonly contextLabel = computed(() => {
    const t = this.trip();
    return t ? tripContextLabel(t, DateTime.now()) : '';
  });

  /** Desktop top bar's muted context line, e.g. "Starts in 39 days · 16 Nov –
   * 4 Dec · Tokyo GMT+9" — the mobile context label plus the date range and
   * destination zone, reusing the same helpers (`zoneLabel`'s " · " between
   * city and offset is squashed to a space here to match the design's
   * tighter "Tokyo GMT+9" wording). */
  readonly desktopContextLabel = computed(() => {
    const t = this.trip();
    if (!t) return '';
    const context = tripContextLabel(t, DateTime.now());
    const range = formatRange(t.startDate, t.endDate);
    const zone = zoneLabel(t.destinationTimeZone).replace(' · ', ' ');
    return `${context} · ${range} · ${zone}`;
  });

  /** Opt-in for later desktop timeline views (Columns/Week/Map, D3/D4/D6)
   * that want the bar's full width instead of the centered ~1000px content
   * column — see `.trip-content.full-width` in trip-page.scss. Not used yet:
   * `TimelineViewModeService.available` only has `'list'` in this issue. */
  readonly useFullWidthContent = computed(
    () => this.onTimelineRoute() && this.viewMode.mode() !== 'list',
  );

  /** Current URL, kept live for the bottom nav's "More" active state. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** "More" (bottom nav) reads as active for its two menu-only routes. */
  readonly moreActive = computed(() => {
    const u = this.url();
    return u.includes('/car-reservations') || u.includes('/reservations');
  });

  /** The R4 day strip only ever shows on the Timeline route. */
  readonly onTimelineRoute = computed(() => this.url().includes('/timeline'));

  /** The sticky app bar (+ optional edit banner on mobile, or the desktop top
   * bar) whose real height drives `--app-bar-height` — the mobile day
   * headers' sticky offset, and (desktop) the R10 hotel/car lane names'
   * sticky offset in timeline.scss. */
  private readonly stickyStackEl =
    viewChild<ElementRef<HTMLElement>>('stickyStack');
  private readonly desktopBarEl =
    viewChild<ElementRef<HTMLElement>>('desktopBar');
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const el = this.editMode.isMobile()
        ? this.stickyStackEl()?.nativeElement
        : this.desktopBarEl()?.nativeElement;
      this.resizeObserver?.disconnect();
      this.resizeObserver = undefined;
      if (!el) {
        document.documentElement.style.removeProperty('--app-bar-height');
        return;
      }
      const update = () =>
        document.documentElement.style.setProperty(
          '--app-bar-height',
          `${el.getBoundingClientRect().height}px`,
        );
      update();
      this.resizeObserver = new ResizeObserver(update);
      this.resizeObserver.observe(el);
    });
    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      document.documentElement.style.removeProperty('--app-bar-height');
    });
  }

  back(): void {
    void this.router.navigate(['/trips']);
  }

  editTrip(): void {
    const trip = this.trip();
    if (trip) this.actions.editTrip(trip);
  }

  addAccommodation(): void {
    const trip = this.trip();
    if (trip) this.actions.addAccommodation(trip);
  }

  exportTrip(): void {
    const trip = this.trip();
    if (trip) this.actions.exportTrip(trip);
  }

  exportPlan(): void {
    const trip = this.trip();
    if (trip) this.actions.exportPlan(trip);
  }
}
