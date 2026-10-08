/**
 * Pure per-day model shared by the desktop views that need a day-by-day read
 * of the trip without the List's own rendering machinery (`TripStrip` here in
 * D2, then Columns/Week/Map in D3-D6). It reads the same ingredients
 * `TimelineView.layout()` does — the car pickup/return deadlines, the
 * `dayStayInfo` line, the boundary-leg detection for the virtual
 * departure/return day — but is a fresh, independent read of `TripDto` +
 * `TimeZoneService`: the List view keeps its own implementation (straddle
 * cards, split halves, continues rows, now-line, drag-drop) completely
 * untouched.
 *
 * Unlike the List, which renders a day-crossing entry as a floating straddle
 * card anchored on the separator line, this model keeps every entry on its
 * START day (destination tz) and — when it crosses a day boundary (midnight
 * or a zone change) — adds an `arrivesLabel` ("arrives Day 14") instead.
 */
import { DateTime } from 'luxon';
import type { CarDeadline } from '../timeline/day-section';
import { computeEntrySpan } from '../timeline/day-span';
import { CarLine, dayStayInfo, StayLine } from '../timeline/day-stay';
import { AccommodationDto, TimelineEntry, TripDto } from '../../models/trip.model';
import { TimeZoneService, TripDay } from '../../services/time-zone.service';
import { accommodationColors, carReservationColors } from '../../shared/color/color';

/** One activity/transport entry in a day's sorted list. */
export interface TripDayEntryItem {
  kind: 'entry';
  entry: TimelineEntry;
  sortMillis: number;
  /**
   * Set when this entry crosses a destination-tz day boundary (midnight or a
   * zone change): "arrives Day N". The entry still appears on its START day —
   * it is never moved or split here, unlike the List's straddle/split cards.
   */
  arrivesLabel?: string;
}

/** One car pickup/return deadline in a day's sorted list (see `day-section.ts`). */
export interface TripDayDeadlineItem {
  kind: 'deadline';
  deadline: CarDeadline;
  sortMillis: number;
}

export type TripDayItem = TripDayEntryItem | TripDayDeadlineItem;

/** One real day of the trip, in the destination tz. */
export interface TripDayModel {
  /** 1-based running day number ("Day 7"). */
  index: number;
  /** Destination-tz calendar date: "YYYY-MM-DD". */
  date: string;
  /** Short weekday, e.g. "Mon". */
  weekday: string;
  /** Bare day-of-month, e.g. "22". */
  dayOfMonth: string;
  /** Short month, e.g. "Nov". */
  month: string;
  /** Entries + car deadlines, sorted by time (untimed deadlines float to the top). */
  items: TripDayItem[];
  /**
   * The day's accommodation line (see `dayStayInfo`) — `stay.accommodation`
   * is the covering stay (the one whose night covers this day), when there
   * is one.
   */
  stay: StayLine;
  /** The car reservation covering the day (`car.reservation`), when a rental runs. */
  car?: CarLine;
}

/** A grayed virtual day for an international boundary flight (see `TimelineView`). */
export interface TripVirtualDayModel {
  label: 'Departure Day' | 'Return Day';
  weekday: string;
  dayOfMonth: string;
  month: string;
  /** Home-zone city label. */
  city: string;
}

export interface TripDayModelResult {
  days: TripDayModel[];
  /** The grayed day before day 1 (home tz), when an inbound flight lands at/before
   * day 1 from another zone. */
  leading?: TripVirtualDayModel;
  /** The grayed day after the last day (home tz), mirror of `leading`. */
  trailing?: TripVirtualDayModel;
}

/**
 * Resolve a destination-tz date to its 0-based position in `days`, clamped to
 * the trip's range — same convention as `TimelineView`'s own `clampIndex`.
 */
function clampIndex(date: string, days: TripDay[]): number {
  if (!days.length) return 0;
  if (date <= days[0].date) return 0;
  if (date >= days[days.length - 1].date) return days.length - 1;
  const idx = days.findIndex((d) => d.date === date);
  return idx < 0 ? 0 : idx;
}

function virtualDay(
  label: 'Departure Day' | 'Return Day',
  zone: string,
  dt: DateTime,
  tz: TimeZoneService,
): TripVirtualDayModel {
  return {
    label,
    weekday: dt.toFormat('ccc'),
    dayOfMonth: dt.toFormat('d'),
    month: dt.toFormat('LLL'),
    city: tz.zoneCity(zone),
  };
}

/**
 * Build the per-day model for every day of the trip (destination tz), plus
 * the leading/trailing virtual day info when the trip has an international
 * boundary flight at either edge.
 */
export function buildTripDayModel(
  trip: TripDto,
  tz: TimeZoneService,
): TripDayModelResult {
  const days = tz.enumerateDays(trip);
  if (!days.length) return { days: [] };

  const destZone = trip.destinationTimeZone;
  const firstDate = days[0].date;
  const lastDate = days[days.length - 1].date;

  // Boundary international legs — same detection `TimelineView.layout()` uses
  // for the virtual departure/return day: the inbound flight landing INTO the
  // destination at/before day 1, and the outbound flight leaving the
  // destination at/after the last day. Unlike the List, this helper does NOT
  // exclude them from the normal per-day buckets below — their own-zone start
  // date simply clamps to day 1 / the last day, same as every other entry.
  const leadingLeg = trip.transport
    .filter(
      (t) =>
        t.end &&
        t.start.zone !== destZone &&
        t.end.zone === destZone &&
        tz.dayKeyInDestination(t.start, destZone) <= firstDate,
    )
    .sort((a, b) => tz.toMillis(a.start) - tz.toMillis(b.start))[0];
  const trailingLeg = trip.transport
    .filter(
      (t) =>
        t.end &&
        t.end.zone !== destZone &&
        t.start.zone === destZone &&
        tz.dayKeyInDestination(t.end, destZone) >= lastDate,
    )
    .sort((a, b) => tz.toMillis(b.end!) - tz.toMillis(a.end!))[0];

  const buckets = new Map<string, TripDayItem[]>();
  for (const day of days) buckets.set(day.date, []);

  const handle = (entry: TimelineEntry): void => {
    const span = computeEntrySpan(entry);
    const startIdx = clampIndex(span.startKey, days);
    const endIdx = span.crosses ? clampIndex(span.endKey, days) : startIdx;
    const arrivesLabel =
      endIdx > startIdx ? `arrives Day ${days[endIdx].index}` : undefined;
    buckets.get(days[startIdx].date)!.push({
      kind: 'entry',
      entry,
      sortMillis: tz.toMillis(entry.start),
      arrivesLabel,
    });
  };

  for (const a of trip.activities) {
    handle({ kind: 'activity', activity: a, start: a.start });
  }
  for (const t of trip.transport) {
    handle({ kind: 'transport', transport: t, start: t.start });
  }

  // Car pickup/return deadlines, bucketed into the exact day they fall on —
  // a deadline outside the trip range simply isn't shown, same as the List.
  const carColorById = carReservationColors(trip.carReservations);
  const pushDeadline = (date: string, d: CarDeadline): void => {
    if (!buckets.has(date)) return;
    buckets.get(date)!.push({
      kind: 'deadline',
      deadline: d,
      sortMillis: d.time
        ? tz.toMillis({ dateTime: `${date}T${d.time}`, zone: destZone })
        : Number.NEGATIVE_INFINITY,
    });
  };
  for (const c of trip.carReservations) {
    const color = carColorById.get(c.id) ?? '';
    pushDeadline(c.pickupDate, {
      car: c,
      kind: 'pickup',
      label: 'Fetch by',
      shortLabel: 'Pick up',
      time: c.pickupTime ?? '',
      company: c.company ?? '',
      location: c.pickupLocation ?? '',
      color,
    });
    pushDeadline(c.dropoffDate, {
      car: c,
      kind: 'dropoff',
      label: 'Return by',
      shortLabel: 'Return',
      time: c.dropoffTime ?? '',
      company: c.company ?? '',
      location: c.dropoffLocation ?? '',
      color,
    });
  }

  // Per-day covering stay/car + the `dayStayInfo` line, same half-day-handoff
  // convention as `TimelineView.nightOf`: a day's night stay is the
  // accommodation covering that date, its morning stay the previous day's.
  const accColorById = accommodationColors(trip.accommodations);
  const nightOf: (AccommodationDto | undefined)[] = days.map((d) =>
    trip.accommodations.find(
      (a) => a.checkInDate <= d.date && d.date < a.checkOutDate,
    ),
  );

  const resultDays: TripDayModel[] = days.map((day, i) => {
    const items = (buckets.get(day.date) ?? []).sort(
      (a, b) => a.sortMillis - b.sortMillis,
    );
    const night = nightOf[i];
    const morning = i > 0 ? nightOf[i - 1] : undefined;
    // No day-crossing-transport "mode" is threaded through here (unlike
    // `TimelineView.layout()`'s `straddleModeByIndex`) — kept simple per the
    // issue; a no-stay night just reads "No stay booked" rather than the
    // List's richer "Night on the overnight bus" wording.
    const info = dayStayInfo(
      day.date,
      morning,
      night,
      trip.carReservations,
      undefined,
      (a) => accColorById.get(a.id) ?? '',
      (c) => carColorById.get(c.id) ?? '',
    );
    return {
      index: day.index,
      date: day.date,
      weekday: day.startOfDay.toFormat('ccc'),
      dayOfMonth: day.startOfDay.toFormat('d'),
      month: day.startOfDay.toFormat('LLL'),
      items,
      stay: info.stay,
      car: info.car,
    };
  });

  const leading = leadingLeg
    ? virtualDay(
        'Departure Day',
        leadingLeg.start.zone,
        tz.toDateTime(leadingLeg.start),
        tz,
      )
    : undefined;
  const trailing = trailingLeg
    ? virtualDay(
        'Return Day',
        trailingLeg.end!.zone,
        tz.toDateTime(trailingLeg.end!),
        tz,
      )
    : undefined;

  return { days: resultDays, leading, trailing };
}
