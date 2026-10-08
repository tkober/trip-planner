import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AccommodationDto,
  CarReservationDto,
  TripDto,
} from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import { TripActionsService } from '../../services/trip-actions.service';
import {
  accommodationColors,
  activityColor,
  carReservationColors,
  tintColor,
  transportColor,
} from '../../shared/color/color';
import { buildTripDayModel, TripDayModel } from './trip-day-model';

/** Minimum/maximum day-cell width (see "Breite und Scrollen" in the issue). */
const MIN_DAY_WIDTH = 56;
const MAX_DAY_WIDTH = 160;

/** A continuous accommodation bar, from the middle of check-in to check-out. */
interface StayBar {
  id: string;
  accommodation: AccommodationDto;
  left: number;
  width: number;
  color: string;
  name: string;
  fullName: string;
}

/** A continuous car-rental bar, spanning the full pickup→dropoff days. */
interface CarBar {
  id: string;
  reservation: CarReservationDto;
  left: number;
  width: number;
  color: string;
}

/** One cell's entry dots (type-coloured, capped so a busy day doesn't overflow). */
const MAX_DOTS = 6;

/**
 * The horizontal strip spanning the whole trip (D2, #46): the single place
 * Columns/Week/Map (D3-D6) share for the day-by-day header, hotel bars and
 * car bars — see the epic (#44) "Ein Rahmen für alle Ansichten". Built on the
 * pure `buildTripDayModel` helper; this component only lays it out and wires
 * scrolling/selection.
 *
 * Sizing: each day is `clamp(56px, available/N, 160px)` wide. When the trip
 * fits, the strip stretches (up to 160px/day) and centers; otherwise it
 * scrolls horizontally with trackpad swipe, a translated vertical wheel,
 * mouse drag, arrow buttons + edge fades, scroll-snap and keyboard arrows —
 * see the template/stylesheet for the mechanics.
 */
@Component({
  selector: 'app-trip-strip',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './trip-strip.html',
  styleUrl: './trip-strip.scss',
})
export class TripStrip {
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);

  readonly trip = input.required<TripDto>();
  /** Destination-tz date keys currently selected (a contiguous range reads as one fill). */
  readonly selected = input<string[]>([]);
  /** Destination-tz "today", or undefined when today falls outside the trip. */
  readonly today = input<string | undefined>(undefined);

  /** A day cell was clicked (or focus moved there via the keyboard). */
  readonly dayClick = output<string>();

  private readonly model = computed(() => buildTripDayModel(this.trip(), this.tz));
  readonly days = computed(() => this.model().days);
  readonly leadingDay = computed(() => this.model().leading);
  readonly trailingDay = computed(() => this.model().trailing);

  /** Total cells in the track, including the virtual departure/return ones. */
  private readonly cellCount = computed(
    () => this.days().length + (this.leadingDay() ? 1 : 0) + (this.trailingDay() ? 1 : 0),
  );

  // --- Sizing: ResizeObserver on the scroll viewport -----------------------

  private readonly scrollEl = viewChild.required<ElementRef<HTMLElement>>('scrollEl');
  private readonly availableWidth = signal(0);
  private resizeObserver?: ResizeObserver;

  readonly dayWidth = computed(() => {
    const n = this.cellCount();
    if (!n) return MIN_DAY_WIDTH;
    const raw = this.availableWidth() / n;
    return Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, raw));
  });
  readonly trackWidth = computed(() => this.dayWidth() * this.cellCount());
  /** Whether the whole trip fits without scrolling (centers instead). */
  readonly fits = computed(() => this.trackWidth() <= this.availableWidth() + 0.5);

  readonly canScrollLeft = signal(false);
  readonly canScrollRight = signal(false);

  constructor() {
    afterNextRender(() => {
      const el = this.scrollEl().nativeElement;
      this.resizeObserver = new ResizeObserver(() => {
        this.availableWidth.set(el.clientWidth);
        this.updateArrows();
      });
      this.resizeObserver.observe(el);
      this.availableWidth.set(el.clientWidth);
      this.updateArrows();
    });

    // Keep the selected range in view when it changes (e.g. navigating days
    // from elsewhere) — only scrolls when the range is actually outside.
    effect(() => {
      this.selected();
      this.days();
      this.dayWidth();
      queueMicrotask(() => this.scrollSelectionIntoView());
    });
  }

  // --- Day cells -------------------------------------------------------------

  private readonly dayButtons = viewChildren<ElementRef<HTMLButtonElement>>('dayBtn');

  isSelected(date: string): boolean {
    return this.selected().includes(date);
  }

  /** Up to `MAX_DOTS` type-coloured dots for a day's activities/transport. */
  entryDots(day: TripDayModel): string[] {
    const colors: string[] = [];
    for (const item of day.items) {
      if (item.kind !== 'entry') continue;
      const entry = item.entry;
      colors.push(
        entry.kind === 'activity'
          ? activityColor(entry.activity!)
          : transportColor(entry.transport!),
      );
      if (colors.length >= MAX_DOTS) break;
    }
    return colors;
  }

  dayAriaLabel(day: TripDayModel): string {
    return `Day ${day.index}, ${day.weekday} ${day.dayOfMonth} ${day.month}`;
  }

  onCellClick(date: string): void {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    this.dayClick.emit(date);
  }

  /** Keyboard arrow: move focus + selection to the previous/next real day. */
  onArrowKey(event: Event, delta: -1 | 1, index: number): void {
    event.preventDefault();
    const buttons = this.dayButtons();
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= buttons.length) return;
    const btn = buttons[nextIndex].nativeElement;
    btn.focus();
    btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    const day = this.days()[nextIndex];
    if (day) this.dayClick.emit(day.date);
  }

  // --- Stay / car bars ---------------------------------------------------

  /** 0-based position of a destination-tz date within the full track (incl.
   * the leading virtual cell), clamped to the trip's range. */
  private trackIndex(date: string): number {
    const days = this.days();
    const offset = this.leadingDay() ? 1 : 0;
    if (!days.length) return offset;
    if (date <= days[0].date) return offset;
    if (date >= days[days.length - 1].date) return days.length - 1 + offset;
    const idx = days.findIndex((d) => d.date === date);
    return (idx < 0 ? 0 : idx) + offset;
  }

  readonly stayBars = computed<StayBar[]>(() => {
    const trip = this.trip();
    const w = this.dayWidth();
    const colorById = accommodationColors(trip.accommodations);
    return trip.accommodations.map((a) => {
      const startIdx = this.trackIndex(a.checkInDate);
      const endIdx = this.trackIndex(a.checkOutDate);
      // Half-day handoff: the bar runs from the middle of check-in day to
      // the middle of check-out day (mirrors the List's hotel-lane convention).
      const left = (startIdx + 0.5) * w;
      const width = Math.max(w * 0.5, (endIdx - startIdx) * w);
      return {
        id: a.id,
        accommodation: a,
        left,
        width,
        color: colorById.get(a.id) ?? '',
        name: a.name,
        fullName: a.fullName || a.name,
      };
    });
  });

  readonly carBars = computed<CarBar[]>(() => {
    const trip = this.trip();
    const w = this.dayWidth();
    const colorById = carReservationColors(trip.carReservations);
    return trip.carReservations.map((c) => {
      const startIdx = this.trackIndex(c.pickupDate);
      const endIdx = this.trackIndex(c.dropoffDate);
      return {
        id: c.id,
        reservation: c,
        left: startIdx * w,
        // Inclusive of both pickup and dropoff days (no half-day handoff).
        width: (endIdx - startIdx + 1) * w,
        color: colorById.get(c.id) ?? '',
      };
    });
  });

  /** Light tint for the car bar's fill (see `tintColor`). */
  readonly tintColor = tintColor;

  openStay(bar: StayBar, event: Event): void {
    event.stopPropagation();
    this.actions.openAccommodation(this.trip(), bar.accommodation);
  }

  openCar(bar: CarBar, event: Event): void {
    event.stopPropagation();
    this.actions.openCarReservation(this.trip(), bar.reservation);
  }

  // --- Selection highlight -------------------------------------------------

  /** Continuous soft-primary fill behind a contiguous selected range. */
  readonly selectionRect = computed<{ left: number; width: number } | undefined>(() => {
    const sel = this.selected();
    const days = this.days();
    if (!sel.length || !days.length) return undefined;
    const indices = sel
      .map((key) => days.findIndex((d) => d.date === key))
      .filter((i) => i >= 0);
    if (!indices.length) return undefined;
    const offset = this.leadingDay() ? 1 : 0;
    const min = Math.min(...indices) + offset;
    const max = Math.max(...indices) + offset;
    const w = this.dayWidth();
    return { left: min * w, width: (max - min + 1) * w };
  });

  private scrollSelectionIntoView(): void {
    const rect = this.selectionRect();
    const el = this.scrollEl()?.nativeElement;
    if (!rect || !el) return;
    const viewStart = el.scrollLeft;
    const viewEnd = viewStart + el.clientWidth;
    if (rect.left >= viewStart && rect.left + rect.width <= viewEnd) return; // already visible
    const target =
      rect.width <= el.clientWidth
        ? rect.left - (el.clientWidth - rect.width) / 2
        : rect.left;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }

  // --- Scrolling: wheel, drag, arrows ---------------------------------------

  /** Translate a vertical wheel gesture into horizontal scroll, but only when
   * the strip actually overflows and the gesture is primarily vertical (a
   * trackpad's native horizontal swipe is left alone). */
  onWheel(event: WheelEvent): void {
    if (this.fits()) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    this.scrollEl().nativeElement.scrollLeft += event.deltaY;
  }

  private dragging = false;
  private dragStartX = 0;
  private dragStartScrollLeft = 0;
  private dragMoved = 0;
  private suppressNextClick = false;

  onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    this.dragging = true;
    this.dragMoved = 0;
    this.dragStartX = event.clientX;
    this.dragStartScrollLeft = this.scrollEl().nativeElement.scrollLeft;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const dx = event.clientX - this.dragStartX;
    this.dragMoved = Math.max(this.dragMoved, Math.abs(dx));
    this.scrollEl().nativeElement.scrollLeft = this.dragStartScrollLeft - dx;
  }

  onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    // A real drag (moved more than a few px) must not also fire the click
    // that would otherwise land on whatever day cell is now under the cursor.
    if (this.dragMoved > 4) this.suppressNextClick = true;
  }

  private updateArrows(): void {
    const el = this.scrollEl()?.nativeElement;
    if (!el) return;
    this.canScrollLeft.set(el.scrollLeft > 1);
    this.canScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  onScroll(): void {
    this.updateArrows();
  }

  scrollByCells(count: number): void {
    const el = this.scrollEl().nativeElement;
    el.scrollBy({ left: count * this.dayWidth(), behavior: 'smooth' });
  }
}
