import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AccommodationDto,
  CarReservationDto,
  TimelineEntry,
  TripDto,
} from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { ClockService } from '../../services/clock.service';
import { zoneLabel } from '../../shared/format/date-format';
import { EntryCard } from '../timeline/entry-card';
import { TripStrip } from './trip-strip';
import { buildTripDayModel, TripDayModel } from './trip-day-model';
import {
  clampWindowStart,
  computeColumnCount,
  initialWindowStart,
  navigateWindow,
  windowContaining,
} from './columns-layout';

/**
 * Desktop D3 (#47): the "Columns" timeline view — the trip strip (D2) over
 * the full content width, with N day columns below it. Built entirely on
 * `buildTripDayModel`/`TripStrip` (shared with the future Week/Map views) and
 * `EntryCard` (reused unmodified from the List) plus the shared
 * `TripActionsService` flows (`openEntry`/`editEntry`/`deleteEntry`/
 * `moveEntry`/`addActivity`/`addTransport`) — none of the List's own
 * rendering (straddle cards, drag-drop, now-line) is touched.
 *
 * Column count and the visible window (first visible day + column count) are
 * pure helpers in [columns-layout.ts](./columns-layout.ts), unit-tested
 * there; this component only wires a `ResizeObserver`, the toolbar buttons,
 * the strip's `dayClick` and the global ←/→ keys to them.
 */
@Component({
  selector: 'app-columns-view',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TripStrip,
    EntryCard,
  ],
  templateUrl: './columns-view.html',
  styleUrl: './columns-view.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:resize)': 'updateHeight()',
  },
})
export class ColumnsView {
  /** Route param, bound via withComponentInputBinding (same as `TimelineView`). */
  readonly id = input.required<string>();

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);
  private readonly clock = inject(ClockService);
  private readonly destroyRef = inject(DestroyRef);

  readonly trip = computed<TripDto | undefined>(() =>
    this.store.trips().find((t) => t.id === this.id()),
  );

  readonly destZone = computed(() => this.trip()?.destinationTimeZone ?? '');
  readonly destZoneLabel = computed(() => {
    const trip = this.trip();
    return trip ? zoneLabel(trip.destinationTimeZone) : '';
  });

  /** The trip's real days (destination tz) — passed to `TripActionsService.moveEntry`. */
  readonly realDays = computed(() => {
    const trip = this.trip();
    return trip ? this.tz.enumerateDays(trip) : [];
  });

  private readonly model = computed(() => {
    const trip = this.trip();
    return trip ? buildTripDayModel(trip, this.tz) : { days: [] };
  });
  readonly days = computed(() => this.model().days);
  readonly totalDays = computed(() => this.days().length);

  /** Destination-tz "today", or undefined when today falls outside the trip. */
  readonly todayKey = computed<string | undefined>(() => {
    const trip = this.trip();
    if (!trip) return undefined;
    return this.clock.now().setZone(trip.destinationTimeZone).toISODate() ?? undefined;
  });
  readonly todayIndex = computed<number | undefined>(() => {
    const key = this.todayKey();
    if (!key) return undefined;
    const idx = this.days().findIndex((d) => d.date === key);
    return idx < 0 ? undefined : idx;
  });
  readonly todayEnabled = computed(() => this.todayIndex() !== undefined);

  // --- Column count + visible window ---------------------------------------

  private readonly columnsAreaEl =
    viewChild.required<ElementRef<HTMLElement>>('columnsArea');
  private readonly availableWidth = signal(0);
  private resizeObserver?: ResizeObserver;

  readonly columnCount = computed(() => computeColumnCount(this.availableWidth()));

  private readonly windowStart = signal(0);
  private readonly initialized = signal(false);

  readonly visibleDays = computed<TripDayModel[]>(() => {
    const start = this.windowStart();
    const n = this.columnCount();
    return this.days().slice(start, start + n);
  });
  /** Fed to `TripStrip`'s `selected` input — the strip's selection highlight. */
  readonly visibleDates = computed(() => this.visibleDays().map((d) => d.date));

  /** "22 – 24 Nov · Day 7–9" (or a single day when the window holds just one). */
  readonly rangeLabel = computed(() => {
    const visible = this.visibleDays();
    if (!visible.length) return '';
    const first = visible[0];
    const last = visible[visible.length - 1];
    if (first === last) return `${first.dayOfMonth} ${first.month} · Day ${first.index}`;
    const dateRange =
      first.month === last.month
        ? `${first.dayOfMonth} – ${last.dayOfMonth} ${last.month}`
        : `${first.dayOfMonth} ${first.month} – ${last.dayOfMonth} ${last.month}`;
    return `${dateRange} · Day ${first.index}–${last.index}`;
  });

  readonly columnsHeight = signal(400);

  constructor() {
    afterNextRender(() => {
      const el = this.columnsAreaEl().nativeElement;
      this.resizeObserver = new ResizeObserver(() => {
        this.availableWidth.set(el.clientWidth);
        this.updateHeight();
      });
      this.resizeObserver.observe(el);
      this.availableWidth.set(el.clientWidth);
      this.updateHeight();
    });
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());

    // Initial window, once: today's column when the trip is running, else
    // Day 1 (see the issue's "beim ersten Öffnen" rule).
    effect(() => {
      const total = this.totalDays();
      if (this.initialized() || total === 0) return;
      this.windowStart.set(
        initialWindowStart(this.todayIndex(), this.columnCount(), total),
      );
      this.initialized.set(true);
    });

    // On resize (column count changes) or the day list changing, keep the
    // first visible day — just reclamp it to the new bounds.
    effect(() => {
      const total = this.totalDays();
      const n = this.columnCount();
      if (!this.initialized()) return;
      this.windowStart.update((s) => clampWindowStart(s, n, total));
    });
  }

  updateHeight(): void {
    const el = this.columnsAreaEl()?.nativeElement;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    this.columnsHeight.set(Math.max(240, Math.floor(window.innerHeight - top)));
  }

  // --- Navigation ------------------------------------------------------------

  prev(event: MouseEvent): void {
    const delta = event.shiftKey ? -this.columnCount() : -1;
    this.windowStart.update((s) =>
      navigateWindow(s, delta, this.columnCount(), this.totalDays()),
    );
  }

  next(event: MouseEvent): void {
    const delta = event.shiftKey ? this.columnCount() : 1;
    this.windowStart.update((s) =>
      navigateWindow(s, delta, this.columnCount(), this.totalDays()),
    );
  }

  jumpToToday(): void {
    const idx = this.todayIndex();
    if (idx === undefined) return;
    this.windowStart.set(clampWindowStart(idx, this.columnCount(), this.totalDays()));
  }

  onStripClick(date: string): void {
    const idx = this.days().findIndex((d) => d.date === date);
    if (idx < 0) return;
    this.windowStart.update((s) =>
      windowContaining(idx, s, this.columnCount(), this.totalDays()),
    );
  }

  /**
   * Global ←/→ (Shift = a whole window) navigation — skipped while focus is
   * in a form control, or inside `TripStrip` (which handles its own arrow
   * keys to move focus between day cells).
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target.isContentEditable) return;
      if (target.closest('app-trip-strip')) return;
    }
    event.preventDefault();
    const delta = event.shiftKey ? this.columnCount() : 1;
    const dir = event.key === 'ArrowLeft' ? -1 : 1;
    this.windowStart.update((s) =>
      navigateWindow(s, dir * delta, this.columnCount(), this.totalDays()),
    );
  }

  // --- Column content ---------------------------------------------------------

  /** Zone label shown only on the first visible column (the zone never
   * changes between real days within one trip) — see the issue's "Zone nur
   * bei Wechsel". */
  showZone(indexInWindow: number): boolean {
    return indexInWindow === 0;
  }

  /** The day's stay line, with the full hotel name appended on its check-in
   * day (switch or plain) — see the issue's "Dormy Inn Kochi" example. */
  stayText(day: TripDayModel): string {
    const stay = day.stay;
    if (!stay.text) return '';
    const acc = stay.accommodation;
    if (acc && acc.checkInDate === day.date && acc.fullName && acc.fullName !== acc.name) {
      return `${stay.text} · ${acc.fullName}`;
    }
    return stay.text;
  }

  openEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.openEntry(trip, entry);
  }

  editEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.editEntry(trip, entry);
  }

  deleteEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.deleteEntry(trip, entry);
  }

  moveEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.moveEntry(trip, entry, this.realDays());
  }

  openCar(car: CarReservationDto): void {
    const trip = this.trip();
    if (trip) this.actions.openCarReservation(trip, car);
  }

  openAccommodation(accommodation: AccommodationDto): void {
    const trip = this.trip();
    if (trip) this.actions.openAccommodation(trip, accommodation);
  }

  addActivity(date: string): void {
    const trip = this.trip();
    if (trip) this.actions.addActivity(trip, date);
  }

  addTransport(date: string): void {
    const trip = this.trip();
    if (trip) this.actions.addTransport(trip, date);
  }
}
