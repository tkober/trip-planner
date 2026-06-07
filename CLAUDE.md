# Japan Trip Planner — Project Guide

An Angular app for planning vacations (especially Japan trips) as a **vertical,
day-by-day timeline** with first-class **timezone handling** (home vs destination).
Data lives in the browser (IndexedDB); plans can be exported/imported as JSON.

## Status

**Implemented (v1):**
- Multi-trip dashboard: create, open, import, export, delete trips.
- Trip timeline rendered as a **CSS grid** (one row per day, "Day N" + date in the
  destination tz).
- Accommodations render in a single **hotel lane** as continuous blocks, using a
  **half-day handoff**: each day's top half is the hotel you wake up in, the bottom
  half the hotel you sleep in. A continuous stay reads as one solid block; a hotel
  switch splits that day top/bottom — always one lane, no overlap. Different hotels
  get distinct tints. Click → details. (Transport whose departure and arrival fall
  on different destination-tz days still spans via lane-packed `SpanBar` blocks.)
- Activities and **Transport as separate entities** (flight/train/bus/car), always
  rendered as list cards interleaved per day, sorted by start time, colour/icon-
  differentiated by mode. An entry whose start and end fall on different
  destination-tz days is drawn as a **straddle card centered on the separator**
  between the two days (dashed divider = the day boundary; start time on top, arrival
  on the bottom) so both days stay recognizable.
- Prominent **departure & return flight cards** with dual-timezone times.
- Create/edit/delete for every entity via Material dialogs; all destructive actions
  and trip-duration changes are gated by a confirmation modal.
- Drag-and-drop of activity/transport entries between days (CDK) with a confirm modal;
  the entry keeps its time-of-day, its date shifts to the target day.
- JSON export/import (schema-version validated).
- GitHub Pages deploy workflow.

**Not yet done / ideas:** same-day manual reordering (currently time-sorted), per-entry
attachments, trip duplication, dark-mode toggle, undo.

## Tech Stack

- **Angular 22**, standalone components, **signals**, **zoneless** change detection.
- **Angular Material + CDK** (dialogs, menus, drag-drop, form fields).
- **Dexie** (IndexedDB) for persistence.
- **Luxon** for IANA timezone math.
- Native `type="date"` / `type="datetime-local"` inputs (their string values map
  directly to our stored `"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"` formats).

## Architecture

Routes ([src/app/app.routes.ts](src/app/app.routes.ts)):
- `/trips` → [TripList](src/app/trips/trip-list/trip-list.ts) (dashboard).
- `/trips/:id` → [Timeline](src/app/trips/timeline/timeline.ts) (the day timeline).

Services (signal-backed, `providedIn: 'root'`):
- [TripStoreService](src/app/services/trip-store.service.ts) — Dexie wrapper. Holds the
  `trips` signal; all CRUD (trip + nested accommodation/activity/transport) re-saves the
  whole trip and `refresh()`es the signal. The Timeline derives its trip via
  `computed(() => trips().find(...))`, so any mutation reactively updates the view.
- [TimeZoneService](src/app/services/time-zone.service.ts) — Luxon helpers:
  `toDateTime`, `inZone`, `dualLabel` (highlights the entry's own zone), `enumerateDays`,
  `dayKeyInDestination` (buckets entries into days), `deviceZone`, `supportedZones`.
- [ImportExportService](src/app/services/import-export.service.ts) — JSON download +
  validated import (assigns a fresh id, checks `schemaVersion`).

Timeline composition:
- [Timeline](src/app/trips/timeline/timeline.ts) — page; computes `dayViews`, flights,
  accommodation segments; owns all dialog orchestration + drag-drop confirmation.
- [DaySection](src/app/trips/timeline/day-section.ts) — one day. Uses
  `display: contents` so its day-marker (col 1) and CDK drop-list content (last col)
  become direct children of the timeline grid, sharing rows with span blocks.
- [HotelCell](src/app/trips/timeline/hotel-cell.ts) — one day's accommodation cell
  (top = morning hotel, bottom = night hotel); computed in `Timeline.hotelCells`.
- [EntryCard](src/app/trips/timeline/entry-card.ts) — one single-day activity/transport.
- [StraddleCard](src/app/trips/timeline/straddle-card.ts) — a day-crossing entry,
  anchored on the separator line (`grid-row` from `Timeline.layout`, then
  `translateY(-50%)`); adjacent days get padding so the card has clear space.
  The grid columns ([marker][hotel][content]) are built in
  `Timeline.gridTemplateColumns`.
- [FlightCard](src/app/trips/timeline/flight-card.ts) — prominent dual-tz flight.

Dialogs ([src/app/trips/dialogs/](src/app/trips/dialogs/) +
[src/app/shared/](src/app/shared/)): trip form, accommodation, activity, transport,
a shared read-only **details** dialog (Edit/Delete actions), and a generic
**confirm** dialog. Reusable inputs: `TimezoneSelect`, `ZonedTimeField`.

## Data Model

See [src/app/models/trip.model.ts](src/app/models/trip.model.ts). All DTOs are plain
JSON (persisted as-is, exported as-is). Key idea: a `ZonedTime` stores a wall-clock
string + IANA zone (no offset), so Luxon can render the same instant in any zone.

```
TripDto { id, schemaVersion, title, startDate, endDate, homeTimeZone,
          destinationTimeZone, description?, accommodations[], activities[],
          transport[], createdAt, updatedAt }
ZonedTime { dateTime: "YYYY-MM-DDTHH:mm", zone: "Asia/Tokyo" }
AccommodationDto { id, name, fullName?, address?, googleMapsUrl?, bookingUrl?,
                   remarks?, checkInDate, checkOutDate }
ActivityDto { id, title, start, end?, location?, googleMapsUrl?, bookingUrl?, notes? }
TransportDto { id, mode: flight|train|bus|car, title, start, end?, fromLocation?,
               toLocation?, airline?, flightNumber?, bookingUrl?, notes? }
```

Entries are bucketed into a day by their `start` converted to the **destination tz**
date; entries outside the trip range are clamped to the first/last day.

## Develop

```bash
npm install
npm start          # ng serve → http://localhost:4200
npm run build      # production build → dist/japan-trip-planner/browser
npm test           # unit tests
```

### Configuration (env vars)

New-trip timezone defaults are build-time configurable.
[scripts/generate-env.mjs](scripts/generate-env.mjs) — run automatically by the
`prestart` / `prebuild` npm hooks — regenerates
[src/environments/environment.ts](src/environments/environment.ts) from env vars:

- `DEFAULT_DEPARTURE_TZ` — IANA zone seeded as a new trip's departure (home) zone.
  Empty (default) falls back to the device zone via `TimeZoneService.deviceZone()`.
- `DEFAULT_TRIP_TZ` — IANA zone seeded as a new trip's destination zone
  (default `Asia/Tokyo`).

`environment.ts` is generated; edit the env vars (or the script's fallbacks), not
the file. Consumed in [TripFormDialog](src/app/trips/trip-form-dialog/trip-form-dialog.ts).
The deploy workflow reads these from GitHub Actions repo **Variables** of the same
name. Anything other than these defaults still lives in the per-trip form.

## Deploy (GitHub Pages)

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds on push to `main`
and publishes via GitHub Pages. It sets `--base-href "/<repo-name>/"` automatically and
copies `index.html` → `404.html` for SPA deep-link fallback. **One-time setup:** in the
GitHub repo, Settings → Pages → Source = "GitHub Actions".

## Conventions

- Standalone components only (no NgModules); prefer `signal`/`computed`/`input`/`output`.
- Keep DTOs JSON-serializable and bump `SCHEMA_VERSION` on shape changes (add import
  migration in `ImportExportService.normalize`).
- Every delete or trip-duration change must go through the confirm dialog.
- **Keep this file updated** as features land or the architecture shifts.
