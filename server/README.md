# Trip Planner API

A small FastAPI backend that stores trips in PostgreSQL, used when the Angular app
is built with `STORAGE_BACKEND=http`. Each trip is persisted as one row with a few
scalar columns (for listing/sorting) plus the full `TripDto` JSON in a `JSONB`
column. The backend is *dumb whole-trip storage* — schema migration stays a
frontend concern (see `src/app/models/migrations.ts`).

## Endpoints

| Method | Path           | Description                |
| ------ | -------------- | -------------------------- |
| GET    | `/trips`       | List all trips (newest first) |
| GET    | `/trips/{id}`  | Fetch one trip             |
| POST   | `/trips`       | Create/store a trip        |
| PUT    | `/trips/{id}`  | Replace a trip             |
| DELETE | `/trips/{id}`  | Delete a trip              |
| GET    | `/health`      | Liveness check             |

## Run locally

Dependencies are managed with [uv](https://docs.astral.sh/uv/). You need a
reachable PostgreSQL database (it must already exist). On startup the table is
**created automatically** — see "Database roles" below — so there is no separate
migration step.

```bash
cd server
uv sync                       # create .venv + install from pyproject.toml/uv.lock

cp .env.example .env          # then fill in the DB_* vars / CORS_ORIGINS
uv run uvicorn app.main:app --reload --port 8000
```

Verify:

```bash
curl http://localhost:8000/trips      # -> []
```

## Configuration

Set via environment variables (or `server/.env`):

- `DB_URL` — connection target only: host/port/database, **no credentials and no
  driver scheme**, e.g. `postgresql://192.168.2.230:5432/trip_planner`.
- `DB_USER` / `DB_PASSWORD` — the **app** role used for all regular runtime CRUD.
- `DB_OWNER_USER` / `DB_OWNER_PASSWORD` — the **owner** role used only at startup.
- `CORS_ORIGINS` — comma-separated allowed origins (the Angular dev origin,
  e.g. `http://localhost:4200`); `*` allows any.

### Database roles

DDL is restricted to the owner role, so the app uses two roles:

- On startup, `init_db()` opens a short-lived **owner** connection and creates the
  `trips` table if absent (idempotent).
- Every request thereafter runs as the **app** role, which only needs CRUD
  privileges (no DDL).

The app role's access to the owner-created table is expected to come from server-side
default privileges, e.g.:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE trip_planner_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trip_planner_app;
```

so the backend issues no `GRANT` itself. The owner credentials are therefore only
exercised during boot; the running server serves traffic as the app role. This is
intentionally lighter than Alembic — the schema is a single JSONB-backed table, and
trip-document evolution is handled in the frontend
(`src/app/models/migrations.ts`), not in SQL.

## Point the frontend at it

Build/serve the Angular app with:

```bash
STORAGE_BACKEND=http API_BASE_URL=http://localhost:8000 npm start
```
