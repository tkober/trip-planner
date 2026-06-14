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
 * Mode-specific subtitle: airport (+ terminal) for flights, station (+ platform)
 * for trains, stop for buses — rendered as "FROM → TO". Undefined when nothing set.
 */
export function transportSubtitle(t: TransportDto): string | undefined {
  let from: string | undefined;
  let to: string | undefined;
  switch (t.mode) {
    case 'flight':
      from = endpointDetail(t.fromAirport, t.fromTerminal);
      to = endpointDetail(t.toAirport, t.toTerminal);
      break;
    case 'train':
      from = endpointDetail(t.fromStation, t.fromPlatform);
      to = endpointDetail(t.toStation, t.toPlatform);
      break;
    case 'bus':
      from = endpointDetail(t.fromStop, undefined);
      to = endpointDetail(t.toStop, undefined);
      break;
    default:
      return undefined;
  }
  if (!from && !to) return undefined;
  return `${from ?? '?'} → ${to ?? '?'}`;
}
