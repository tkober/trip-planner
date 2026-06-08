# Japan Trip Planner — Project Guide

An Angular app for planning vacations (especially Japan trips) as a **vertical,
day-by-day timeline** with first-class **timezone handling** (home vs destination).
Data lives in the browser (IndexedDB); plans can be exported/imported as JSON.

## Status

**Implemented (v1):**
- Multi-trip dashboard: create, open, import, export, delete trips.
- Trip timeline rendered as a **CSS grid** (one row per day, "Day N" + date in the
  destination tz). Each day marker also shows the **reference city** (the tz the day
  is expressed in, e.g. "Tokyo"). The international flights at the trip's edges get a
  grayed **virtual "Departure Day" / "Return Day"** row carrying the **home** city
  label, so a flight that leaves home the day before (or lands home) reads as a
  `StraddleCard` between that virtual day and the adjacent real day.
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
- **Dexie** (IndexedDB) for default browser-local persistence; an optional
  **FastAPI + PostgreSQL (JSONB)** backend ([server/](server/)) can be selected at
  build time. See "Storage backend" below.
- **Luxon** for IANA timezone math.
- Native `type="date"` / `type="datetime-local"` inputs (their string values map
  directly to our stored `"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"` formats).

## Architecture

Routes ([src/app/app.routes.ts](src/app/app.routes.ts)):
- `/trips` → [TripList](src/app/trips/trip-list/trip-list.ts) (dashboard).
- `/trips/:id` → [TripPage](src/app/trips/trip-page/trip-page.ts) — the trip shell:
  a fixed left **side panel** (back button, trip name + compact details, section
  nav, trip-actions menu) plus a `<router-outlet>` for the active section. It has
  four child routes (deep-linkable), defaulting to `timeline`:
  - `timeline` → [TimelineView](src/app/trips/timeline/timeline.ts) — the day grid.
  - `overview` → [OverviewView](src/app/trips/views/overview-view.ts) — trip facts
    (dates, length, zones, description) + the departure/return flight cards.
  - `accommodations` → [AccommodationsView](src/app/trips/views/accommodations-view.ts)
    — all stays, ordered by check-in, as detail cards.
  - `transport` → [TransportView](src/app/trips/views/transport-view.ts) — all
    transport, ordered by departure, with dual-tz times.
  Child views receive the parent `:id` param via `withComponentInputBinding()` +
  `paramsInheritanceStrategy: 'always'` (set in [app.config.ts](src/app/app.config.ts));
  each derives its trip with `computed(() => trips().find(...))`.

Services (signal-backed, `providedIn: 'root'` unless noted):
- [TripStore](src/app/services/trip-store.ts) — **abstract** persistence interface
  (also the DI token). Holds the `trips` signal; all CRUD (trip + nested
  accommodation/activity/transport) re-saves the whole trip and `refresh()`es the
  signal. The Timeline derives its trip via `computed(() => trips().find(...))`, so
  any mutation reactively updates the view. Two implementations, selected in
  [app.config.ts](src/app/app.config.ts) by `environment.storageBackend`:
  - [IndexedDbTripStore](src/app/services/indexeddb-trip-store.ts) — **default**,
    browser-local Dexie/IndexedDB wrapper.
  - [HttpTripStore](src/app/services/http-trip-store.ts) — `HttpClient` client of the
    FastAPI backend (`environment.apiBaseUrl`). Because every nested mutation funnels
    through `saveTrip()`, the backend only needs whole-trip endpoints.
  Both run loaded/fetched trips through `migrateTrip()` (shared `uuid`/`upsertById`
  helpers live in [trip-store-util.ts](src/app/services/trip-store-util.ts)).
- [TimeZoneService](src/app/services/time-zone.service.ts) — Luxon helpers:
  `toDateTime`, `inZone`, `dualLabel` (highlights the entry's own zone), `enumerateDays`,
  `dayKeyInDestination` (buckets entries into days), `deviceZone`, `supportedZones`.
- [ImportExportService](src/app/services/import-export.service.ts) — JSON download +
  validated import (validates required fields, runs `migrateTrip()`, assigns a fresh id).
- [TripActionsService](src/app/services/trip-actions.service.ts) — all dialog-driven
  trip mutations (edit trip, add/edit/delete + open-details for accommodation/
  activity/transport, the `confirm` helper, JSON export). Shared by every view so
  there's one implementation; each method takes the current trip explicitly.

Timeline composition:
- [TimelineView](src/app/trips/timeline/timeline.ts) — the day grid; computes
  `dayViews`, accommodation hotel cells/labels, straddles; owns drag-drop
  confirmation. Dialog actions are delegated to `TripActionsService`. `layout()` also
  detects the boundary international legs (inbound flight arriving from another zone
  at/before day 1; outbound leaving to another zone at/after the last day), emits a
  leading/trailing `VirtualDay`, and exposes `rowOffset` — the number of prepended
  virtual rows (0 or 1) that shifts every real-day grid row. Virtual rows are rendered
  inline in `timeline.html` (grayed marker + empty padded content); the boundary flight
  itself is pushed as a `StraddleCard` anchored on the virtual-day separator.
- [DaySection](src/app/trips/timeline/day-section.ts) — one day. Uses
  `display: contents` so its day-marker (col 1) and CDK drop-list content (last col)
  become direct children of the timeline grid, sharing rows with span blocks.
- [HotelCell](src/app/trips/timeline/hotel-cell.ts) — one day's accommodation cell
  (top = morning hotel, bottom = night hotel); computed in `TimelineView.hotelCells`.
- [EntryCard](src/app/trips/timeline/entry-card.ts) — one single-day activity/transport.
- [StraddleCard](src/app/trips/timeline/straddle-card.ts) — a day-crossing entry,
  anchored on the separator line (`grid-row` from `TimelineView.layout`, then
  `translateY(-50%)`); adjacent days get padding so the card has clear space.
  The grid columns ([marker][hotel][content]) are built in
  `TimelineView.gridTemplateColumns`.
- [FlightCard](src/app/trips/timeline/flight-card.ts) — prominent dual-tz flight,
  shown in the Overview section.

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
                   remarks?, color?, checkInDate, checkOutDate }
ActivityDto { id, title, start, end?, location?, googleMapsUrl?, bookingUrl?, notes?, color? }
TransportDto { id, mode: flight|train|bus|car, title, start, end?, fromLocation?,
               toLocation?, airline?, flightNumber?, bookingUrl?, notes?, color? }
```

Every entity may carry an optional `color` (a hex accent). When unset, a default
applies: accommodations cycle distinct tints by storage order; each transport
mode has its own colour; activities use their own accent (kept distinct from the
flight blue). Colour logic + the quick-pick palette live in
[src/app/shared/color/color.ts](src/app/shared/color/color.ts); the reusable
picker (palette swatches + native colour input) is
[ColorField](src/app/shared/color/color-field.ts), embedded in each entity
dialog. Cards bind the resolved colour to a `--accent` CSS var; the hotel lane
tints it light via `color-mix`.

Entries are bucketed into a day by their `start` converted to the **destination tz**
date; entries outside the trip range are clamped to the first/last day.

## Develop

```bash
npm install
npm start          # ng serve → http://localhost:4200
npm run build      # production build → dist/japan-trip-planner/browser
npm test           # unit tests
```

The optional backend lives in [server/](server/) (FastAPI, managed with `uv`); see
[server/README.md](server/README.md) to run it.

### Configuration (env vars)

New-trip timezone defaults are build-time configurable.
[scripts/generate-env.mjs](scripts/generate-env.mjs) — run automatically by the
`prestart` / `prebuild` npm hooks — regenerates
[src/environments/environment.ts](src/environments/environment.ts) from env vars:

- `DEFAULT_DEPARTURE_TZ` — IANA zone seeded as a new trip's departure (home) zone.
  Empty (default) falls back to the device zone via `TimeZoneService.deviceZone()`.
- `DEFAULT_TRIP_TZ` — IANA zone seeded as a new trip's destination zone
  (default `Asia/Tokyo`).
- `STORAGE_BACKEND` — `indexeddb` (default, browser-local) or `http` (FastAPI
  backend). See "Storage backend" below.
- `API_BASE_URL` — backend base URL when `STORAGE_BACKEND=http`
  (default `http://localhost:8000`).

These can be set on the command line (`STORAGE_BACKEND=http npm start`) or placed in
a `.env` file at the repo root (see [.env.example](.env.example)); `generate-env.mjs`
loads `.env` but lets already-set shell/CLI vars win. `.env` is git-ignored.

`environment.ts` is generated; edit the env vars (or the script's fallbacks), not
the file. Consumed in [TripFormDialog](src/app/trips/trip-form-dialog/trip-form-dialog.ts)
(timezones) and [app.config.ts](src/app/app.config.ts) (storage backend).
The deploy workflow reads these from GitHub Actions repo **Variables** of the same
name. Anything other than these defaults still lives in the per-trip form.

### Storage backend

The data layer is abstracted behind the [TripStore](src/app/services/trip-store.ts)
abstract class. By default trips live in the browser (IndexedDB). Set
`STORAGE_BACKEND=http` (+ `API_BASE_URL`) to persist to the FastAPI + PostgreSQL
service in [server/](server/) instead — useful for sharing trips across devices.
The browser cannot reach Postgres directly, hence the HTTP layer. The backend is
dumb whole-trip storage (one `JSONB` row per trip). It connects with **two Postgres
roles** (configured in `server/.env`): an *owner* role used only at startup to
**auto-create the `trips` table**, and an *app* role used for all runtime CRUD (no
DDL). The app role's access to the owner-created table comes from server-side
`ALTER DEFAULT PRIVILEGES` (no `GRANT` in app code). See
[server/README.md](server/README.md) to run it (managed with `uv`). GitHub Pages deploys leave `STORAGE_BACKEND` unset, so they
stay browser-local.

### Schema migrations

[src/app/models/migrations.ts](src/app/models/migrations.ts) holds `migrateTrip()`,
which every trip entering the app (read from a store or imported) passes through:
it detects `schemaVersion` and applies the ordered `MIGRATIONS` steps up to the
current `SCHEMA_VERSION` (rejecting documents from a newer app version).

## Deploy (GitHub Pages)

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds on push to `main`
and publishes via GitHub Pages. It sets `--base-href "/<repo-name>/"` automatically and
copies `index.html` → `404.html` for SPA deep-link fallback. **One-time setup:** in the
GitHub repo, Settings → Pages → Source = "GitHub Actions".

## Conventions

- Standalone components only (no NgModules); prefer `signal`/`computed`/`input`/`output`.
- Keep DTOs JSON-serializable. On any shape change, bump `SCHEMA_VERSION` **and** add
  a matching `MIGRATIONS[<new version>]` step in
  [migrations.ts](src/app/models/migrations.ts) (applied everywhere a trip loads).
- Every delete or trip-duration change must go through the confirm dialog.
- **Keep this file updated** as features land or the architecture shifts.
