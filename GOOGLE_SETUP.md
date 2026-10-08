# Google Maps Setup

Coordinates for accommodations, car pickup/dropoff, activities and transport
endpoints (D5, #49) use the **Google Maps JavaScript API** (the "Locate"
mini maps and the details view's map) and the **Geocoding API** (the
"Locate" button in every dialog and the trip menu's "Locate places…"). Both
are read from two runtime environment variables:

| Variable | What it is |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Browser API key for the Maps JS + Geocoding APIs |
| `GOOGLE_MAPS_MAP_ID` | A Cloud "Map ID" for the custom style + Advanced Markers (pins) |

Unlike `footage-archive` (which this setup is adapted from), there's no
backend `/config` endpoint — the key lives directly in the trip planner's own
runtime config (`window.__TRIP_PLANNER_ENV__`, written by
`docker-entrypoint.sh` from container env vars, or `scripts/generate-env.mjs`
for `npm start`/GitHub Pages — see the "Configuration" section of
[CLAUDE.md](CLAUDE.md)). If both are blank, the app runs exactly as before
Maps was added: every "Locate" button, mini map and the trip menu's "Locate
places…" item are hidden, with no errors in the console. This also covers
the GitHub Pages build, which never sets these.

This guide produces the two values above. It takes ~10 minutes and, for a
single trip planner, stays comfortably inside the free tier (see
[Cost & free quota](#cost--free-quota)).

---

## Prerequisites

- A Google account.
- A credit/debit card. Google **requires a billing account** on Maps
  Platform even though your usage will be free. You will not be charged
  within the free limits below, and you can add a budget alert (Step 7) as a
  safety net.

---

## Step 1 — Create a Google Cloud project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. In the top bar, click the **project dropdown → New Project**.
3. Name it e.g. `trip-planner` and click **Create**.
4. Make sure the new project is selected in the project dropdown before
   continuing.

## Step 2 — Enable billing

1. Navigation menu (☰) → **Billing**.
2. **Link a billing account** (create one if you don't have it). The
   project must show "Billing is enabled".

> Without billing, the Maps JS API returns errors and maps render as a grey,
> watermarked "for development purposes only" image.

## Step 3 — Enable the two APIs

1. Navigation menu (☰) → **APIs & Services → Library**.
2. Search **"Maps JavaScript API"** → open it → **Enable**.
3. Go back to the Library, search **"Geocoding API"** → open it → **Enable**.

(That's all the APIs the trip planner uses. You do not need Places,
Directions, etc.)

## Step 4 — Create an API key

1. **APIs & Services → Credentials**.
2. **+ Create credentials → API key**.
3. A key like `AIzaSy...` is shown. Copy it — this is your
   `GOOGLE_MAPS_API_KEY`.
4. Click **Edit API key** (pencil) to restrict it in the next step.
   *Leaving a Maps key unrestricted is the main thing to avoid* —
   restriction, not secrecy, is what protects a browser key (it is always
   visible in page source).

## Step 5 — Restrict the API key

In the key's edit page:

**Application restrictions → Websites (HTTP referrers).** Add an entry for
every host you open the trip planner from. Examples:

| Where you use it | Referrer to add |
|---|---|
| Local dev (`npm start`) | `http://localhost:4200/*` |
| GitHub Pages | `https://<your-user>.github.io/*` |
| Self-hosted (Docker, by IP) | `http://192.168.2.230:8080/*` |
| Self-hosted (by hostname) | `http://trip-planner.local:8080/*` |

> Use the real host/port you browse to. If you reach the app by **both** an
> IP and a hostname (or both locally and via GitHub Pages), add **all** of
> them. Wrong/missing referrers → `RefererNotAllowedMapError` on the map and
> `REQUEST_DENIED` from the geocoder — both read as "no match"/"maps
> disabled" in the app rather than a loud error. Adjust the port if you
> changed it.

**API restrictions → Restrict key →** select exactly:
- **Maps JavaScript API**
- **Geocoding API**

Click **Save**. (Restriction changes can take a few minutes to propagate.)

## Step 6 — Create a Map ID with a light, calm style

The custom pins use **Advanced Markers**, which require a Map ID, and the
basemap itself should match the app's own look — light, white/grey, with
indigo accents — rather than Google's default style.

1. Navigation menu (☰) → **Google Maps Platform → Map management**
   (direct link: <https://console.cloud.google.com/google/maps-apis/studio/maps>).
2. **Create Map ID**. Name it e.g. `trip-planner-web`, **Map type:
   JavaScript**, **Vector** (recommended — vector maps support Advanced
   Markers fully). **Save**, then copy the generated **Map ID** — this is
   your `GOOGLE_MAPS_MAP_ID`.
3. Navigation menu (☰) → **Google Maps Platform → Map Styles**
   (direct link: <https://console.cloud.google.com/google/maps-apis/studio/styles>).
4. **Create style → JavaScript**. Name it `trip-planner-quiet`. The editor
   only needs a **Light mode** variant here — the trip planner has no dark
   mode (see [CLAUDE.md](CLAUDE.md)'s "Theming" section).
5. Apply these feature settings:

   | Feature | Visibility | Colour |
   |---|---|---|
   | Points of interest — all categories (attractions, business, government, medical, parks, places of worship, schools, sports): icons & labels | Off | — |
   | Points of interest — park *areas* (fill only, no labels) | On | `#e9ede9` |
   | Transit — lines and all stations | Off | — |
   | Road — highways & arterials (geometry) | On | `#ffffff` |
   | Road — local roads (geometry) | On | `#ffffff` |
   | Road — shields / route numbers | Off | — |
   | Political — country, admin area, locality labels | On | `#4a5568` |
   | Political — neighbourhood labels | On | `#737f8c` |
   | Political — land parcel | Off | — |
   | Landscape — land | On | `#f4f5f7` |
   | Water | On | `#dbe3ea` |
   | Labels — text (non-prominent) | — | `#737f8c` |
   | Labels — text stroke/halo | — | `#f4f5f7` (= land) |

   This is a muted, white/grey base matching the app's cards (`--app-surface`,
   `--app-line`) — markers carry the indigo accent (`#24489a`, the app's
   primary colour) instead, applied in code (see `shared/geo/`'s pin
   styling), not in the map style itself.
6. **Save**, then **Publish**.
7. **Google Maps Platform → Map management** → open the Map ID from step 2
   → **Associate a style** → pick `trip-planner-quiet` → **Save**.

## Step 7 — (Recommended) Guard against surprise charges

1. **Billing → Budgets & alerts → Create budget**, set a small amount (e.g.
   €1) so you get an email if anything ever bills.
2. Optional hard cap: **APIs & Services → (each API) → Quotas** lets you cap
   requests per day so you can never exceed the free tier.

## Step 8 — Set the environment variables

- **Local dev** (`npm start`): add to `.env` at the repo root (see
  `.env.example`):
  ```dotenv
  GOOGLE_MAPS_API_KEY=AIzaSy...your key...
  GOOGLE_MAPS_MAP_ID=...your map id...
  ```
  `npm start`'s `prestart` hook (`scripts/generate-env.mjs`) picks these up
  automatically; restart `npm start` after editing `.env`.
- **Docker / self-hosted:** set `GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_MAP_ID`
  as container env vars (`docker-entrypoint.sh` writes them into
  `config.js` on startup — see "Deploy (Docker / GHCR)" in
  [CLAUDE.md](CLAUDE.md)). **This is what needs to be set in the
  `compose-stacks-unraid` stack** for the deployed trip planner.
- **GitHub Pages:** leave both unset. The deploy workflow never sets them,
  so the Pages build runs with Maps disabled — this is intentional (#49).

Verify: open the app, open any entity dialog (e.g. "Add accommodation") —
a **Locate** button should appear next to the address field. Click it with
an address typed in; a small map with a pin should appear below.

---

## Disabling maps again

Leave (or set) both variables blank. Every "Locate" button, mini map, the
details view's map, and the trip menu's "Locate places…" item disappear —
nothing else changes, and nothing in the data model requires them (existing
coordinates are simply not shown, not deleted).

---

## Cost & free quota

Google replaced the old flat **$200/month credit** (on **1 March 2025**)
with **per-SKU monthly free caps**. The two APIs the trip planner uses are
both in the **Essentials** tier:

| API (SKU) | Free per month | What counts as one unit |
|---|---|---|
| Maps JavaScript API — *Dynamic Maps* | **10,000 map loads** | one *map load* = a `<google-map>` being instantiated (a "Locate" mini map, the details view's map, or the "Locate places…" review) |
| Geocoding API | **10,000 requests** | one "Locate" geocode (single field, or one row of "Locate places…") |

A personal trip planner — even planning several trips a year, each with a
few dozen places — stays orders of magnitude under both caps. The optional
budget alert in Step 7 is a safety net, not an expectation of being needed.
