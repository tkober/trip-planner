/**
 * Shared types for the details dialog/sheet (R8). Kept in their own file (no
 * imports back to `details-dialog.ts` / `details-sheet.ts` / `details-content.ts`)
 * so the pure helpers in `details-view.logic.ts` and all three components can
 * depend on them without a cycle.
 */
import {
  AccommodationDto,
  ActivityDto,
  CarReservationDto,
  TransportDto,
} from '../../models/trip.model';

export type DetailsKind =
  | 'accommodation'
  | 'car-reservation'
  | 'activity'
  | 'transport';
export type DetailsAction = 'edit' | 'delete';

export interface DetailsDialogData {
  kind: DetailsKind;
  homeZone: string;
  destinationZone: string;
  /**
   * Resolved accent colour (the entity's explicit `color`, else its
   * storage-order default — see `shared/color/color.ts`) for the header's
   * icon tile. Callers (`TripActionsService`) resolve it, since only they
   * have the trip's full accommodation/car lists needed for the default
   * cycle.
   */
  accent: string;
  accommodation?: AccommodationDto;
  carReservation?: CarReservationDto;
  activity?: ActivityDto;
  transport?: TransportDto;
  /**
   * R9: the owning trip's id, so `DetailsContent` can re-derive the live
   * accommodation/car reservation from `TripStore` (dates may change via the
   * check-in/out and pickup/return steppers while the view stays open) and
   * save a nudge immediately. Only set for the `accommodation`/
   * `car-reservation` kinds — those are the only ones steppers apply to.
   */
  tripId?: string;
}
