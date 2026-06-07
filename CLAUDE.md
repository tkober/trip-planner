# Japan Trip Planner — Project Guide

An Angular app for planning vacations (especially Japan trips) as a **vertical,
day-by-day timeline** with first-class **timezone handling** (home vs destination).
Data lives in the browser (IndexedDB); plans can be exported/imported as JSON.

## Status

**Implemented (v1):**
- Multi-trip dashboard: create, open, import, export, delete trips.
- Trip timeline: one section per day, "Day N" + date in the destination tz.
- Accommodations as rail markers (check-in fills the lower half of a day, check-out
  the upper half → a hotel switch shows two bars on one day). Click → details.
- Activities and **Transport as separate entities** (flight/train/bus/car), rendered
  interleaved per day, sorted by start time, colour/icon-differentiated by mode.
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
- [DaySection](src/app/trips/timeline/day-section.ts) — one day: rail (date +
  `AccommodationBar`s) + CDK drop-list of `EntryCard`s + an "Add" menu.
- [EntryCard](src/app/trips/timeline/entry-card.ts) — one activity/transport.
- [FlightCard](src/app/trips/timeline/flight-card.ts) — prominent dual-tz flight.
- [AccommodationBar](src/app/trips/timeline/accommodation-bar.ts) — rail stay marker.

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
