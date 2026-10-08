import {
  AfterViewInit,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { GoogleMap, MapAdvancedMarker } from '@angular/google-maps';
import { GeoPoint } from '../../../models/trip.model';
import { GoogleMapsLoaderService } from '../../../services/google-maps-loader.service';

export interface GeoMapPin {
  point: GeoPoint;
  /** Accent colour for this pin's marker (the entity's own colour, R7 style). */
  color: string;
  label?: string;
}

/**
 * Read-only small map showing one or more pins (D5, #49) — used by the
 * details view for an accommodation/activity/car/transport that has
 * coordinates. Always loaded lazily (`@defer` in the host template).
 */
@Component({
  selector: 'app-geo-map',
  imports: [GoogleMap, MapAdvancedMarker],
  templateUrl: './geo-map.html',
  styleUrl: './geo-map.scss',
})
export class GeoMap implements AfterViewInit {
  private readonly loader = inject(GoogleMapsLoaderService);

  readonly pins = input.required<GeoMapPin[]>();
  readonly height = input<string>('160px');

  readonly mapId = this.loader.mapId;
  readonly mapsReady = signal(false);

  private readonly map = viewChild(GoogleMap);

  readonly center = computed<google.maps.LatLngLiteral>(() => {
    const pins = this.pins();
    if (!pins.length) return { lat: 0, lng: 0 };
    const lat = pins.reduce((s, p) => s + p.point.lat, 0) / pins.length;
    const lng = pins.reduce((s, p) => s + p.point.lng, 0) / pins.length;
    return { lat, lng };
  });

  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    gestureHandling: 'cooperative',
  };

  constructor() {
    void this.loader.load().then((ok) => this.mapsReady.set(ok));
  }

  ngAfterViewInit(): void {
    // Fit every pin into view when there's more than one (e.g. a transport
    // leg's from/to, or a car's pickup/dropoff).
    queueMicrotask(() => this.fitBounds());
  }

  private fitBounds(): void {
    const pins = this.pins();
    const gm = this.map()?.googleMap;
    if (!gm || pins.length < 2 || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of pins) bounds.extend({ lat: p.point.lat, lng: p.point.lng });
    gm.fitBounds(bounds, 32);
  }

  pinContent(color: string): HTMLElement | null {
    if (typeof google === 'undefined' || !google.maps?.marker) return null;
    const pin = new google.maps.marker.PinElement({
      background: color,
      borderColor: '#162e63',
      glyphColor: '#ffffff',
    });
    return pin.element;
  }
}
