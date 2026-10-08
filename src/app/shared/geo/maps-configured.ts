import { environment } from '../../../environments/environment';

/**
 * Whether a Google Maps key is configured at all (D5, #49) — a cheap,
 * synchronous module-level constant (no script load), used by every dialog
 * and the details view as the `@defer (when ...)` gate that keeps
 * `@angular/google-maps` out of the eagerly-loaded bundle entirely when no
 * key is set (the common case: GitHub Pages / no key configured).
 */
export const GOOGLE_MAPS_CONFIGURED = !!environment.googleMapsApiKey;
