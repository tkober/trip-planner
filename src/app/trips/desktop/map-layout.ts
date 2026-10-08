/**
 * Pure helpers for the Map view (D6, #50): which points/lines/markers to draw
 * on the Google map for the selected days, day/range selection from a strip
 * click, and deriving the "active" day from the list panel's scroll
 * position. Kept free of Angular/Google Maps so they're plain, unit-tested
 * functions — `MapView` only wires them to the strip, the list panel's
 * scroll handler and the actual `google.maps` calls (fitBounds etc.).
 */
import { AccommodationDto, GeoPoint, TimelineEntry } from '../../models/trip.model';
import { activityColor, transportColor } from '../../shared/color/color';
import { TripDayModel } from './trip-day-model';

/** One numbered marker for a located activity, or a located transport leg
 * with only one known endpoint. */
export interface MapMarker {
  id: string;
  point: GeoPoint;
  /** 1-based, per day, in the day's time order (activities + transport share
   * one running sequence so the map numbers match the list order). */
  number: number;
  color: string;
  /** Whether this marker belongs to the currently-active day (strong vs faded). */
  active: boolean;
  entry: TimelineEntry;
}

/** A transport leg with both endpoints located — drawn as a geodesic line,
 * dashed for flights. */
export interface MapLine {
  id: string;
  number: number;
  from: GeoPoint;
  to: GeoPoint;
  color: string;
  dashed: boolean;
  active: boolean;
  entry: TimelineEntry;
}

/** The night's accommodation, drawn as a bed marker in the stay's colour. */
export interface MapStayMarker {
  id: string;
  point: GeoPoint;
  color: string;
  active: boolean;
  accommodation: AccommodationDto;
}

export interface DayMapContent {
  date: string;
  active: boolean;
  markers: MapMarker[];
  lines: MapLine[];
  stay?: MapStayMarker;
  /** Entries on this day with no `GeoPoint` at all (neither endpoint for
   * transport, no `geo` for an activity) — feeds the "N entries without
   * location" counter chip. */
  missing: number;
}

function entryColor(entry: TimelineEntry): string {
  return entry.kind === 'activity'
    ? activityColor(entry.activity!)
    : transportColor(entry.transport!);
}

/**
 * Build one day's map content: a running per-day marker/line number in time
 * order, a line for every transport leg with both endpoints located (dashed
 * for flights), a single marker for a transport leg with only one located
 * endpoint, a numbered marker per located activity, the night's stay as a
 * bed marker (only when the covering accommodation itself has a `geo`), and
 * a count of entries with no location at all.
 */
export function buildDayMapContent(day: TripDayModel, active: boolean): DayMapContent {
  const markers: MapMarker[] = [];
  const lines: MapLine[] = [];
  let missing = 0;
  let number = 0;

  for (const item of day.items) {
    if (item.kind !== 'entry') continue;
    const entry = item.entry;
    const color = entryColor(entry);
    if (entry.kind === 'transport') {
      const t = entry.transport!;
      if (t.fromGeo && t.toGeo) {
        number++;
        lines.push({
          id: t.id,
          number,
          from: t.fromGeo,
          to: t.toGeo,
          color,
          dashed: t.mode === 'flight',
          active,
          entry,
        });
      } else if (t.fromGeo || t.toGeo) {
        number++;
        markers.push({
          id: t.id,
          point: (t.fromGeo ?? t.toGeo)!,
          number,
          color,
          active,
          entry,
        });
      } else {
        missing++;
      }
    } else {
      const a = entry.activity!;
      if (a.geo) {
        number++;
        markers.push({ id: a.id, point: a.geo, number, color, active, entry });
      } else {
        missing++;
      }
    }
  }

  const stayAcc = day.stay.accommodation;
  const stay: MapStayMarker | undefined =
    stayAcc && stayAcc.geo
      ? {
          id: stayAcc.id,
          point: stayAcc.geo,
          color: day.stay.color,
          active,
          accommodation: stayAcc,
        }
      : undefined;

  return { date: day.date, active, markers, lines, stay, missing };
}

/** `buildDayMapContent` for every selected day, `active` set for whichever
 * date equals `activeDate` — the other days render faded. */
export function buildMapContent(
  days: TripDayModel[],
  selectedDates: readonly string[],
  activeDate: string | undefined,
): DayMapContent[] {
  const selected = new Set(selectedDates);
  return days
    .filter((d) => selected.has(d.date))
    .map((d) => buildDayMapContent(d, d.date === activeDate));
}

/** Every point currently drawn (markers, line endpoints, stay) — the input
 * to `fitBounds`. */
export function collectPoints(contents: readonly DayMapContent[]): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (const day of contents) {
    for (const m of day.markers) points.push(m.point);
    for (const l of day.lines) {
      points.push(l.from);
      points.push(l.to);
    }
    if (day.stay) points.push(day.stay.point);
  }
  return points;
}

/** Total entries with no location across the given days — the "N entries
 * without location" counter chip. */
export function countWithoutLocation(contents: readonly DayMapContent[]): number {
  return contents.reduce((sum, d) => sum + d.missing, 0);
}

/** Default selected day: today's date when the trip is running (today falls
 * within `days`), else the first day. `undefined` when there are no days. */
export function initialSelectedDate(
  todayKey: string | undefined,
  days: readonly TripDayModel[],
): string | undefined {
  if (!days.length) return undefined;
  if (todayKey && days.some((d) => d.date === todayKey)) return todayKey;
  return days[0].date;
}

/**
 * The contiguous range of date keys between `anchorDate` and `clickedDate`
 * (inclusive, in trip order) — Shift+click a day in the strip. Falls back to
 * just `clickedDate` when either date isn't found (e.g. a virtual day).
 */
export function selectionRange(
  days: readonly TripDayModel[],
  anchorDate: string,
  clickedDate: string,
): string[] {
  const dates = days.map((d) => d.date);
  const anchorIdx = dates.indexOf(anchorDate);
  const clickedIdx = dates.indexOf(clickedDate);
  if (anchorIdx < 0 || clickedIdx < 0) return [clickedDate];
  const [lo, hi] = anchorIdx <= clickedIdx ? [anchorIdx, clickedIdx] : [clickedIdx, anchorIdx];
  return dates.slice(lo, hi + 1);
}

export interface DayScrollPosition {
  date: string;
  /** The day header's top offset relative to the scroll viewport's own top
   * (i.e. `header.getBoundingClientRect().top - viewport.getBoundingClientRect().top`). */
  top: number;
}

/**
 * Which day's header sits at (or just above) the top of the list panel's
 * viewport while scrolling — "the day whose header is at the top" rule from
 * the issue. `positions` must be sorted by `top` ascending (their natural
 * document order). Returns the first day when none has scrolled past yet
 * (e.g. right after mount), and the last day once every header has scrolled
 * past (e.g. scrolled all the way to the bottom).
 */
export function activeDayFromScroll(
  positions: readonly DayScrollPosition[],
  viewportTop = 0,
): string | undefined {
  if (!positions.length) return undefined;
  let best = positions[0];
  for (const p of positions) {
    if (p.top <= viewportTop + 1) best = p;
    else break;
  }
  return best.date;
}
