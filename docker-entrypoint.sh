#!/bin/sh
# Generate the runtime config.js read by the Trip Planner SPA, from container
# env vars. Run by nginx's official entrypoint (/docker-entrypoint.d/*.sh)
# before nginx starts. Mirrors the defaults in scripts/generate-env.mjs.
set -e

: "${STORAGE_BACKEND:=indexeddb}"
: "${API_BASE_URL:=http://localhost:8000}"
: "${DEFAULT_TRIP_TZ:=Asia/Tokyo}"
: "${DEFAULT_DEPARTURE_TZ:=}"

# Only "http" or "indexeddb" are valid; anything else falls back to indexeddb.
[ "$STORAGE_BACKEND" = "http" ] || STORAGE_BACKEND=indexeddb

cat > /usr/share/nginx/html/config.js <<EOF
window.__TRIP_PLANNER_ENV__ = {
  defaultDepartureTimeZone: "${DEFAULT_DEPARTURE_TZ}",
  defaultTripTimeZone: "${DEFAULT_TRIP_TZ}",
  storageBackend: "${STORAGE_BACKEND}",
  apiBaseUrl: "${API_BASE_URL}"
};
EOF

echo "[trip-planner] config.js: backend=${STORAGE_BACKEND} api=${API_BASE_URL} trip=${DEFAULT_TRIP_TZ}"
