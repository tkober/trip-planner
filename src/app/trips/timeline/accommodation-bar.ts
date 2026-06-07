import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AccommodationDto } from '../../models/trip.model';
import { AccommodationSegment } from './day-section';

/**
 * A marker on the day rail for an accommodation stay. The segment governs the
 * vertical placement: a check-in fills the lower half of the day, a check-out
 * the upper half, so a hotel switch shows two bars stacked on one day.
 */
@Component({
  selector: 'app-accommodation-bar',
  imports: [MatIconModule, MatButtonModule, MatMenuModule],
  template: `
    <div class="accom-bar" [attr.data-segment]="segment().segment">
      <div
        class="bar-content"
        (click)="open.emit(segment().accommodation)"
        role="button"
        tabindex="0"
      >
        <mat-icon class="hotel-icon">hotel</mat-icon>
        <span class="name">{{ segment().accommodation.name }}</span>
        @if (segment().segment === 'checkin') {
          <span class="tag">check-in</span>
        } @else if (segment().segment === 'checkout') {
          <span class="tag">check-out</span>
        }
      </div>
      <button
        matIconButton
        class="bar-menu"
        [matMenuTriggerFor]="menu"
        (click)="$event.stopPropagation()"
        aria-label="Accommodation actions"
      >
        <mat-icon>more_vert</mat-icon>
      </button>
      <mat-menu #menu="matMenu">
        <button mat-menu-item (click)="open.emit(segment().accommodation)">
          <mat-icon>info</mat-icon><span>Details</span>
        </button>
        <button mat-menu-item (click)="edit.emit(segment().accommodation)">
          <mat-icon>edit</mat-icon><span>Edit</span>
        </button>
        <button mat-menu-item (click)="delete.emit(segment().accommodation)">
          <mat-icon>delete</mat-icon><span>Delete</span>
        </button>
      </mat-menu>
    </div>
  `,
  styleUrl: './accommodation-bar.scss',
})
export class AccommodationBar {
  readonly segment = input.required<AccommodationSegment>();
  readonly open = output<AccommodationDto>();
  readonly edit = output<AccommodationDto>();
  readonly delete = output<AccommodationDto>();
}
