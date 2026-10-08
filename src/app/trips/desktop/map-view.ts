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
  viewChildren,
} from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
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
import { GoogleMapsLoaderService } from '../../services/google-maps-loader.service';
import { zoneLabel } from '../../shared/format/date-format';
import { EntryCard } from '../timeline/entry-card';
import { TripStrip } from './trip-strip';
import { buildTripDayModel, TripDayModel } from './trip-day-model';
import {
  activeDayFromScroll,
  buildMapContent,
  collectPoints,
  countWithoutLocation,
  DayMapContent,
  initialSelectedDate,
  MapLine,
  MapMarker,
  MapStayMarker,
  selectionRange,
} from './map-layout';

/** Fallback map center before anything is located yet (central Japan). */
const FALLBACK_CENTER: google.maps.LatLngLiteral = { lat: 36, lng: 138 };

/** How long a marker-click highlight stays on the list card (ms). */
const CLICK_HIGHLIGHT_MS = 1600;

/**
 * Desktop D6 (#50): the "Map" timeline view — `TripStrip` (D2) over the full
 * content width, then a fixed-width list panel (the selected day(s), in the
 * Columns/mobile style) on the left and the Google map filling the rest on
 * the right. Only ever mounted when `GOOGLE_MAPS_CONFIGURED` (the host's
 * `@defer` + `TimelineViewModeService.available` both gate it), so it's safe
 * to import `@angular/google-maps` statically here.
 *
 * The actual draw plan (which markers/lines/stay marker, numbering, the
 * active/faded split, the "without location" count) is the pure, unit-tested
 * [map-layout.ts](./map-layout.ts) — this component only wires the strip,
 * the list panel's scroll position and the real `google.maps` calls
 * (fitBounds, polyline/marker content) to it.
 */
@Component({
  selector: 'app-map-view',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TripStrip,
    EntryCard,
    GoogleMap,
  ],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
  host: {
    '(window:resize)': 'updateHeight()',
  },
})
export class MapView {
  readonly id = input.required<string>();

  private readonly store = inject(TripStore);
  private readonly tz = inject(TimeZoneService);
  private readonly actions = inject(TripActionsService);
  private readonly clock = inject(ClockService);
  private readonly loader = inject(GoogleMapsLoaderService);
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

  readonly todayKey = computed<string | undefined>(() => {
    const trip = this.trip();
    if (!trip) return undefined;
    return this.clock.now().setZone(trip.destinationTimeZone).toISODate() ?? undefined;
  });

  // --- Selection (one day by default, Shift+click a range) -----------------

  readonly selectedDates = signal<string[]>([]);
  private readonly anchorDate = signal<string | undefined>(undefined);
  /** The day whose header currently sits at the top of the list panel — also
   * the "strong" day on the map; the rest of the selection fades. */
  readonly activeDate = signal<string | undefined>(undefined);
  private readonly initialized = signal(false);

  readonly selectedDayModels = computed<TripDayModel[]>(() => {
    const selected = new Set(this.selectedDates());
    return this.days().filter((d) => selected.has(d.date));
  });

  constructor() {
    // Initial selection, once: today when the trip is running, else Day 1.
    effect(() => {
      const days = this.days();
      if (this.initialized() || !days.length) return;
      const initial = initialSelectedDate(this.todayKey(), days);
      if (initial) {
        this.selectedDates.set([initial]);
        this.anchorDate.set(initial);
        this.activeDate.set(initial);
      }
      this.initialized.set(true);
    });

    afterNextRender(() => {
      const el = this.mapRowEl()?.nativeElement;
      if (!el) return;
      this.resizeObserver = new ResizeObserver(() => this.updateHeight());
      this.resizeObserver.observe(el);
      this.updateHeight();
    });
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());

    void this.loader.load().then((ok) => this.mapsReady.set(ok));

    // Markers/lines are managed imperatively (not as `<map-advanced-marker>`/
    // `<map-polyline>` template children) — with an invalid/missing API key
    // the map instance is left in a degraded state by Google's own script
    // (its overlay already tells the user), and letting Angular's own
    // directives bind to it there turned out to throw deep inside Google's
    // minified code, repeatedly, in a way that stalled the whole app's
    // change detection. Building/placing each overlay by hand, inside its
    // own try/catch, keeps that failure local — verified with a deliberately
    // fake key (no real key available in this environment): the overlay
    // shows, no console errors, and the app stays fully interactive.
    effect(() => {
      // Tracked: redraw whenever the plan, the map's readiness or the map
      // instance itself changes (selection/active day, or mount/unmount).
      this.mapContent();
      this.mapsReady();
      this.mapRef();
      this.drawOverlays();
    });

    // Hover/click linking (card ↔ marker) just mutates the already-placed
    // marker DOM nodes — cheap, and never touches the Google Maps API, so it
    // can't hit the same failure mode as drawing/removing overlays.
    effect(() => {
      const linkedId = this.hoverEntryId();
      for (const [id, elements] of this.markerContentByEntryId) {
        const linked = id === linkedId;
        for (const el of elements) {
          el.style.border = linked ? '2px solid #162e63' : '2px solid #fff';
          el.style.transform = linked ? 'scale(1.2)' : 'scale(1)';
        }
      }
    });

    this.destroyRef.onDestroy(() => this.clearOverlays());
  }

  // --- Imperative marker/polyline management ---------------------------------

  private readonly markerOverlays: google.maps.marker.AdvancedMarkerElement[] = [];
  private readonly polylineOverlays: google.maps.Polyline[] = [];
  private readonly markerContentByEntryId = new Map<string, HTMLElement[]>();

  private clearOverlays(): void {
    for (const m of this.markerOverlays) {
      try {
        m.map = null;
      } catch {
        // Degraded map instance — nothing more to clean up.
      }
    }
    this.markerOverlays.length = 0;
    for (const p of this.polylineOverlays) {
      try {
        p.setMap(null);
      } catch {
        // Same as above.
      }
    }
    this.polylineOverlays.length = 0;
    this.markerContentByEntryId.clear();
  }

  private registerMarkerContent(id: string, el: HTMLElement): void {
    const list = this.markerContentByEntryId.get(id);
    if (list) list.push(el);
    else this.markerContentByEntryId.set(id, [el]);
  }

  /** Place every marker/line for the current `mapContent()`, then fit the
   * map to them — each overlay (and the fit itself) is independently
   * guarded, so one failure (e.g. a degraded map under an invalid key)
   * never stops the rest from being created or breaks the app. */
  private drawOverlays(): void {
    this.clearOverlays();
    const gm = this.mapRef()?.googleMap;
    if (!gm || !this.mapsReady() || typeof google === 'undefined' || !google.maps?.marker) {
      return;
    }

    for (const day of this.mapContent()) {
      for (const m of day.markers) {
        try {
          const content = this.markerContent(m);
          const id = this.entryId(m.entry);
          content.addEventListener('mouseenter', () => this.hoverEntryId.set(id));
          content.addEventListener('mouseleave', () => this.hoverEntryId.set(undefined));
          content.addEventListener('click', () => this.onMarkerClick(m.entry));
          content.addEventListener('dblclick', () => this.openEntry(m.entry));
          this.registerMarkerContent(id, content);
          const marker = new google.maps.marker.AdvancedMarkerElement({
            map: gm,
            position: { lat: m.point.lat, lng: m.point.lng },
            content,
            title: this.markerTitle(m),
          });
          this.markerOverlays.push(marker);
        } catch {
          // One marker failing to place (degraded map) shouldn't stop the rest.
        }
      }

      if (day.stay) {
        const stay = day.stay;
        try {
          const content = this.stayMarkerContent(stay);
          content.addEventListener('click', () => this.openAccommodation(stay.accommodation));
          const marker = new google.maps.marker.AdvancedMarkerElement({
            map: gm,
            position: { lat: stay.point.lat, lng: stay.point.lng },
            content,
            title: stay.accommodation.name,
          });
          this.markerOverlays.push(marker);
        } catch {
          // Same as above.
        }
      }

      for (const l of day.lines) {
        try {
          const polyline = new google.maps.Polyline({
            map: gm,
            path: [l.from, l.to],
            ...this.polylineOptions(l),
          });
          this.polylineOverlays.push(polyline);
        } catch {
          // Same as above.
        }
      }
    }

    try {
      const points = collectPoints(this.mapContent());
      if (points.length) {
        const bounds = new google.maps.LatLngBounds();
        for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
        gm.fitBounds(bounds, 56);
      }
    } catch {
      // Same as above — fitBounds on a degraded map instance can throw too.
    }
  }

  /** Both of `TripStrip`'s `dayClickModified` payload fields — plain click
   * replaces the selection with that one day, Shift+click extends the range
   * from the last plain click. */
  onStripClick(event: { date: string; shiftKey: boolean }): void {
    const { date, shiftKey } = event;
    if (shiftKey && this.anchorDate()) {
      this.selectedDates.set(selectionRange(this.days(), this.anchorDate()!, date));
    } else {
      this.selectedDates.set([date]);
      this.anchorDate.set(date);
    }
    this.activeDate.set(date);
    this.scrollListToDay(date);
  }

  // --- List panel: day blocks + scroll → active day -------------------------

  private readonly listEl = viewChild<ElementRef<HTMLElement>>('listEl');
  private readonly dayHeaderEls =
    viewChildren<ElementRef<HTMLElement>>('dayHeaderEl');

  showZoneFor(day: TripDayModel): boolean {
    return this.selectedDayModels()[0]?.date === day.date;
  }

  stayText(day: TripDayModel): string {
    const stay = day.stay;
    if (!stay.text) return '';
    const acc = stay.accommodation;
    if (acc && acc.checkInDate === day.date && acc.fullName && acc.fullName !== acc.name) {
      return `${stay.text} · ${acc.fullName}`;
    }
    return stay.text;
  }

  entryId(entry: TimelineEntry): string {
    return entry.activity?.id ?? entry.transport?.id ?? '';
  }

  readonly hoverEntryId = signal<string | undefined>(undefined);
  readonly clickedEntryId = signal<string | undefined>(undefined);
  private clickHighlightTimer?: ReturnType<typeof setTimeout>;

  onListScroll(): void {
    const viewport = this.listEl()?.nativeElement;
    if (!viewport) return;
    const viewportTop = viewport.getBoundingClientRect().top;
    const models = this.selectedDayModels();
    const positions = this.dayHeaderEls().map((el, i) => ({
      date: models[i]?.date ?? '',
      top: el.nativeElement.getBoundingClientRect().top - viewportTop,
    }));
    const active = activeDayFromScroll(positions, 0);
    if (active && active !== this.activeDate()) this.activeDate.set(active);
  }

  private scrollListToDay(date: string): void {
    const index = this.selectedDayModels().findIndex((d) => d.date === date);
    const el = this.dayHeaderEls()[index]?.nativeElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private scrollListToEntry(id: string): void {
    const viewport = this.listEl()?.nativeElement;
    const target = viewport?.querySelector<HTMLElement>(`[data-entry-id="${id}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.clickedEntryId.set(id);
    clearTimeout(this.clickHighlightTimer);
    this.clickHighlightTimer = setTimeout(
      () => this.clickedEntryId.set(undefined),
      CLICK_HIGHLIGHT_MS,
    );
  }

  // --- Map content (pure plan from map-layout.ts) ---------------------------

  readonly mapContent = computed<DayMapContent[]>(() =>
    buildMapContent(this.days(), this.selectedDates(), this.activeDate()),
  );
  readonly missingCount = computed(() => countWithoutLocation(this.mapContent()));

  readonly mapsReady = signal(false);
  readonly mapId = this.loader.mapId;
  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: 'greedy',
    clickableIcons: false,
  };
  readonly initialCenter = FALLBACK_CENTER;

  private readonly mapRef = viewChild(GoogleMap);

  private readonly mapRowEl = viewChild<ElementRef<HTMLElement>>('mapRow');
  private resizeObserver?: ResizeObserver;
  readonly rowHeight = signal(400);

  updateHeight(): void {
    const el = this.mapRowEl()?.nativeElement;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    this.rowHeight.set(Math.max(240, Math.floor(window.innerHeight - top)));
  }

  private markerTitle(m: MapMarker): string {
    return m.entry.activity?.title ?? '';
  }

  /** A small numbered circle in the entry's type colour — strong for the
   * active day, faded for the rest. Hover/click linking (the border/scale
   * below) is applied afterwards by the imperative hover effect, not here —
   * this only sets the initial, unlinked look. */
  private markerContent(m: MapMarker): HTMLElement {
    const div = document.createElement('div');
    div.textContent = String(m.number);
    Object.assign(div.style, {
      width: '24px',
      height: '24px',
      lineHeight: '24px',
      textAlign: 'center',
      borderRadius: '50%',
      background: m.color,
      color: '#fff',
      fontSize: '11px',
      fontWeight: '700',
      fontFamily: 'Roboto, sans-serif',
      border: '2px solid #fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
      opacity: m.active ? '1' : '0.45',
      transform: 'scale(1)',
      cursor: 'pointer',
      transition: 'transform 0.1s ease, border-color 0.1s ease',
    });
    return div;
  }

  /** A small bed-glyph tile in the stay's colour, same active/faded split. */
  private stayMarkerContent(stay: MapStayMarker): HTMLElement {
    const div = document.createElement('div');
    div.textContent = '🛏️';
    Object.assign(div.style, {
      width: '28px',
      height: '28px',
      lineHeight: '28px',
      textAlign: 'center',
      borderRadius: '7px',
      background: stay.color,
      fontSize: '14px',
      border: '2px solid #fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
      opacity: stay.active ? '1' : '0.45',
      cursor: 'pointer',
    });
    return div;
  }

  /** Geodesic line, dashed (via a repeating line-symbol icon, the standard
   * Maps JS trick — a Polyline has no native dash style) for flights. */
  private polylineOptions(l: MapLine): google.maps.PolylineOptions {
    const opacity = l.active ? 0.9 : 0.35;
    if (l.dashed) {
      return {
        geodesic: true,
        strokeOpacity: 0,
        strokeColor: l.color,
        icons: [
          {
            icon: { path: 'M 0,-1 0,1', strokeOpacity: opacity, scale: 3 },
            offset: '0',
            repeat: '14px',
          },
        ],
      };
    }
    return { geodesic: true, strokeColor: l.color, strokeOpacity: opacity, strokeWeight: 3 };
  }

  private onMarkerClick(entry: TimelineEntry): void {
    this.scrollListToEntry(this.entryId(entry));
  }

  // --- Actions (shared with Columns/Week via TripActionsService) -----------

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

  locatePlaces(): void {
    const trip = this.trip();
    if (trip) void this.actions.locatePlaces(trip);
  }
}
