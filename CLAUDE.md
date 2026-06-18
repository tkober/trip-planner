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
  get distinct tints. Click → details; **right-click → a position-sensitive context
  menu that nudges the stay by ±1 day** — clicking the upper half of the stay's block
  offers *Start ±1* (check-in), the lower half *End ±1* (check-out). The side is judged
  against the stay's full span centre (so it's correct even on the stay's middle days
  and hotel-switch days, where the cell's morning/night halves belong to different
  stays); moves that would collapse the stay to zero nights are disabled. (Transport
  whose departure and arrival fall on different destination-tz days still spans via
  lane-packed `SpanBar` blocks.)
- **Car reservations** render in a second left lane (right of the hotel lane) as one
  continuous tinted block per rental spanning pickup→return days (inclusive), with a
  car icon + vertical name; click → details, **right-click → the same position-sensitive
  Start/End ±1-day menu** (upper half = pickup, lower half = dropoff; pickup may equal
  dropoff, a one-day rental). Pickup and return may be at different stations and carry
  optional times. The lane collapses to 0px when empty, and car reservations never
  appear in the right-hand activity/transport content column. Each rental's pickup
  and return additionally surface as compact **deadline pills** in the content column
  of the day they fall on, **interleaved with that day's activity/transport cards by
  time** (so a "Return by 14:00" pill sits between the activities before and after it;
  the day's content is one chronologically-sorted list of `DayItem`s — each either an
  entry card or a deadline pill — built in `TimelineView.layout`). Each pill shows a
  `Fetch by` / `Return by` label, the optional time, the car's name, the rental company,
  and the relevant station (pickup station for a fetch, return station for a return),
  tinted with the reservation's accent colour (not a separate entity — derived from
  `carReservations`); click → the car details. Untimed deadlines float to the top of the day; a deadline
  whose date sits outside the trip range is simply not shown (unlike the lane block,
  which clamps to the edge).
- Activities and **Transport as separate entities** (flight/train/bus/car), always
  rendered as list cards interleaved per day, sorted by start time, colour/icon-
  differentiated by mode. Transport has **no title**: its headline is the
  **route `FROM → TO`** derived from `fromLocation`/`toLocation` (falling back to the
  mode's airport/station/stop), with departure/arrival times above it and the
  **travel duration** ("11h 30min") shown over the arrow; the subtitle carries the
  mode detail (airport + terminal / station + platform / stop). Activities still use
  their own title + location. An entry whose start and end fall on different
  destination-tz days is drawn as a **straddle card centered on the separator**
  between the two days (dashed divider = the day boundary). For transport the route
  maps vertically — **FROM + departure on the top half, TO + arrival + subtitle on the
  bottom**, duration on the divider — so both days stay recognizable.
  Route/subtitle/duration formatting is shared in
  [transport-format.ts](src/app/shared/transport-format.ts) +
  `TimeZoneService.durationLabel`.
- **Departure & return flight cards** with dual-timezone times, rendered in the
  shared timeline **route-card** style (see `TransportCard`), as is the Transport list.
- Create/edit/delete for every entity via Material dialogs; all destructive actions
  and trip-duration changes are gated by a confirmation modal.
- Drag-and-drop of activity/transport entries between days (CDK) with a confirm modal;
  the entry keeps its time-of-day, its date shifts to the target day.
- JSON export/import (schema-version validated).
- **Plan export** ("Export plan…" in the trip-page menu): a **PNG** of the timeline
  (via `html-to-image`), a **PDF** of the whole plan (timeline + Overview /
  Accommodations / Car Rentals / Transport sections, each on its own page) produced by
  **native browser print** (`window.print()` → "Save as PDF"), and a **Markdown** (`.md`)
  text rendering of the whole plan (no graphics) intended for handing the itinerary to an
  **LLM / agent**. An opt-in **anonymization mode** (chosen per-export in the export
  dialog) blacks out sensitive fields for public sharing. See "Plan export" below.
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
  five child routes (deep-linkable), defaulting to `timeline`:
  - `timeline` → [TimelineView](src/app/trips/timeline/timeline.ts) — the day grid.
  - `overview` → [OverviewView](src/app/trips/views/overview-view.ts) — trip facts
    (dates, length, zones, description) + the departure/return flight cards.
  - `accommodations` → [AccommodationsView](src/app/trips/views/accommodations-view.ts)
    — all stays, ordered by check-in, as detail cards.
  - `car-reservations` → [CarReservationsView](src/app/trips/views/car-reservations-view.ts)
    — all rentals, ordered by pickup, as detail cards.
  - `transport` → [TransportView](src/app/trips/views/transport-view.ts) — all
    transport, ordered by departure, as shared `TransportCard`s (dual-tz times).
  Child views receive the parent `:id` param via `withComponentInputBinding()` +
  `paramsInheritanceStrategy: 'always'` (set in [app.config.ts](src/app/app.config.ts));
  each derives its trip with `computed(() => trips().find(...))`.

Services (signal-backed, `providedIn: 'root'` unless noted):
- [TripStore](src/app/services/trip-store.ts) — **abstract** persistence interface
  (also the DI token). Holds the `trips` signal; all CRUD (trip + nested
  accommodation/car-reservation/activity/transport) re-saves the whole trip and
  `refresh()`es the signal. The Timeline derives its trip via `computed(() => trips().find(...))`, so
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
  car-reservation/activity/transport, the `confirm` helper, JSON export). Shared by
  every view so there's one implementation; each method takes the current trip explicitly.

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
- [CarSpan](src/app/trips/timeline/car-span.ts) — one car reservation as a single
  continuous block in the car lane (col 3), spanning pickup→return rows; computed in
  `TimelineView.carSpans`.
- [EntryCard](src/app/trips/timeline/entry-card.ts) — one single-day activity/transport.
  Transport entries split ~2/3 route · ~1/3 **detail column** (same per-mode facts as
  `TransportCard`; absent for activities/car or when no detail fields are set).
- [StraddleCard](src/app/trips/timeline/straddle-card.ts) — a day-crossing entry,
  anchored on the separator line (`grid-row` from `TimelineView.layout`, then
  `translateY(-50%)`); adjacent days get padding so the card has clear space. The
  per-mode detail (same set as `EntryCard`) is stacked **in the top half's
  upper-right corner**, just left of the kebab; the equal-height rows keep the day
  divider centred even when that makes the top half the taller one.
  The grid columns ([marker][hotel][car][content]) are built in
  `TimelineView.gridTemplateColumns` (hotel and car lanes each collapse to 0px when
  their entity is absent; content is referenced as the last column via `-2/-1`).
- [TransportCard](src/app/shared/transport-card/transport-card.ts) — a shared,
  full-width transport card in the **same route style as the timeline** (accent icon
  bullet, derived `FROM → TO` headline with dual-tz departure/arrival times + dates and
  the travel duration over the arrow, optional eyebrow `role`, kebab menu). The route
  occupies ~2/3 of the width; a divider then a ~1/3 **detail column** carries the
  mode-specific facts (flight: number, airline; train: line, name, operator, kind;
  bus: line, operator, kind). Car has no detail column, and when no detail fields are
  set the route reclaims the full width. Used by the
  Overview **Flights** section (departure/return) and the Transport list so every
  surface shares one visual language; route/detail strings come from the same
  [transport-format.ts](src/app/shared/transport-format.ts) helpers the timeline uses.

Plan export ([src/app/trips/export/](src/app/trips/export/) +
[export.service.ts](src/app/services/export.service.ts)):
- The timeline ([TimelineView](src/app/trips/timeline/timeline.ts)) and the four section
  views each take an optional **`tripOverride`** input — when set, they render that trip
  instead of the store lookup. So **anonymization is a pure data transform**
  ([anonymize.ts](src/app/shared/export/anonymize.ts) `anonymizeTrip`): redacted *visible*
  fields become block-glyph bars (`█████`), URL fields are dropped, and every existing
  surface renders the redacted copy with no per-component logic. `TimelineView` also has
  an **`exportMode`** input that swaps `clamp(vw)` lane widths for fixed px (deterministic
  output).
- [TripExportDocument](src/app/trips/export/trip-export-document.ts) composes a cover +
  timeline + the four views (all fed the same trip). Its `.export-doc` host class scopes
  the **chrome-hiding** + **print pagination** rules in [styles.scss](src/styles.scss)
  (hide kebabs/add buttons; `break-before: page` per section; `break-inside: avoid` on
  cards). [ExportHost](src/app/trips/export/export-host.ts) (mounted in the trip-page
  shell) renders it off-screen, then for **PNG** captures `.timeline-capture` with
  `html-to-image`, or for **PDF** adds a `printing-export` class (which hides the live app
  and reveals the document) and calls `window.print()`.
- [ExportDialog](src/app/trips/export/export-dialog.ts) picks the format and the
  anonymization categories; [TripActionsService](src/app/services/trip-actions.service.ts)
  `exportPlan()` wires the dialog → `anonymizeTrip` → `ExportService`. File downloads use
  the shared [download.ts](src/app/shared/download.ts) helper.
- The **Markdown** format needs none of the off-screen DOM machinery above:
  [trip-markdown.ts](src/app/shared/export/trip-markdown.ts) `tripToMarkdown(trip, tz,
  anonymized?)` is a **pure data transform** (like `anonymizeTrip`) that renders the
  already-anonymized `TripDto` to structured text — Overview, Accommodations and Car
  rentals reference lists, then a day-by-day Itinerary with the overnight stay and every
  activity/transport leg in chronological order (times printed in their own IANA zone so
  day/zone crossings are unambiguous). `exportPlan()` calls it directly and downloads the
  `.md` via `download.ts`; no `ExportService`/`ExportHost` round-trip.

Dialogs ([src/app/trips/dialogs/](src/app/trips/dialogs/) +
[src/app/shared/](src/app/shared/)): trip form, accommodation, car reservation,
activity, transport, a shared read-only **details** dialog (Edit/Delete actions), and
a generic **confirm** dialog. Reusable inputs: `TimezoneSelect`, `ZonedTimeField`,
`DateField`, `SuggestField` (free-text autocomplete used for the train/bus kind).

## Data Model

See [src/app/models/trip.model.ts](src/app/models/trip.model.ts). All DTOs are plain
JSON (persisted as-is, exported as-is). Key idea: a `ZonedTime` stores a wall-clock
string + IANA zone (no offset), so Luxon can render the same instant in any zone.

```
TripDto { id, schemaVersion, title, startDate, endDate, homeTimeZone,
          destinationTimeZone, description?, accommodations[], carReservations[],
          activities[], transport[], createdAt, updatedAt }
ZonedTime { dateTime: "YYYY-MM-DDTHH:mm", zone: "Asia/Tokyo" }
AccommodationDto { id, name, fullName?, address?, googleMapsUrl?, bookingUrl?,
                   remarks?, color?, checkInDate, checkOutDate }
CarReservationDto { id, name, company?, carType?, price?, pickupLocation?,
                    dropoffLocation?, pickupDate, dropoffDate, pickupTime?,
                    dropoffTime?, pickupGoogleMapsUrl?, dropoffGoogleMapsUrl?,
                    pickupStationUrl?, dropoffStationUrl?, bookingUrl?,
                    bookingReference?, remarks?, color? }
ActivityDto { id, title, start, end?, location?, googleMapsUrl?, bookingUrl?, notes?, color? }
TransportDto { id, mode: flight|train|bus|car, start, end?, fromLocation?,
               toLocation?, bookingUrl?, bookingReference?, notes?, color?,
               // flight-only: airline?, flightNumber?, fromAirport?, toAirport?,
               //              fromTerminal?, toTerminal?
               // train-only:  fromStation?, toStation?, fromPlatform?,
               //              toPlatform?, trainName?, trainKind?
               // bus-only:    fromStop?, toStop?, busKind?
               // train + bus: line?, operator? }
```

`fromLocation`/`toLocation` hold the **city**; the per-mode fields add the
airport/station/stop (and terminal/platform). Mode-specific fields are only
written for their mode (the dialog clears the others on save), as `airline`/
`flightNumber` already did. The selectable `trainKind` / `busKind` options are
env-configurable (see "Configuration"). All new fields are optional, so adding
them was an additive **schema v3** step (no data transform).

`CarReservationDto` is a rental car available across a span of days (rendered as a
left-lane block, see the timeline section). `pickupDate`/`dropoffDate` are calendar
dates in the destination tz that drive the lane (return day inclusive); `pickup`/
`dropoffLocation` are the stations (may differ); times are optional `"HH:mm"`.
Adding the `carReservations[]` array was an additive **schema v4** step (the
migration seeds an empty array on older documents).

Removing the redundant transport `title` (the route is now derived) was a
**schema v5** step whose migration strips `title` from each `transport[]` entry.

Adding the optional car-rental `price`, pickup/return `*StationUrl` links and
`bookingReference`, plus the transport `bookingReference`, was an additive
**schema v6** step (no data transform).

Every entity may carry an optional `color` (a hex accent). When unset, a default
applies: accommodations and car reservations each cycle their own distinct tints by
storage order; each transport mode has its own colour; activities use their own
accent (kept distinct from the flight blue). Colour logic + the quick-pick palette live in
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
- `TRAIN_KINDS` / `BUS_KINDS` — comma-separated options for a train's / bus's
  "kind" field, consumed by [TransportDialog](src/app/trips/dialogs/transport-dialog.ts)
  (a free-text autocomplete via [SuggestField](src/app/shared/suggest-field/suggest-field.ts)).
  When set they **replace** the built-in defaults (trains: `Local train, Rapid,
  Limited express, Shinkansen`; buses: `City bus, Long-distance coach, Overnight,
  Hop on/off`). Surface as `string[]` on `environment` (a runtime override may be
  a comma string or array).

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

## Deploy (Docker / GHCR)

For self-hosting (e.g. on an app cluster with the shared Postgres), both pieces ship
as container images published to GHCR:

- **Backend** — [server/Dockerfile](server/Dockerfile) (uv-based, `uv sync --frozen`,
  runs `uvicorn app.main:app`). All config (`DB_URL`, `DB_USER`, `DB_PASSWORD`,
  `DB_OWNER_USER`, `DB_OWNER_PASSWORD`, `CORS_ORIGINS`) is read at runtime, so pass it
  via `docker run --env-file` / `-e` — nothing is baked. Bind `HOST`/`PORT` default to
  `0.0.0.0`/`8000` but are env-overridable (shell-form CMD). Image
  `ghcr.io/tkober/trip-planner-server`.
- **Frontend** — root [Dockerfile](Dockerfile): multi-stage (Node build → nginx).
  Env vars are injected **at runtime, not build time**: the Angular bundle is built
  once, and [docker-entrypoint.sh](docker-entrypoint.sh) writes `/config.js` from
  `STORAGE_BACKEND` / `API_BASE_URL` / `DEFAULT_TRIP_TZ` / `DEFAULT_DEPARTURE_TZ` on
  container start. [index.html](src/index.html) loads `config.js` (a classic script,
  before the deferred app bundle) into `window.__TRIP_PLANNER_ENV__`, and the generated
  [environment.ts](src/environments/environment.ts) reads that global, falling back to
  the build-time baked values when absent (so `npm start` and GitHub Pages are
  unaffected — their `public/config.js` is an empty default). One image is thus
  reconfigurable per deployment without a rebuild. nginx config (SPA fallback,
  no-cache `config.js`) is [nginx.conf](nginx.conf), shipped as a
  `*.template` so nginx's envsubst renders `listen ${PORT}` (default `80`,
  env-overridable). Image `ghcr.io/tkober/trip-planner-web`.

Two workflows ([publish-server.yml](.github/workflows/publish-server.yml),
[publish-frontend.yml](.github/workflows/publish-frontend.yml)) build/push on push to
`main` (each path-filtered to its own files) and on `v*.*.*` tags (a release tag builds
both). Tags: `latest` (default branch), semver, and `sha`; build layers cached via gha.
No compose file — images are deployed by the cluster.

## Conventions

- **Every new feature goes on its own feature branch** (e.g. `feature/<short-name>`),
  branched off `main`; never commit feature work directly to `main`. Land it via a
  pull request once it's complete.
- Standalone components only (no NgModules); prefer `signal`/`computed`/`input`/`output`.
- Keep DTOs JSON-serializable. On any shape change, bump `SCHEMA_VERSION` **and** add
  a matching `MIGRATIONS[<new version>]` step in
  [migrations.ts](src/app/models/migrations.ts) (applied everywhere a trip loads).
- Every delete or trip-duration change must go through the confirm dialog.
- **Keep this file updated** as features land or the architecture shifts.
