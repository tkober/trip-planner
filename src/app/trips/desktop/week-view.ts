import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CarReservationDto,
  TimelineEntry,
  TransportMode,
  TripDto,
} from '../../models/trip.model';
import { TripStore } from '../../services/trip-store';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import { ClockService } from '../../services/clock.service';
import { zoneLabel } from '../../shared/format/date-format';
import {
  accommodationColors,
  activityColor,
  carReservationColors,
  transportColor,
} from '../../shared/color/color';
import { transportFrom, transportTo } from '../../shared/transport-format';
import { TripStrip } from './trip-strip';
import { buildTripDayModel, TripDayModel } from './trip-day-model';
import {
  clampWindowStart,
  initialWindowStart,
  navigateWindow,
} from './columns-layout';
import {
  computeHourRange,
  computeRowHeight,
  computeWeekWindowSize,
  packLanes,
  splitAcrossDays,
} from './week-layout';

const MODE_ICON: Record<TransportMode, string> = {
  flight: 'flight',
  train: 'train',
  bus: 'directions_bus',
  car: 'directions_car',
};

/** A positioned, lane-packed entry segment on the hour grid. */
interface WeekBlock {
  key: string;
  entry: TimelineEntry;
  date: string;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  color: string;
  icon: string;
  title: string;
  timeLabel: string;
  showTime: boolean;
  /** True for a block ~1 hour row tall or shorter: single-line ellipsis title. */
  compact: boolean;
  /** For a non-compact block: how many lines the wrapped title may use (fits the block's height). */
  titleLines: number;
  noEnd: boolean;
  continuesFromPrev: boolean;
  continuesToNext: boolean;
}

/** A car pickup/return deadline rendered as a thin labelled line. */
interface WeekDeadline {
  key: string;
  date: string;
  top: number;
  label: string;
  time: string;
  color: string;
  car: CarReservationDto;
}

/** One raw activity/transport span, already resolved to destination-tz wall time. */
interface RawSpan {
  entry: TimelineEntry;
  startDate: string;
  startMin: number;
  endDate: string;
  endMin: number;
  noEnd: boolean;
}

const MIN_BLOCK_HEIGHT_FOR_TIME = 30;

/** Top/bottom breathing room inside the hour grid so the first/last hour
 * label (vertically centred on its gridline via `translateY(-50%)`) isn't
 * clipped by the scroll container's edge. */
const GRID_VERTICAL_PADDING = 10;

// --- Block title layout (review fix: tall/narrow blocks were truncating and
// vertically centering their title instead of wrapping it top-down) --------
/** A block at/under ~1 hour row keeps the old single-row icon+title+time layout. */
const COMPACT_HEIGHT_FACTOR = 1.15;
/** Reserved height (px) for the icon+time row atop a non-compact block. */
const BLOCK_TOP_ROW_HEIGHT = 16;
/** Vertical padding (px) the `.week-block` CSS applies (top + bottom). */
const BLOCK_VERTICAL_PADDING = 6;
/** Gap (px) between the top row and the wrapped title. */
const TITLE_MARGIN_TOP = 3;
/** Line height (px) of the wrapped title text (0.74rem @ ~1.25 line-height). */
const TITLE_LINE_HEIGHT = 15;

/**
 * Desktop D4 (#48): the "Week" timeline view — an hour-grid week calendar
 * under the shared trip strip (D2), following the same structure as
 * `ColumnsView` (D3): the strip at full width, a slim toolbar, then the
 * actual view content. Unlike Columns, which keeps each day-crossing entry
 * on its start day via `buildTripDayModel`'s `arrivesLabel`, Week draws the
 * entry's real time span and visually cuts it at midnight
 * (`week-layout.ts`'s `splitAcrossDays`), so it needs its own read of
 * `trip.activities`/`trip.transport` rather than that per-day bucketing.
 * `buildTripDayModel` is still used for the day metadata (index/date/
 * weekday) and is passed straight through to `TripStrip`, same as Columns.
 */
@Component({
  selector: 'app-week-view',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TripStrip],
  templateUrl: './week-view.html',
  styleUrl: './week-view.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:resize)': 'updateHeight()',
  },
})
export class WeekView {
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

  private readonly model = computed(() => {
    const trip = this.trip();
    return trip ? buildTripDayModel(trip, this.tz) : { days: [] };
  });
  readonly days = computed(() => this.model().days);
  readonly totalDays = computed(() => this.days().length);

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

  // --- Window size + visible window ----------------------------------------

  private readonly gridAreaEl = viewChild<ElementRef<HTMLElement>>('gridArea');
  private readonly availableWidth = signal(0);
  private resizeObserver?: ResizeObserver;

  readonly windowSize = computed(() => computeWeekWindowSize(this.availableWidth()));

  private readonly windowStart = signal(0);
  private readonly initialized = signal(false);

  readonly visibleDays = computed<TripDayModel[]>(() => {
    const start = this.windowStart();
    const n = this.windowSize();
    return this.days().slice(start, start + n);
  });
  readonly visibleDates = computed(() => this.visibleDays().map((d) => d.date));

  /** "21 – 27 Nov · Day 6–12". */
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

  /** Distinct stay names covering the visible week, in first-seen order. */
  readonly placesLabel = computed(() => {
    const names: string[] = [];
    for (const day of this.visibleDays()) {
      const name = day.stay.accommodation?.name;
      if (name && !names.includes(name)) names.push(name);
    }
    return names.join(' · ');
  });

  readonly gridAvailableHeight = signal(360);

  constructor() {
    afterNextRender(() => {
      const el = this.gridAreaEl()?.nativeElement;
      if (!el) return;
      this.resizeObserver = new ResizeObserver(() => {
        this.availableWidth.set(el.clientWidth);
      });
      this.resizeObserver.observe(el);
      this.availableWidth.set(el.clientWidth);
    });
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());

    // Re-measure the available height on every render (not just once / on
    // window resize): the strip and the day-header row above the grid can
    // change height after our first paint (fonts loading, the strip's own
    // async bar layout, a toolbar label wrapping differently), and a stale
    // measurement from before that settled was exactly what let the grid run
    // past the viewport bottom. `afterRenderEffect`'s 'read' phase runs after
    // every change-detection pass for as long as this component is alive, so
    // the measurement always reflects the DOM as currently laid out.
    afterRenderEffect({ read: () => this.updateHeight() });

    // Initial window, once: today's position when the trip is running, else Day 1.
    effect(() => {
      const total = this.totalDays();
      if (this.initialized() || total === 0) return;
      this.windowStart.set(initialWindowStart(this.todayIndex(), this.windowSize(), total));
      this.initialized.set(true);
    });

    // On resize (window size changes) or the day list changing, keep the
    // first visible day — just reclamp it to the new bounds.
    effect(() => {
      const total = this.totalDays();
      const n = this.windowSize();
      if (!this.initialized()) return;
      this.windowStart.update((s) => clampWindowStart(s, n, total));
    });
  }

  updateHeight(): void {
    const el = this.gridAreaEl()?.nativeElement;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const next = Math.max(200, Math.floor(window.innerHeight - top - 16));
    // Avoid writing an unchanged value every render (afterRender fires on
    // every CD pass) — keeps this a no-op once the layout has settled.
    if (next !== this.gridAvailableHeight()) this.gridAvailableHeight.set(next);
  }

  // --- Navigation: prev/next shift by the window size, Shift = 1 day --------

  prev(event: MouseEvent): void {
    const delta = event.shiftKey ? -1 : -this.windowSize();
    this.windowStart.update((s) => navigateWindow(s, delta, this.windowSize(), this.totalDays()));
  }

  next(event: MouseEvent): void {
    const delta = event.shiftKey ? 1 : this.windowSize();
    this.windowStart.update((s) => navigateWindow(s, delta, this.windowSize(), this.totalDays()));
  }

  jumpToToday(): void {
    const idx = this.todayIndex();
    if (idx === undefined) return;
    this.windowStart.set(clampWindowStart(idx, this.windowSize(), this.totalDays()));
  }

  /** The clicked strip day becomes the START of the week (not a minimal shift). */
  onStripClick(date: string): void {
    const idx = this.days().findIndex((d) => d.date === date);
    if (idx < 0) return;
    this.windowStart.set(clampWindowStart(idx, this.windowSize(), this.totalDays()));
  }

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
    const dir = event.key === 'ArrowLeft' ? -1 : 1;
    const delta = event.shiftKey ? dir : dir * this.windowSize();
    this.windowStart.update((s) => navigateWindow(s, delta, this.windowSize(), this.totalDays()));
  }

  // --- Hour grid --------------------------------------------------------------

  /** Every activity/transport entry, resolved to a destination-tz wall-time span. */
  private readonly rawSpans = computed<RawSpan[]>(() => {
    const trip = this.trip();
    if (!trip) return [];
    const zone = trip.destinationTimeZone;
    const spans: RawSpan[] = [];
    const push = (entry: TimelineEntry, startZt: TimelineEntry['start'], endZt?: TimelineEntry['start']) => {
      const start = this.tz.inZone(startZt, zone);
      const startDate = start.toISODate() ?? '';
      const startMin = start.hour * 60 + start.minute;
      if (endZt) {
        const end = this.tz.inZone(endZt, zone);
        spans.push({
          entry,
          startDate,
          startMin,
          endDate: end.toISODate() ?? startDate,
          endMin: end.hour * 60 + end.minute,
          noEnd: false,
        });
      } else {
        // No end: a fixed 1h block (dashed bottom edge) — may itself cross midnight.
        let endMin = startMin + 60;
        let endDate = startDate;
        if (endMin > 1440) {
          endMin -= 1440;
          endDate = start.plus({ days: 1 }).toISODate() ?? startDate;
        }
        spans.push({ entry, startDate, startMin, endDate, endMin, noEnd: true });
      }
    };
    for (const a of trip.activities) {
      push({ kind: 'activity', activity: a, start: a.start }, a.start, a.end);
    }
    for (const t of trip.transport) {
      push({ kind: 'transport', transport: t, start: t.start }, t.start, t.end);
    }
    return spans;
  });

  /** Segments of every span that land on a visible day, incl. continuation markers. */
  private readonly visibleSegments = computed(() => {
    const visibleSet = new Set(this.visibleDates());
    const out: { span: RawSpan; date: string; startMin: number; endMin: number; continuesFromPrev: boolean; continuesToNext: boolean }[] = [];
    for (const span of this.rawSpans()) {
      const segments = splitAcrossDays(span.startDate, span.startMin, span.endDate, span.endMin);
      for (const seg of segments) {
        if (!visibleSet.has(seg.date)) continue;
        out.push({ span, ...seg });
      }
    }
    return out;
  });

  /** Hour range shared by the whole visible window (earliest/latest across all visible days). */
  readonly hourRange = computed(() =>
    computeHourRange(this.visibleSegments().map((s) => ({ startMin: s.startMin, endMin: s.endMin }))),
  );
  readonly hourCount = computed(() => this.hourRange().endHour - this.hourRange().startHour);
  readonly hourMarks = computed(() => {
    const { startHour, endHour } = this.hourRange();
    return Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  });

  readonly rowHeight = computed(() =>
    computeRowHeight(
      this.hourCount(),
      Math.max(0, this.gridAvailableHeight() - GRID_VERTICAL_PADDING * 2),
    ),
  );
  readonly gridContentHeight = computed(
    () => this.rowHeight() * this.hourCount() + GRID_VERTICAL_PADDING * 2,
  );

  formatHour(h: number): string {
    return `${String(h % 24).padStart(2, '0')}:00`;
  }

  /** Pixel offset for a given hour-of-day mark/gridline, incl. the top padding. */
  hourOffset(hour: number): number {
    return GRID_VERTICAL_PADDING + (hour - this.hourRange().startHour) * this.rowHeight();
  }

  private minutesToTop(minutes: number): number {
    return GRID_VERTICAL_PADDING + (minutes / 60 - this.hourRange().startHour) * this.rowHeight();
  }

  /** Lane-packed, positioned blocks for one visible day. */
  blocksFor(date: string): WeekBlock[] {
    const segments = this.visibleSegments().filter((s) => s.date === date);
    const lanes = packLanes(
      segments.map((s, i) => ({ id: `${s.span.entry.kind}-${i}-${s.span.entry.activity?.id ?? s.span.entry.transport?.id}-${s.date}`, startMin: s.startMin, endMin: s.endMin })),
    );
    return segments.map((s, i) => {
      const id = `${s.span.entry.kind}-${i}-${s.span.entry.activity?.id ?? s.span.entry.transport?.id}-${s.date}`;
      const placement = lanes.get(id) ?? { lane: 0, lanes: 1 };
      const entry = s.span.entry;
      const widthPct = 100 / placement.lanes;
      const top = this.minutesToTop(s.startMin);
      const height = Math.max(this.rowHeight() / 2, this.minutesToTop(s.endMin) - top);
      const compact = height <= this.rowHeight() * COMPACT_HEIGHT_FACTOR;
      const titleLines = compact
        ? 1
        : Math.max(
            1,
            Math.floor(
              (height - BLOCK_VERTICAL_PADDING - BLOCK_TOP_ROW_HEIGHT - TITLE_MARGIN_TOP) /
                TITLE_LINE_HEIGHT,
            ),
          );
      return {
        key: id,
        entry,
        date,
        top,
        height,
        leftPct: placement.lane * widthPct,
        widthPct,
        color: entry.kind === 'activity' ? activityColor(entry.activity!) : transportColor(entry.transport!),
        icon: entry.kind === 'activity' ? 'local_activity' : MODE_ICON[entry.transport!.mode],
        title: this.entryTitle(entry),
        timeLabel: this.timeLabel(s.span, s.date, s.startMin),
        showTime: height >= MIN_BLOCK_HEIGHT_FOR_TIME,
        compact,
        titleLines,
        noEnd: s.span.noEnd,
        continuesFromPrev: s.continuesFromPrev,
        continuesToNext: s.continuesToNext,
      };
    });
  }

  private entryTitle(entry: TimelineEntry): string {
    if (entry.kind === 'activity') return entry.activity!.title;
    const t = entry.transport!;
    return `${transportFrom(t)} → ${transportTo(t)}`;
  }

  private timeLabel(span: RawSpan, segDate: string, segStartMin: number): string {
    // Only show the real clock time at the segment that actually starts the
    // entry — a continuation segment shows no (misleading) start time.
    if (segDate !== span.startDate || segStartMin !== span.startMin) return '';
    const h = Math.floor(span.startMin / 60);
    const m = span.startMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Car pickup/return deadlines on visible days, as thin labelled lines. */
  readonly deadlines = computed<WeekDeadline[]>(() => {
    const trip = this.trip();
    if (!trip) return [];
    const visibleSet = new Set(this.visibleDates());
    const colorById = carReservationColors(trip.carReservations);
    const out: WeekDeadline[] = [];
    for (const c of trip.carReservations) {
      const color = colorById.get(c.id) ?? '';
      if (visibleSet.has(c.pickupDate) && c.pickupTime) {
        out.push({
          key: `${c.id}-pickup`,
          date: c.pickupDate,
          top: this.minutesToTop(this.timeToMinutes(c.pickupTime)),
          label: 'Fetch by',
          time: c.pickupTime,
          color,
          car: c,
        });
      }
      if (visibleSet.has(c.dropoffDate) && c.dropoffTime) {
        out.push({
          key: `${c.id}-dropoff`,
          date: c.dropoffDate,
          top: this.minutesToTop(this.timeToMinutes(c.dropoffTime)),
          label: 'Return by',
          time: c.dropoffTime,
          color,
          car: c,
        });
      }
    }
    return out;
  });

  deadlinesFor(date: string): WeekDeadline[] {
    return this.deadlines().filter((d) => d.date === date);
  }

  private timeToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  /** Today's now-line top offset, or undefined when now falls outside the hour range. */
  readonly nowTop = computed<number | undefined>(() => {
    const trip = this.trip();
    if (!trip) return undefined;
    const now = this.clock.now().setZone(trip.destinationTimeZone);
    const minutes = now.hour * 60 + now.minute;
    const { startHour, endHour } = this.hourRange();
    if (minutes < startHour * 60 || minutes > endHour * 60) return undefined;
    return this.minutesToTop(minutes);
  });

  // --- Actions ---------------------------------------------------------------

  openEntry(entry: TimelineEntry): void {
    const trip = this.trip();
    if (trip) this.actions.openEntry(trip, entry);
  }

  openCar(car: CarReservationDto): void {
    const trip = this.trip();
    if (trip) this.actions.openCarReservation(trip, car);
  }

  /** Click on an empty hour slot: "Add activity" prefilled with the day + clicked hour. */
  onSlotClick(event: MouseEvent, date: string): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = event.clientY - rect.top - GRID_VERTICAL_PADDING;
    const hour = this.hourRange().startHour + Math.floor(y / this.rowHeight());
    const trip = this.trip();
    if (trip) this.actions.addActivity(trip, date, Math.min(23, Math.max(0, hour)));
  }
}
