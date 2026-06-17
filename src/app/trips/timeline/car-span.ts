import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CarReservationDto } from '../../models/trip.model';

/**
 * One car reservation as a continuous block in the car lane (between the hotel
 * lane and the day content). It spans every day the rental is available
 * (pickup → return, inclusive), tinted by the reservation's accent colour, with
 * a car icon and the vertical name. Clicking it opens the details dialog.
 *
 * Unlike the hotel lane there is no half-day handoff: a car is available the
 * whole of both the pickup and return days, so one solid block reads correctly.
 */
@Component({
  selector: 'app-car-span',
  imports: [MatIconModule],
  host: {
    '[style.grid-row]': 'gridRow()',
    '[style.grid-column]': "'3 / 4'",
  },
  template: `
    <div
      class="car-block"
      [style.--car]="color()"
      (click)="open.emit(reservation())"
      (contextmenu)="onContext($event)"
    >
      <mat-icon class="car-icon">directions_car</mat-icon>
      <span class="car-name">{{ reservation().name }}</span>
    </div>
  `,
  styleUrl: './car-span.scss',
})
export class CarSpan {
  readonly reservation = input.required<CarReservationDto>();
  /** CSS grid-row span, e.g. "2 / 5". */
  readonly gridRow = input.required<string>();
  /** Resolved accent colour (explicit colour or default tint). */
  readonly color = input<string>('');
  readonly open = output<CarReservationDto>();
  /**
   * Right-click → lane context menu. `side` is which half of the block was
   * clicked (the block spans the whole rental, so upper = pickup/start, lower =
   * dropoff/end), driving which date the menu offers to nudge.
   */
  readonly context = output<{
    event: MouseEvent;
    reservation: CarReservationDto;
    side: 'start' | 'end';
  }>();

  onContext(event: MouseEvent): void {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const side = event.clientY < rect.top + rect.height / 2 ? 'start' : 'end';
    this.context.emit({ event, reservation: this.reservation(), side });
  }
}
