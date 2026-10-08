import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Loads the Google Maps JavaScript API exactly once, using the key from the
 * runtime environment config (D5, #49 — see `environment.ts`'s
 * `googleMapsApiKey`/`googleMapsMapId`, sourced from `window.__TRIP_PLANNER_ENV__`).
 * Unlike footage-archive's version, there's no backend `/config` round trip —
 * the key already lives in the same runtime config the rest of the app reads.
 *
 * Components/services call `load()` and gate any maps UI on the result; with
 * no key configured it resolves `false` immediately and logs nothing, so the
 * app behaves exactly as before Maps was added.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private loadPromise: Promise<boolean> | null = null;

  /** Cloud Map ID (empty when maps are disabled or none is configured). */
  get mapId(): string {
    return environment.googleMapsMapId;
  }

  /** Whether a key is configured at all — cheap, synchronous, no script load. */
  get configured(): boolean {
    return !!environment.googleMapsApiKey;
  }

  /**
   * Resolves true once `google.maps` (incl. the `maps`/`marker`/`geocoding`
   * libraries) is ready, or false when no API key is configured. Idempotent —
   * repeat callers share the same in-flight promise and never trigger a
   * second script load.
   */
  load(): Promise<boolean> {
    if (!this.loadPromise) {
      this.loadPromise = this.doLoad();
    }
    return this.loadPromise;
  }

  private async doLoad(): Promise<boolean> {
    if (typeof google !== 'undefined' && google.maps?.Map) {
      return true;
    }
    const key = environment.googleMapsApiKey;
    if (!key) {
      return false; // maps disabled — callers fall back to no "Locate" UI
    }
    await this.injectScript(key);
    await Promise.all([
      google.maps.importLibrary('maps'),
      google.maps.importLibrary('marker'),
      google.maps.importLibrary('geocoding'),
    ]);
    return true;
  }

  private injectScript(key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (document.getElementById('google-maps-js')) {
        resolve();
        return;
      }
      const callbackName = '__tripPlannerGoogleMapsReady';
      (window as any)[callbackName] = () => resolve();
      const script = document.createElement('script');
      script.id = 'google-maps-js';
      script.async = true;
      script.src =
        'https://maps.googleapis.com/maps/api/js' +
        `?key=${encodeURIComponent(key)}` +
        '&v=weekly&loading=async&libraries=marker,geocoding' +
        `&callback=${callbackName}`;
      script.onerror = () =>
        reject(new Error('Failed to load the Google Maps JavaScript API'));
      document.head.appendChild(script);
    });
  }
}
