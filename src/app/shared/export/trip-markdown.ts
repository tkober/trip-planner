/**
 * Render a trip as structured Markdown — a text-only export aimed at feeding the
 * plan to an LLM / agent (no graphical timeline). Like {@link anonymizeTrip} this
 * is a pure data transform: it reads only the `TripDto` (already anonymized when
 * requested) plus the stateless {@link TimeZoneService} for Luxon date math, so it
 * needs none of the off-screen DOM rendering the PNG/PDF exports rely on.
 *
 * Structure: trip header + Overview, then Accommodations and Car rentals as
 * reference lists (they span days), then a day-by-day Itinerary with the overnight
 * stay and every activity/transport leg interleaved in chronological order. Times
 * are printed in their own IANA zone with the full date, so a day- or zone-crossing
 * flight is unambiguous and an LLM can compute anything from it.
 */
import { DateTime } from 'luxon';
import {
  AccommodationDto,
  ActivityDto,
  CostInfo,
  TransportDto,
  TripDto,
  ZonedTime,
} from '../../models/trip.model';
import { TimeZoneService } from '../../services/time-zone.service';
import {
  transportFrom,
  transportFromDetail,
  transportTo,
  transportToDetail,
} from '../transport-format';
import { formatEur, formatMoney, tripCostSummary } from '../cost/cost';

/** Markdown bullet lines for an entity's cost (indented for sub-lists). */
function costLines(c: CostInfo, indent = ''): string[] {
  const out: string[] = [];
  const money = (n: number) => formatMoney(n, c.currency);
  if (c.totalPrice != null) out.push(`${indent}- Price: ${money(c.totalPrice)}`);
  if (c.alreadyPaid) out.push(`${indent}- Already paid: yes`);
  if (c.cancellationCost != null)
    out.push(`${indent}- Cancellation cost: ${money(c.cancellationCost)}`);
  if (c.paymentDate) out.push(`${indent}- Payment date: ${c.paymentDate}`);
  if (c.freeCancellationUntil)
    out.push(`${indent}- Free cancellation until: ${c.freeCancellationUntil}`);
  return out;
}

const MODE_LABEL: Record<TransportDto['mode'], string> = {
  flight: 'Flight',
  train: 'Train',
  bus: 'Bus',
  car: 'Car',
};

/** Build the full Markdown document for a trip. */
export function tripToMarkdown(
  trip: TripDto,
  tz: TimeZoneService,
  anonymized = false,
): string {
  const destZone = trip.destinationTimeZone;
  const days = tz.enumerateDays(trip);
  const firstDate = days.length ? days[0].date : trip.startDate;
  const lastDate = days.length ? days[days.length - 1].date : trip.endDate;

  // --- shared formatting helpers -----------------------------------------
  const calDate = (date: string) =>
    DateTime.fromISO(date).toFormat('cccc, d LLLL yyyy');
  const moment = (zt: ZonedTime) =>
    `${tz.toDateTime(zt).toFormat('yyyy-LL-dd HH:mm')} (${zt.zone})`;

  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  // --- header ------------------------------------------------------------
  push(`# ${trip.title}`);
  push();
  if (anonymized) {
    push(
      '> _Anonymized for sharing — some fields are redacted (█████) or omitted._',
    );
    push();
  }
  if (trip.description) {
    push(trip.description);
    push();
  }

  // --- overview ----------------------------------------------------------
  const nights = Math.max(0, days.length - 1);
  push('## Overview');
  push();
  push(`- **Dates:** ${trip.startDate} → ${trip.endDate}`);
  push(`- **Duration:** ${days.length} days, ${nights} nights`);
  push(`- **Destination time zone:** ${destZone} (${tz.zoneCity(destZone)})`);
  push(
    `- **Home time zone:** ${trip.homeTimeZone} (${tz.zoneCity(trip.homeTimeZone)})`,
  );
  push(`- **Accommodations:** ${trip.accommodations.length}`);
  push(`- **Car rentals:** ${trip.carReservations.length}`);
  push(`- **Activities:** ${trip.activities.length}`);
  push(`- **Transport legs:** ${trip.transport.length}`);
  const cost = tripCostSummary(trip, trip.exchangeRates ?? {});
  if (cost.byCategory.length) {
    push(`- **Total cost:** ${formatEur(cost.grandTotalEur)}`);
    push(`- **Already paid:** ${formatEur(cost.paidEur)}`);
    push(`- **Outstanding:** ${formatEur(cost.outstandingEur)}`);
    for (const c of cost.byCategory) {
      const note = c.hasUnconverted
        ? ' (excludes amounts with no exchange rate)'
        : '';
      push(`  - ${c.label}: ${formatEur(c.totalEur)}${note}`);
    }
    if (cost.missingRates.length) {
      push(`- **Missing exchange rates:** ${cost.missingRates.join(', ')}`);
    }
  }
  push();

  // --- accommodations (reference) ----------------------------------------
  push('## Accommodations');
  push();
  if (!trip.accommodations.length) {
    push('_None._');
    push();
  } else {
    const ordered = [...trip.accommodations].sort((a, b) =>
      a.checkInDate.localeCompare(b.checkInDate),
    );
    ordered.forEach((a, i) => {
      const n = tz.nightsBetween(a.checkInDate, a.checkOutDate);
      push(`### ${i + 1}. ${a.name}`);
      if (a.fullName) push(`- Full name: ${a.fullName}`);
      push(
        `- Stay: ${a.checkInDate} → ${a.checkOutDate} (${n} night${n === 1 ? '' : 's'})`,
      );
      if (a.address) push(`- Address: ${a.address}`);
      for (const l of costLines(a)) push(l);
      if (a.googleMapsUrl) push(`- Map: ${a.googleMapsUrl}`);
      if (a.bookingUrl) push(`- Booking: ${a.bookingUrl}`);
      if (a.remarks) push(`- Remarks: ${a.remarks}`);
      push();
    });
  }

  // --- car rentals (reference) -------------------------------------------
  push('## Car rentals');
  push();
  if (!trip.carReservations.length) {
    push('_None._');
    push();
  } else {
    const ordered = [...trip.carReservations].sort((a, b) =>
      a.pickupDate.localeCompare(b.pickupDate),
    );
    ordered.forEach((c, i) => {
      push(`### ${i + 1}. ${c.name}`);
      if (c.company) push(`- Company: ${c.company}`);
      if (c.carType) push(`- Vehicle: ${c.carType}`);
      for (const l of costLines(c)) push(l);
      push(`- Pickup: ${stationLine(c.pickupDate, c.pickupTime, c.pickupLocation)}`);
      push(
        `- Drop-off: ${stationLine(c.dropoffDate, c.dropoffTime, c.dropoffLocation)}`,
      );
      if (c.pickupGoogleMapsUrl) push(`- Pickup map: ${c.pickupGoogleMapsUrl}`);
      if (c.dropoffGoogleMapsUrl)
        push(`- Drop-off map: ${c.dropoffGoogleMapsUrl}`);
      if (c.pickupStationUrl) push(`- Pickup station: ${c.pickupStationUrl}`);
      if (c.dropoffStationUrl) push(`- Drop-off station: ${c.dropoffStationUrl}`);
      if (c.bookingUrl) push(`- Booking: ${c.bookingUrl}`);
      if (c.bookingReference) push(`- Booking ref: ${c.bookingReference}`);
      if (c.remarks) push(`- Remarks: ${c.remarks}`);
      push();
    });
  }

  // --- itinerary (day-by-day) --------------------------------------------
  const byDay = bucketEntries();
  push('## Itinerary');
  push();
  for (const day of days) {
    push(
      `### Day ${day.index} — ${calDate(day.date)} (${tz.zoneCity(destZone)})`,
    );
    const stay = overnightStay(trip.accommodations, day.date);
    if (stay) push(`- **Stay overnight:** ${stay.name}`);
    const entries = byDay.get(day.date) ?? [];
    if (!entries.length) {
      push('- _No activities or transport._');
    } else {
      for (const e of entries) {
        for (const line of e.lines) push(line);
      }
    }
    push();
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

  // --- locals ------------------------------------------------------------
  function stationLine(date: string, time?: string, place?: string): string {
    const when = time ? `${date} ${time}` : date;
    return place ? `${when} — ${place}` : when;
  }

  function activityLines(a: ActivityDto): string[] {
    const out = [`- **Activity — ${a.title}**`];
    out.push(`  - Time: ${moment(a.start)}`);
    if (a.end) {
      out.push(`  - Ends: ${moment(a.end)}`);
      const d = tz.durationLabel(a.start, a.end);
      if (d) out.push(`  - Duration: ${d}`);
    }
    if (a.location) out.push(`  - Location: ${a.location}`);
    if (a.googleMapsUrl) out.push(`  - Map: ${a.googleMapsUrl}`);
    if (a.bookingUrl) out.push(`  - Booking: ${a.bookingUrl}`);
    out.push(...costLines(a, '  '));
    if (a.notes) out.push(`  - Notes: ${a.notes}`);
    return out;
  }

  function transportLines(t: TransportDto): string[] {
    const out = [
      `- **${MODE_LABEL[t.mode]} — ${transportFrom(t)} → ${transportTo(t)}**`,
    ];
    out.push(`  - Departs: ${moment(t.start)}`);
    if (t.end) {
      out.push(`  - Arrives: ${moment(t.end)}`);
      const d = tz.durationLabel(t.start, t.end);
      if (d) out.push(`  - Duration: ${d}`);
    }
    const fromDetail = transportFromDetail(t);
    const toDetail = transportToDetail(t);
    if (fromDetail) out.push(`  - From: ${fromDetail}`);
    if (toDetail) out.push(`  - To: ${toDetail}`);
    switch (t.mode) {
      case 'flight':
        if (t.airline) out.push(`  - Airline: ${t.airline}`);
        if (t.flightNumber) out.push(`  - Flight number: ${t.flightNumber}`);
        break;
      case 'train':
        if (t.line) out.push(`  - Line: ${t.line}`);
        if (t.trainName) out.push(`  - Service: ${t.trainName}`);
        if (t.trainKind) out.push(`  - Type: ${t.trainKind}`);
        if (t.operator) out.push(`  - Operator: ${t.operator}`);
        break;
      case 'bus':
        if (t.line) out.push(`  - Line: ${t.line}`);
        if (t.busKind) out.push(`  - Type: ${t.busKind}`);
        if (t.operator) out.push(`  - Operator: ${t.operator}`);
        break;
    }
    if (t.bookingUrl) out.push(`  - Booking: ${t.bookingUrl}`);
    if (t.bookingReference) out.push(`  - Booking ref: ${t.bookingReference}`);
    out.push(...costLines(t, '  '));
    if (t.notes) out.push(`  - Notes: ${t.notes}`);
    return out;
  }

  /** Group activities + transport into day buckets, sorted chronologically. */
  function bucketEntries(): Map<
    string,
    { start: ZonedTime; lines: string[] }[]
  > {
    const map = new Map<string, { start: ZonedTime; lines: string[] }[]>();
    const add = (start: ZonedTime, entryLines: string[]) => {
      let key = tz.dayKeyInDestination(start, destZone);
      if (key < firstDate) key = firstDate;
      else if (key > lastDate) key = lastDate;
      const list = map.get(key) ?? [];
      list.push({ start, lines: entryLines });
      map.set(key, list);
    };
    for (const a of trip.activities) add(a.start, activityLines(a));
    for (const t of trip.transport) add(t.start, transportLines(t));
    for (const list of map.values())
      list.sort((x, y) => tz.toMillis(x.start) - tz.toMillis(y.start));
    return map;
  }
}

/** The accommodation whose stay covers the night of `date` (check-in inclusive, check-out exclusive). */
function overnightStay(
  accommodations: AccommodationDto[],
  date: string,
): AccommodationDto | undefined {
  return accommodations.find(
    (a) => a.checkInDate <= date && date < a.checkOutDate,
  );
}
