/**
 * Runtime configuration override for the Trip Planner.
 *
 * Default no-op: when this global is empty (the committed default, used by
 * `npm start` and the GitHub Pages deploy), the app falls back to the
 * build-time values baked into environment.ts. The Docker image overwrites
 * this file on container startup from env vars (see docker-entrypoint.sh), so
 * a single built image is reconfigurable per deployment without a rebuild.
 *
 * Supported keys: defaultDepartureTimeZone, defaultTripTimeZone,
 * storageBackend ("indexeddb" | "http"), apiBaseUrl.
 */
window.__TRIP_PLANNER_ENV__ = {};
