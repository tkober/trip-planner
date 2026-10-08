import { Component, computed, inject, input, model, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GoogleMap, MapAdvancedMarker } from '@angular/google-maps';
import { GeoPoint } from '../../../models/trip.model';
import { GoogleMapsLoaderService } from '../../../services/google-maps-loader.service';
import { GeocodeService } from '../geocode.service';

/**
 * The "Locate" control (D5, #49): a button that geocodes `query()` (with an
 * optional `countryBias()` region) into a `GeoPoint`, then shows a small
 * draggable-marker map to fine-tune or clear it. Used inline, next to the
 * relevant field, in every entity dialog — always loaded lazily (via
 * `@defer` in the host template), so `@angular/google-maps` never reaches
 * someone with no Maps key configured.
 */
@Component({
  selector: 'app-geo-field',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    GoogleMap,
    MapAdvancedMarker,
  ],
  templateUrl: './geo-field.html',
  styleUrl: './geo-field.scss',
})
export class GeoField {
  private readonly loader = inject(GoogleMapsLoaderService);
  private readonly geocodeSvc = inject(GeocodeService);

  /** Free-text query to geocode, e.g. the accommodation's address field. */
  readonly query = input<string>('');
  /** Country-code region bias (from the trip's destination zone), if any. */
  readonly countryBias = input<string | undefined>(undefined);
  readonly value = model<GeoPoint | undefined>(undefined);

  readonly mapId = this.loader.mapId;
  readonly mapsReady = signal(false);
  readonly loading = signal(false);
  readonly notFound = signal(false);

  readonly center = computed<google.maps.LatLngLiteral>(() => {
    const v = this.value();
    return v ? { lat: v.lat, lng: v.lng } : { lat: 0, lng: 0 };
  });

  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: 'greedy',
  };

  /** Indigo pin (the app's accent colour) instead of Google's default red. */
  readonly pinContent = computed<HTMLElement | null>(() => {
    if (!this.mapsReady() || typeof google === 'undefined' || !google.maps?.marker) {
      return null;
    }
    const pin = new google.maps.marker.PinElement({
      background: '#24489a',
      borderColor: '#162e63',
      glyphColor: '#eef1fb',
    });
    return pin.element;
  });

  constructor() {
    void this.loader.load().then((ok) => this.mapsReady.set(ok));
  }

  async locate(): Promise<void> {
    const q = this.query().trim();
    if (!q) return;
    this.loading.set(true);
    this.notFound.set(false);
    try {
      const geo = await this.geocodeSvc.geocode(q, this.countryBias());
      if (geo) {
        this.value.set(geo);
      } else {
        this.notFound.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  clear(): void {
    this.value.set(undefined);
    this.notFound.set(false);
  }

  onMarkerDragend(event: google.maps.MapMouseEvent): void {
    const ll = event.latLng;
    if (!ll) return;
    // A manual drag invalidates the geocoded placeId/label — keep lat/lng only.
    this.value.set({ lat: ll.lat(), lng: ll.lng() });
  }
}
