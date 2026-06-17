import { Component, input } from '@angular/core';
import { TripDto } from '../../models/trip.model';
import { TimelineView } from '../timeline/timeline';
import { OverviewView } from '../views/overview-view';
import { AccommodationsView } from '../views/accommodations-view';
import { CarReservationsView } from '../views/car-reservations-view';
import { TransportView } from '../views/transport-view';

/**
 * A self-contained, non-interactive render of a whole trip used for export.
 * Reuses the live timeline + section views (fed via their `tripOverride` input)
 * so the output matches the on-screen app exactly. The `.export-doc` host class
 * scopes the chrome-hiding + print pagination rules in styles.scss.
 *
 * The PNG export captures only `.timeline-capture` (cover + timeline); the PDF
 * (native print) renders the whole document, each section on its own page.
 */
@Component({
  selector: 'app-trip-export-document',
  imports: [
    TimelineView,
    OverviewView,
    AccommodationsView,
    CarReservationsView,
    TransportView,
  ],
  templateUrl: './trip-export-document.html',
  host: { class: 'export-doc' },
})
export class TripExportDocument {
  readonly trip = input.required<TripDto>();
  /** When true, a "shared copy — details redacted" note is shown on the cover. */
  readonly anonymized = input(false);
}
