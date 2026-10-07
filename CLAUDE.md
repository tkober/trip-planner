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
- **Reservation windows** for trains whose seats can be booked: JR sells reserved
  seats from **10:00 local time exactly one calendar month before departure** (and
  from the **1st of the departure month** when that day does not exist in the
  previous one, e.g. 31 March). Every such train shows a *Booking opens* row with a
  dual-tz time in its details dialog, plus a status chip (*Bookable now* /
  *Booking opens in N days* / *Departed*) under the dialog title, and the new
  **Reservations** section lists them all in opening order, each card carrying
  the same chip. Both offer a **reservation reminder (.ics) download** (single
  leg, or the whole trip) whose event sits at the moment booking opens and
  carries the leg's details plus
  links to **smartEX** and a prefilled **Jorudan timetable search**. Which train
  kinds count is configurable (`RESERVABLE_TRAIN_KINDS`, default `Shinkansen,
  Limited express`). See "Reservations" below.
- **Plan export** ("Export plan…" in the trip-page menu): a **PNG** of the timeline
  (via `html-to-image`), a **PDF** of the whole plan (timeline + Overview /
  Accommodations / Car Rentals / Transport sections, each on its own page) produced by
  **native browser print** (`window.print()` → "Save as PDF"), and a **Markdown** (`.md`)
  text rendering of the whole plan (no graphics) intended for handing the itinerary to an
  **LLM / agent**. An opt-in **anonymization mode** (chosen per-export in the export
  dialog) blacks out sensitive fields for public sharing — categories: flight
  numbers, addresses/map links, notes/remarks, precise locations, and **prices &
  costs** (cost fields are dropped, exchange rates cleared). See "Plan export" below.
- **Mobile layout**: every surface is usable on a phone (no horizontal
  overflow, no text ellipsed down to a single letter). Desktop is unchanged —
  all mobile rules live behind max-width breakpoints. See "Responsive layout".
- **Mobile read/edit mode**: on phones the timeline opens **read-only** so
  scrolling can no longer start an accidental drag — the Add button/menu, the
  day-marker menu and every kebab are hidden, and drag is disabled. A pill
  toggle next to the trip-page back button ("Read" / amber "Editing") and a
  sticky banner above the active section ("Edit mode · drag by the handle" +
  "Done") switch into **editing**, where cards grow a dedicated drag handle
  (CDK only drags from a handle once one exists) and every affordance
  reappears. The chosen mode persists across reloads (`localStorage`) until
  the user taps "Done" — there's no auto-lock. Desktop is always editing, so
  this never changes desktop behaviour. See `EditModeService`. A "Move to
  another day…" kebab item (desktop and mobile-edit) offers the same move as
  drag-drop via a small day-picker dialog.
- **Mobile app frame**: on phones the trip shell's side panel is replaced by
  a sticky app bar (back, title + a "Day 7 of 16 · Thu, 9 Apr" / "Starts in
  N days" / date-range context line, the Read/Editing toggle, the trip
  actions kebab) and a fixed bottom nav (Timeline / Overview / Stays /
  Transport / More) so every section and the R1 edit-mode toggle stay
  reachable without scrolling back to the top. Desktop is unchanged. See
  "Responsive layout" below.
- **Mobile timeline navigation**: on phones the day-marker column collapses
  and each day instead gets a **sticky header** (`Day 7` **Thu, 9 Apr**,
  right-aligned `TOKYO · GMT+9`) that pins below the app bar while that day's
  cards scroll under it, plus a horizontally-scrollable **day strip** in the
  app bar (a chip per day, including the virtual departure/return days) that
  jumps to a day on tap and tracks the current one as you scroll ("scroll
  spy"). Today's chip gets an indigo ring, and opening the Timeline scrolls to
  it once. Today's own day also gets a 2px **"now" line** between its items at
  the current time, with the next upcoming entry marked **"Up next"**. Desktop
  keeps the plain marker column and none of this renders there, nor in the
  plan export (`exportMode`/`tripOverride`). See "Responsive layout" below.
- **Mobile hotel/car lanes as colour rails ("Variante C")**: on phones the
  hotel and car lanes shrink to thin (6px) solid-colour **rails** instead of
  the desktop's wide tinted blocks with a rotated name — reusing the same
  `HotelCell` half-day-handoff and `CarSpan` block, just restyled (full accent
  colour, small rounded ends, no icon/text). A hotel switch reads as a plain
  colour change on the rail; a night with no stay reads as a gap. The hotel
  name/car name move to a **second line in the mobile day header** instead
  (`dayStayInfo` in [day-stay.ts](src/app/trips/timeline/day-stay.ts), a pure,
  unit-tested function): an accommodation part (priority, ellipsis) reading
  `Hotel Kanra · night 2/4` on a plain night, `Hakone Ginyu → Hotel Kanra` on a
  switch day, `Cross Hotel → Night on the overnight bus` on a check-out with
  no new stay that night (the wording naming the day-crossing transport that
  covers the gap — bus/train/"In transit"/"No stay booked"), plus a car part
  (max 40% width, shrinks first) on any day a rental runs; both tap through to
  the respective details dialog (`stopPropagation` so the header's own
  edit-mode day-menu tap doesn't also fire). Each stay additionally surfaces
  **check-out/check-in pills** (same visual family as the car deadline pills)
  as the first/last item of the day's chronological list — a new `DayItem`
  `stay` kind with ±Infinity `sortMillis` so a check-out always sorts before
  everything (incl. untimed car deadlines) and a check-in always after,
  excluded from "Up next". The day strip's chip also gets a thin **colour
  bar** for the day's night stay (`NavDay.color`, unset → no bar). The car
  deadline pills' labels shorten on mobile (`Fetch by` → `Pick up`, `Return
  by` → `Return`; desktop keeps the full wording) via a CSS-toggled
  full/short span pair rather than reading the breakpoint in TypeScript. None
  of this renders on desktop or in the plan export — same `bp.mobile` guard as
  the rest of this section.
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
  nav, trip-actions menu) plus a `<router-outlet>` for the active section. On
  mobile the side panel is replaced outright by a **sticky app bar** (back,
  title + a `tripContextLabel` subtitle, the R1 Read/Editing toggle, the same
  trip-actions kebab menu) and a **fixed bottom nav** (Timeline / Overview /
  Stays / Transport / a "More" `mat-menu` for Car rentals, Reservations, and
  the remaining kebab items) — see "Responsive layout" below. It has
  six child routes (deep-linkable), defaulting to `timeline`:
  - `timeline` → [TimelineView](src/app/trips/timeline/timeline.ts) — the day grid.
  - `overview` → [OverviewView](src/app/trips/views/overview-view.ts) — trip facts
    (dates, length, zones, description), a **Trip cost** section (total / paid /
    outstanding in EUR + per-category breakdown + the per-currency exchange-rate
    editor, with a refresh button that fetches current rates online and flags a
    rate as stale after a week) and the departure/return flight cards.
  - `accommodations` → [AccommodationsView](src/app/trips/views/accommodations-view.ts)
    — all stays, ordered by check-in, as detail cards.
  - `car-reservations` → [CarReservationsView](src/app/trips/views/car-reservations-view.ts)
    — all rentals, ordered by pickup, as detail cards.
  - `transport` → [TransportView](src/app/trips/views/transport-view.ts) — all
    transport, ordered by departure, as shared `TransportCard`s (dual-tz times).
  - `reservations` → [ReservationsView](src/app/trips/views/reservations-view.ts)
    — every seat-reservable train, ordered by when its booking window opens.
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
  `zoneCity` delegates to [date-format.ts](src/app/shared/format/date-format.ts) (below).
- [ImportExportService](src/app/services/import-export.service.ts) — JSON download +
  validated import (validates required fields, runs `migrateTrip()`, assigns a fresh id).
- [TripActionsService](src/app/services/trip-actions.service.ts) — all dialog-driven
  trip mutations (edit trip, add/edit/delete + open-details for accommodation/
  car-reservation/activity/transport, the `confirm` helper, JSON export). Shared by
  every view so there's one implementation; each method takes the current trip explicitly.
- [EditModeService](src/app/services/edit-mode.service.ts) — the mobile
  read/edit mode (see "Mobile read/edit mode" above): `isMobile` tracks the
  `$mobile` breakpoint via `matchMedia`, `editing`/`readOnly` are computed
  (`!isMobile() || mobileEditing()` — desktop is always editing), and
  `startEditing`/`stopEditing` persist the mobile choice to `localStorage`.
  Injected directly by the timeline components and `DetailsDialog` that need
  to hide editing affordances in read mode.
- [ClockService](src/app/services/clock.service.ts) — the timeline's single
  source of "now" (R4: the now-line, "Up next", and the day strip's today
  ring): a `now` signal (Luxon `DateTime`) that ticks every 60s. The instant
  comes from the `CLOCK_NOW` injection token (default `() => DateTime.now()`),
  overridable in tests for a fixed time.

Timeline composition:
- [TimelineView](src/app/trips/timeline/timeline.ts) — the day grid; computes
  `dayViews`, accommodation hotel cells/labels, straddles; owns drag-drop
  confirmation. Dialog actions are delegated to `TripActionsService`. `layout()` also
  detects the boundary international legs (inbound flight arriving from another zone
  at/before day 1; outbound leaving to another zone at/after the last day), emits a
  leading/trailing `VirtualDay`, and exposes `rowOffset` — the number of prepended
  virtual rows (0 or 1) that shifts every real-day grid row. Virtual rows are rendered
  inline in `timeline.html` (grayed marker + empty padded content); the boundary flight
  itself is pushed as a `StraddleCard` anchored on the virtual-day separator. `layout()`
  also computes, per day, a `zoneLabelFull` ("Tokyo · GMT+9", via `date-format.ts`
  `zoneLabel`) for the R4 mobile sticky header, and — for whichever day is "today" in
  the destination tz (`ClockService` + `TripDto.destinationTimeZone`) — the R4
  now-line/"Up next" placement via the pure [now-line.ts](src/app/trips/timeline/now-line.ts)
  `computeNowLine` helper (unit-tested standalone: entries without end, now
  before/after every item, untimed deadlines, a transport leg in another zone —
  all comparisons are absolute-instant, so the entry's own zone never matters).
  `TimelineView` also publishes the day list (incl. virtual days) to
  `TimelineNavService` for the R4 day strip, and clears it on destroy — but never
  while rendering for another trip/the plan export (`tripOverride`/`exportMode`).
  R5: `layout()` additionally derives, per day, the mobile header's `stay`/`car`
  summary via the pure [day-stay.ts](src/app/trips/timeline/day-stay.ts)
  `dayStayInfo` helper (fed the day's morning/night accommodation — the same
  half-day-handoff pair `hotelCells` uses, hoisted into the shared `nightOf`
  computed — plus `carReservations` and the mode of any transport straddle
  starting that day) and pushes a check-out/check-in `DayItem` (`stay` kind,
  ±Infinity `sortMillis`) onto the day with one. `dayNightColors` (also reusing
  `nightOf`) feeds each published `NavDay.color` for the day strip's colour bar.
- [TimelineNavService](src/app/trips/timeline/timeline-nav.service.ts) — root
  service bridging the timeline (which knows the days) and the mobile day strip
  (which renders them, Timeline route only): `days` / `activeKey` signals, a day
  header registry (`registerHeader`/`unregisterHeader`, `HTMLElement`s), `scrollTo(key)`
  (`scrollIntoView`, respecting `prefers-reduced-motion`), and a scroll-spy (a single
  passive, rAF-throttled `scroll` listener) that sets `activeKey` to whichever
  registered header sits at/just below the app bar (reading `--app-bar-height`, see
  "Responsive layout" below).
- [DayStrip](src/app/trips/timeline/day-strip.ts) — the app bar's horizontal day
  strip (one chip per day, incl. virtual days): reads `TimelineNavService` directly,
  renders nothing when it holds no days, and keeps the active chip scrolled into
  view horizontally (never scrolling the page) as the scroll spy moves. Mounted by
  [TripPage](src/app/trips/trip-page/trip-page.ts) in the app bar, Timeline route
  only.
- [DaySection](src/app/trips/timeline/day-section.ts) — one day. Uses
  `display: contents` so its day-marker (col 1) and CDK drop-list content (last col)
  become direct children of the timeline grid, sharing rows with span blocks. On
  mobile, `.day-content` additionally renders a sticky **day header** as its first
  child (not a `cdkDrag` item, so it's never a drop target) — tapping it opens the
  same day menu as the (now hidden) marker in edit mode, a no-op in read mode — plus,
  on today's day only, the now-line/"Up next" card from `TimelineView.layout()`. R5:
  the header gets a second line (`.header-stay`) with a `stay-line` (bed icon + text,
  flex priority) and, when a rental runs, a `car-line` (car icon + name, max 40%),
  each a `<button>` that `stopPropagation`s before emitting `openAccommodation`/
  `openCar` so the header's own click doesn't also open the day menu. The day's item
  list also renders a `.stay-pill` for a `DayItem.stay` (check-out/check-in, same
  visual family as `.car-pill`), and the car pill's label renders both a `.full` and
  `.short` span (`Fetch by`/`Pick up`, `Return by`/`Return`) with one hidden per
  breakpoint in CSS, desktop keeping the full wording.
- [HotelCell](src/app/trips/timeline/hotel-cell.ts) — one day's accommodation cell
  (top = morning hotel, bottom = night hotel); computed in `TimelineView.hotelCells`.
  R5, mobile only: the lane shrinks to a 6px colour **rail** (`--tl-lane`) — full
  accent colour instead of the light tint, small rounded ends, no text — reusing the
  same half-day-handoff markup/logic; the vertical hotel-name label
  (`.stay-label` in timeline.html) is hidden, the name having moved to the day
  header's stay line instead.
- [CarSpan](src/app/trips/timeline/car-span.ts) — one car reservation as a single
  continuous block in the car lane (col 3), spanning pickup→return rows; computed in
  `TimelineView.carSpans`. R5, mobile only: same colour-rail treatment as `HotelCell`
  (full accent colour, no icon/name — the car's name moved to the day header's car
  line); click/long-press (contextmenu) behaviour is unchanged.
- [EntryCard](src/app/trips/timeline/entry-card.ts) — one single-day activity/transport.
  Transport entries split ~2/3 route · ~1/3 **detail column** (same per-mode facts as
  `TransportCard`; absent for activities/car or when no detail fields are set). Takes
  an R4 `upNext` input (set by `DaySection` from `TimelineView.layout()`'s now-line
  computation) that adds an uppercase "Up next" eyebrow + an indigo outline — mobile,
  today's day only; the styling (not the data) is what keeps it off desktop.
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

Reservations ([src/app/shared/reservation/reservation.ts](src/app/shared/reservation/reservation.ts)
+ [src/app/shared/calendar/](src/app/shared/calendar/)):
- `reservation.ts` is **pure logic**: `reservationOpensAt` (the one-month-before rule,
  anchored in the *departure's own* zone — Luxon's day clamping is what detects the
  "that day does not exist" case), `isReservable` (case-insensitive match against
  `environment.reservableTrainKinds`), `reservationWindows` (a trip's windows, ordered),
  `reservationStatus` / `daysUntilOpening` / `reservationStatusLabel` (the chip
  text), and the outbound links: `SMART_EX_URL` plus
  `timetableSearchUrl` (a prefilled Jorudan English route search — station names lose
  their "Station" suffix, since Jorudan does not use it; a common name such as "Kyoto"
  lands on Jorudan's disambiguation list with date and time preserved).
- [ics.ts](src/app/shared/calendar/ics.ts) is a minimal RFC 5545 writer (CRLF,
  75-octet folding that counts *bytes*, TEXT escaping, optional `VALARM`); times are
  written as **UTC stamps**, so no `VTIMEZONE` is needed and every calendar renders
  10:00 JST in the reader's own zone.
  [reservation-ics.ts](src/app/shared/calendar/reservation-ics.ts) maps a window to
  that event (summary, all leg details in both zones, booking + timetable links,
  two alarms: 20:00 home time the evening before, at least 3 h ahead, since
  10:00 JST is the middle of the night in Europe, and 15 minutes before
  opening; a stable `UID` so re-imports update in place).
- Both the details dialog and the Reservations view call these and download via
  [download.ts](src/app/shared/download.ts) — no service, no store round-trip.
  The Reservations view is **not** part of the plan export document.

Theming ([src/styles.scss](src/styles.scss) +
[src/app/shared/_palette.scss](src/app/shared/_palette.scss)):
- A light Material 3 theme (`mat.theme(...)`) driven by a hand-written custom
  **primary palette** (indigo, not Material's stock `mat.$azure-palette`);
  `tertiary` uses its own palette kept in the same blue/indigo family rather than
  the complementary hue M3 picks by default. Both are full M3 tone-0–100 maps in the
  same shape as `mat.$azure-palette`. Material derives the light theme's primary role
  from a palette's *tone 40* (`#275fa0` here, a shade lighter than the design's
  indigo), so `mat.theme-overrides` pins `--mat-sys-primary` itself to `#24489A`;
  containers and the other roles still come from the palette.
- Separately, a small set of **app colour tokens** (`--app-bg`, `--app-surface`,
  `--app-ink` / `-ink-2` / `-ink-3`, `--app-line`, plus one fixed accent per entity
  type: `--flight` / `--train` / `--bus` / `--activity` / `--car` / `--now`) are
  declared as CSS custom properties on `html`, next to the theme mixin. These aren't
  yet wired into `body`'s background (cards are still grey, pending a later
  redesign step) but the per-type colour **defaults** in `color.ts` already match
  them, and the timeline's secondary/zone text (`.day-zone`, `.day-date`, the
  virtual day marker, `.no-entries`, the `zone-tag`/GMT labels in entry/straddle/
  transport cards and the details dialog) uses `--app-ink-2` / `--app-ink-3` instead
  of a low-opacity variant token, so it stays readable against the light surfaces.

Responsive layout ([src/app/shared/_breakpoints.scss](src/app/shared/_breakpoints.scss)):
- Two **max-width-only** breakpoints, so the desktop presentation is untouched:
  `$mobile` (720px) — where the trip shell collapses to a single column and the
  timeline's content column (viewport minus day marker and the hotel/car lanes)
  gets too narrow for the horizontal `FROM → TO` route; `$mobile-wide` (560px) —
  where the full-width surfaces (shared `TransportCard`, section detail cards,
  details dialog, dashboard) run out of room. They live in one partial so the
  two numbers aren't scattered across stylesheets.
- On mobile the **route layouts stack**: each leg becomes a `[time][place]` row
  (place over its per-leg detail), the arrow rotates to point down the stack
  with the duration beside it, and the per-mode **detail column moves from a
  right-hand column to a full-width footer row** (`.entry > .detail` etc. — the
  `>` matters, a bare `.detail` would also hit the per-leg one). The day marker
  and lanes shrink via `--tl-marker` / `--tl-lane`, read by the inline
  `TimelineView.gridTemplateColumns` binding (export mode still pins fixed px).
  Straddle cards need *more* clearance than on desktop
  (`.day-content.pad-top/.pad-bottom` 6.5rem vs 4.25rem) because the mobile card
  is taller — the clearance must always exceed half the tallest straddle.
- The `bp.mobile` / `bp.mobile-wide` **mixins** also exclude the plan-export
  document (`html.exporting-plan`, set by [ExportHost](src/app/trips/export/export-host.ts)
  for the duration of an export): it is rendered off-screen at a fixed 1024px,
  but a media query still sees the *viewport*, so without the guard exporting a
  PNG from a phone would bake the mobile layout into it. Surfaces the export
  never renders (trip shell, dashboard) skip the mixins and use
  `@media (max-width: bp.$mobile)` with the same variables.
- **Mobile app frame** ([TripPage](src/app/trips/trip-page/trip-page.ts), R3):
  below `$mobile` the `.side-panel` is hidden outright (`display: none`) and
  `trip-page.html` instead renders a sticky app bar + a fixed bottom nav,
  both guarded by `editMode.isMobile()` so neither ever reaches the desktop
  DOM. The app bar (`.mobile-sticky-stack`, `position: sticky; top: 0`) carries
  back / title + subtitle / the R1 Read-Editing toggle / the trip-actions
  kebab — the kebab's `mat-menu` is the **same** `#tripMenu` instance the
  (now mobile-only) side-panel button used to trigger, just triggered from a
  second button, so the dialog-opening logic isn't duplicated. The R1 amber
  edit banner renders as a sibling inside that same sticky block, so it
  stacks directly under the app bar rather than needing a computed offset.
  The subtitle is `tripContextLabel(trip, now)` in
  [trip-context.ts](src/app/shared/format/trip-context.ts) — a pure function
  ("Day 7 of 16 · Thu, 9 Apr" / "Starts in N days" / the date range after the
  trip), resolving "today" in the trip's **destination** zone via Luxon
  `setZone`, not the device's. `<app-day-strip>` (R4, see below) sits below the
  title row, rendered only on the Timeline route. The bottom nav
  (`position: fixed; bottom: 0`) has five columns — Timeline / Overview /
  Stays / Transport / a **More** `mat-menu` (Car rentals, Reservations, then
  the same Export plan / Export JSON / Edit trip handlers as the kebab) —
  `routerLinkActive` drives the active pill except for More, whose active
  state is a `computed` over `Router.events` (active on `car-reservations` /
  `reservations`, the two routes it alone links to). Both bars repeat the
  `@media print { display: none }` guard the R1 banner uses, on top of
  already being inside `.trip-layout` (hidden during plan export/print, see
  "Plan export" above) belt-and-braces. The mobile `.trip-layout` rule uses
  `grid-template-columns: minmax(0, 1fr)`, not a bare `1fr` — an `fr` track's
  implicit minimum is `auto` (its widest child's min-content width), so
  without the explicit floor one non-wrapping row (e.g. a deadline-pill
  button) would blow the shared single-column track — and every other row in
  it — out past the viewport.
- **Mobile timeline navigation** ([day-section.scss](src/app/trips/timeline/day-section.scss),
  [timeline.scss](src/app/trips/timeline/timeline.scss), R4): below `$mobile`
  `--tl-marker` collapses to `0` and `.day-marker` is hidden outright; each day's
  `.day-content` instead gets a sticky `.day-header` as its first child (`position: sticky; top:
  var(--app-bar-height, 0px)`, `scroll-margin-top` the same — needed so the day
  strip's `scrollIntoView(block:'start')` lands the header right under the app bar
  instead of overshooting by its height and hiding the day's first item behind it).
  `--app-bar-height` is set on `document.documentElement` by `TripPage`, which
  measures `.mobile-sticky-stack`'s real height (app bar + optional R1 edit banner)
  with a `ResizeObserver` (mobile only; the property is removed on destroy/desktop).
  The day strip and the day headers' tap-to-open-day-menu, today ring, now-line and
  "Up next" card are all covered by their own bullets above (Timeline composition);
  none of it renders on desktop (`.day-header`/`.now-line`/`.up-next-label` default
  to `display: none`, only switched on inside each file's `bp.mobile` block) or
  during the plan export, since `bp.mobile` already excludes `html.exporting-plan`
  and `TimelineView` never publishes to `TimelineNavService` when `tripOverride`/
  `exportMode` is set.
- **Mobile hotel/car lanes as colour rails** ([hotel-cell.scss](src/app/trips/timeline/hotel-cell.scss),
  [car-span.scss](src/app/trips/timeline/car-span.scss), [timeline.scss](src/app/trips/timeline/timeline.scss),
  R5, "Variante C"): below `$mobile`, `--tl-lane` shrinks from the desktop
  `clamp(40px, 9vw, 52px)` to a flat `6px` and the grid's `column-gap` tightens —
  the day marker is already `0` (R4), so the content column starts within ~40px
  of the left edge. `HotelCell`'s half-day-handoff divs and `CarSpan`'s block
  keep their desktop markup/logic and just get restyled: full accent colour
  (not the desktop's light `color-mix` tint), small rounded corners instead of
  12px, and the icon/name (`.car-icon`/`.car-name`, `.stay-label` in
  timeline.html) hidden outright — the name now lives in the day header's
  stay/car line (see "Mobile timeline navigation" below). A hotel switch thus
  reads as a plain colour change on the rail, a night with no stay as a gap;
  click and long-press (contextmenu) behaviour is untouched.

Dialogs ([src/app/trips/dialogs/](src/app/trips/dialogs/) +
[src/app/shared/](src/app/shared/)): trip form, accommodation, car reservation,
activity, transport, a shared read-only **details** dialog (Edit/Delete actions), and
a generic **confirm** dialog. The details dialog opens with focus on its title
(`autoFocus: 'first-heading'` in `TripActionsService`), so a phone does not
scroll it down to the first link. Reusable inputs: `TimezoneSelect`, `ZonedTimeField`,
`DateField`, `SuggestField` (free-text autocomplete used for the train/bus kind).

## Data Model

See [src/app/models/trip.model.ts](src/app/models/trip.model.ts). All DTOs are plain
JSON (persisted as-is, exported as-is). Key idea: a `ZonedTime` stores a wall-clock
string + IANA zone (no offset), so Luxon can render the same instant in any zone.

```
TripDto { id, schemaVersion, title, startDate, endDate, homeTimeZone,
          destinationTimeZone, description?, exchangeRates?, exchangeRatesUpdatedAt?,
          accommodations[], carReservations[], activities[], transport[],
          createdAt, updatedAt }
ZonedTime { dateTime: "YYYY-MM-DDTHH:mm", zone: "Asia/Tokyo" }
CostInfo { totalPrice?, currency?, alreadyPaid?, paymentDate?,
           freeCancellationUntil?, cancellationCost? }   // mixed into every entity
AccommodationDto extends CostInfo { id, name, fullName?, address?, googleMapsUrl?,
                   bookingUrl?, remarks?, color?, checkInDate, checkOutDate }
CarReservationDto extends CostInfo { id, name, company?, carType?, pickupLocation?,
                    dropoffLocation?, pickupDate, dropoffDate, pickupTime?,
                    dropoffTime?, pickupGoogleMapsUrl?, dropoffGoogleMapsUrl?,
                    pickupStationUrl?, dropoffStationUrl?, bookingUrl?,
                    bookingReference?, remarks?, color? }
ActivityDto extends CostInfo { id, title, start, end?, location?, googleMapsUrl?,
                    bookingUrl?, notes?, color? }
TransportDto extends CostInfo { id, mode: flight|train|bus|car, start, end?,
               fromLocation?, toLocation?, bookingUrl?, bookingReference?, notes?,
               color?,
               // flight-only: airline?, flightNumber?, fromAirport?, toAirport?,
               //              fromTerminal?, toTerminal?
               // train-only:  fromStation?, toStation?, fromPlatform?,
               //              toPlatform?, trainName?, trainKind?
               // bus-only:    fromStop?, toStop?, busKind?
               // train + bus: line?, operator? }
```

**Cost / currency:** every entity carries the shared `CostInfo` (amounts in major
units + a 3-letter `currency`, defaulting to **EUR**). The trip's
`exchangeRates` maps a non-EUR code → **EUR per one foreign unit** (EUR implicitly
1). The Overview "Trip cost" section aggregates everything to EUR (total / already
paid / outstanding + a per-category breakdown), letting you edit a rate per
currency in use ("1 EUR = X JPY"); an amount whose rate is unset is excluded from
the total with a warning. Rates can also be **refreshed online**: a small button next
to the "Exchange rates" title in Overview calls
[ExchangeRateService](src/app/services/exchange-rate.service.ts) (the free,
key-less [Frankfurter API](https://frankfurter.dev), ECB reference rates) and
saves the results via `TripActionsService.refreshExchangeRates`. Each rate's
`exchangeRatesUpdatedAt` timestamp (set by both manual edits and the refresh) is
shown under its input; a rate older than `RATE_STALE_AFTER_DAYS` (7 days) — or
one with no timestamp at all (legacy data) — renders in amber with a warning
icon. Pure helpers live in
[src/app/shared/cost/cost.ts](src/app/shared/cost/cost.ts) (`formatMoney` via
`Intl`, `toEur`, `tripCostSummary`, `isRateStale`, `formatRateAge`); the reusable
cost form is [CostFieldset](src/app/shared/cost/cost-fieldset.ts), embedded in
every entity dialog. The selectable currency codes are env-configurable (see
"Configuration").

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
`bookingReference`, the transport `bookingReference`, and the accommodation
`price`, was an additive **schema v6** step (no data transform).

Replacing the free-text `price` on accommodations / car reservations with the
structured `CostInfo` (mixed into every entity) and the trip `exchangeRates` was a
**schema v7** step: its migration folds any old `price` value into the entity's
`remarks` (e.g. appends `price: ¥18,000`) and drops the field; the new cost fields
are additive.

Adding the optional trip `exchangeRatesUpdatedAt` (when each exchange rate was
last set) was an additive **schema v8** step (no data transform).

Every entity may carry an optional `color` (a hex accent). When unset, a default
applies: accommodations and car reservations each cycle their own distinct tints by
storage order; each transport mode has its own colour; activities use their own
accent (kept distinct from the flight blue). Colour logic + the quick-pick palette live in
[src/app/shared/color/color.ts](src/app/shared/color/color.ts); the reusable
picker (palette swatches + native colour input) is
[ColorField](src/app/shared/color/color-field.ts), embedded in each entity
dialog. Cards bind the resolved colour to a `--accent` CSS var; the hotel lane
tints it light via `color-mix`. The per-mode/activity **defaults** above match the
fixed `--flight` / `--train` / `--bus` / `--activity` / `--car` app colour tokens
declared on `html` in [styles.scss](src/styles.scss) (see "Theming" below); the
quick-pick palette and the accommodation/car tint cycles are independent and
unaffected.

Entries are bucketed into a day by their `start` converted to the **destination tz**
date; entries outside the trip range are clamped to the first/last day.

**Date / zone display formatting:** [date-format.ts](src/app/shared/format/date-format.ts)
is the pure-function counterpart to `cost.ts` for dates — `formatDay` ("Thu, 9 Apr"),
`formatDate` (same, with year), `formatRange` (a compact "3–18 Apr 2026" /
"28 Mar – 3 Apr 2026" / "28 Dec 2026 – 3 Jan 2027" span, collapsing a same-day range to
one date), `zoneCity` ("Asia/Tokyo" → "Tokyo") and `zoneLabel` ("Tokyo · GMT+9", offset
via Luxon's `ZZZZ` format at a given moment or now). Every UI surface that renders a
trip date or an IANA zone id (side panel, trip list, Overview, the details dialog,
the plan-export cover, the timeline's "Move item?" confirm) goes through these instead
of the raw ISO string; **forms** and the **JSON/Markdown export** keep the raw values
unchanged. Components expose the needed helper(s) as `protected readonly` fields for
templates to call, the same pattern `formatMoney` uses.

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
  (build-time default `http://localhost:8000`; the Docker image instead defaults to
  the same-origin `/api`, see "Deploy (Docker / GHCR)"). May be a relative path.
- `TRAIN_KINDS` / `BUS_KINDS` — comma-separated options for a train's / bus's
  "kind" field, consumed by [TransportDialog](src/app/trips/dialogs/transport-dialog.ts)
  (a free-text autocomplete via [SuggestField](src/app/shared/suggest-field/suggest-field.ts)).
  When set they **replace** the built-in defaults (trains: `Local train, Rapid,
  Limited express, Shinkansen`; buses: `City bus, Long-distance coach, Overnight,
  Hop on/off`). Surface as `string[]` on `environment` (a runtime override may be
  a comma string or array).
- `RESERVABLE_TRAIN_KINDS` — comma-separated train kinds that get a reservation
  window (default `Shinkansen, Limited express`). Matched case-insensitively against
  a transport's `trainKind`; an empty list switches the feature off. Consumed by
  [reservation.ts](src/app/shared/reservation/reservation.ts) via
  `environment.reservableTrainKinds`.
- `CURRENCIES` — comma-separated currency codes offered in the cost picker
  ([CostFieldset](src/app/shared/cost/cost-fieldset.ts), via the same `SuggestField`
  autocomplete, so any 3-letter code can still be typed). EUR is the base currency;
  non-EUR amounts need an exchange rate in the trip Overview. When set, **replaces**
  the default (`EUR, USD, JPY`). Surfaces as `string[]` on `environment`.

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
  no-cache `config.js`, API reverse proxy) is [nginx.conf](nginx.conf), shipped as a
  `*.template` so nginx's envsubst renders `listen ${PORT}` (default `80`,
  env-overridable) and the proxy's upstream. Image `ghcr.io/tkober/trip-planner-web`.

**Same-origin API (why `API_BASE_URL` defaults to `/api`):** nginx reverse-proxies
`/api/` to the backend over the internal compose network (upstream from
`API_UPSTREAM`, default `trip-planner-server:8000`). The SPA therefore calls the API
on **whatever origin the browser loaded the page from** — LAN IP, mDNS `*.local` name,
WireGuard/DynDNS address, reverse-proxy domain — so one deployment works from all of
them, **no CORS is involved**, and the backend port needn't be published at all. An
absolute `API_BASE_URL` still works (bypasses the proxy) but re-introduces CORS and
pins the deployment to one address: reaching the app by any other name then fails with
`ERR_NAME_NOT_RESOLVED` or a CORS block, both of which surface in Angular as the
same opaque `status: 0, "Unknown Error"`. Two envsubst gotchas the template depends on:
`PORT`/`API_UPSTREAM` need `ENV` defaults in the [Dockerfile](Dockerfile) (envsubst
only replaces variables that are *set* — an unset one is left verbatim and nginx
refuses to start), and it rewrites **comments** too, so the template's comments avoid
spelling those names out. The upstream goes through a `set` variable + Docker's
embedded `resolver`, which defers DNS to request time so recreating the backend
container (new IP) doesn't strand nginx on a stale address.

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
- New styling is **desktop-first**: put phone adjustments in a `bp.mobile` /
  `bp.mobile-wide` block at the end of the stylesheet rather than changing the
  shared rules, so the desktop layout stays byte-identical.
- **Keep this file updated** as features land or the architecture shifts.
