/**
 * Pure formatting helpers that derive a transport's display strings from its
 * structured fields (route + mode-specific detail), replacing the former free-text
 * `title`. Shared by the timeline cards, the transport list, the flight card and the
 * details dialog so every surface presents the same route-first headline.
 */
import { TransportDto } from '../models/trip.model';

/** Mode-specific origin fallback when no generic `fromLocation` is set. */
function fromFallback(t: TransportDto): string | undefined {
  switch (t.mode) {
    case 'flight':
      return t.fromAirport;
    case 'train':
      return t.fromStation;
    case 'bus':
      return t.fromStop;
    default:
      return undefined;
  }
}

/** Mode-specific destination fallback when no generic `toLocation` is set. */
function toFallback(t: TransportDto): string | undefined {
  switch (t.mode) {
    case 'flight':
      return t.toAirport;
    case 'train':
      return t.toStation;
    case 'bus':
      return t.toStop;
    default:
      return undefined;
  }
}

/** Origin label: the city, else the mode-specific origin, else "?". */
export function transportFrom(t: TransportDto): string {
  return t.fromLocation || fromFallback(t) || '?';
}

/** Destination label: the city, else the mode-specific destination, else "?". */
export function transportTo(t: TransportDto): string {
  return t.toLocation || toFallback(t) || '?';
}

/** Single-line route headline for confirm/drag messages and dialog headings. */
export function transportLabel(t: TransportDto): string {
  return `${transportFrom(t)} → ${transportTo(t)}`;
}

/** "place · terminal/platform" when both are present, else whichever exists. */
function endpointDetail(place?: string, sub?: string): string | undefined {
  const p = place?.trim();
  const s = sub?.trim();
  if (p && s) return `${p} · ${s}`;
  return p || s || undefined;
}

/**
 * Mode-specific detail for the departure leg: airport (+ terminal) for flights,
 * station (+ platform) for trains, stop for buses. Undefined when nothing is set.
 */
export function transportFromDetail(t: TransportDto): string | undefined {
  switch (t.mode) {
    case 'flight':
      return endpointDetail(t.fromAirport, t.fromTerminal);
    case 'train':
      return endpointDetail(t.fromStation, t.fromPlatform);
    case 'bus':
      return endpointDetail(t.fromStop, undefined);
    default:
      return undefined;
  }
}

/** Mode-specific detail for the arrival leg (see {@link transportFromDetail}). */
export function transportToDetail(t: TransportDto): string | undefined {
  switch (t.mode) {
    case 'flight':
      return endpointDetail(t.toAirport, t.toTerminal);
    case 'train':
      return endpointDetail(t.toStation, t.toPlatform);
    case 'bus':
      return endpointDetail(t.toStop, undefined);
    default:
      return undefined;
  }
}

/**
 * "Car 6 · Seat 20-C" — the reserved car/seat (#59), shared by every surface
 * that shows it (details group, Reservations row, transport/timeline chips,
 * markdown export, reservation .ics). `trainCar` only counts for trains (it's
 * meaningless for a flight/bus); `seat` counts for train/flight/bus. Either
 * part alone renders on its own; undefined when neither is set.
 */
export function seatLabel(t: TransportDto): string | undefined {
  const car = t.mode === 'train' ? t.trainCar?.trim() : undefined;
  const seat = t.seat?.trim();
  if (car && seat) return `Car ${car} · Seat ${seat}`;
  if (car) return `Car ${car}`;
  if (seat) return `Seat ${seat}`;
  return undefined;
}
