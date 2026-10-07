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
import { TripDto } from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { EditModeService } from '../../services/edit-mode.service';
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
 * The trip page shell: a fixed left side panel (back button, trip name + compact
 * details, and the section nav) plus a `<router-outlet>` that hosts the active
 * section view (overview / timeline / accommodations / car rentals / transport /
 * reservations).
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
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);
  private readonly router = inject(Router);
  readonly editMode = inject(EditModeService);

  readonly loaded = this.store.loaded;
  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  readonly nav: NavItem[] = [
    { path: 'overview', label: 'Overview', icon: 'info' },
    { path: 'timeline', label: 'Timeline', icon: 'calendar_view_day' },
    { path: 'accommodations', label: 'Accommodations', icon: 'hotel' },
    { path: 'car-reservations', label: 'Car Rentals', icon: 'directions_car' },
    { path: 'transport', label: 'Transport', icon: 'commute' },
    {
      path: 'reservations',
      label: 'Reservations',
      icon: 'confirmation_number',
    },
  ];

  /** Trip length as "N days · M nights". */
  readonly lengthLabel = computed(() => {
    const t = this.trip();
    if (!t) return '';
    const days = this.tz.enumerateDays(t).length;
    const nights = Math.max(0, days - 1);
    return `${days} day${days === 1 ? '' : 's'} · ${nights} night${nights === 1 ? '' : 's'}`;
  });

  /** Expose the format helpers to the template. */
  protected readonly formatRange = formatRange;
  protected readonly zoneLabel = zoneLabel;

  /** Mobile app bar subtitle, e.g. "Day 7 of 16 · Thu, 9 Apr". */
  readonly contextLabel = computed(() => {
    const t = this.trip();
    return t ? tripContextLabel(t, DateTime.now()) : '';
  });

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

  /** The sticky app bar (+ optional edit banner) whose real height drives
   * `--app-bar-height` (the day headers' sticky offset) below. */
  private readonly stickyStackEl =
    viewChild<ElementRef<HTMLElement>>('stickyStack');
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const el = this.editMode.isMobile() ? this.stickyStackEl()?.nativeElement : undefined;
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
