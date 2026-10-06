import { Component, inject, signal } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { TripDay } from '../../services/time-zone.service';

export interface MoveDayDialogData {
  /** The trip's real days (never virtual departure/return rows). */
  days: TripDay[];
  /** The entry's current destination-tz day, preselected. */
  currentDate: string;
}

/**
 * Small dialog listing the trip's real days ("Day N · Thu, 9 Apr") so an entry
 * can be moved without dragging — the mobile-friendly alternative to drag-drop
 * (see EntryCard / StraddleCard "Move to another day…"). Returns the chosen
 * date, or `undefined` on cancel.
 */
@Component({
  selector: 'app-move-day-dialog',
  imports: [MatDialogModule, MatButtonModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Move to another day</h2>
    <mat-dialog-content>
      <mat-radio-group
        class="day-list"
        [value]="selected()"
        (change)="selected.set($event.value)"
      >
        @for (day of data.days; track day.date) {
          <mat-radio-button [value]="day.date">
            Day {{ day.index }} · {{ day.startOfDay.toFormat('ccc, d LLL') }}
          </mat-radio-button>
        }
      </mat-radio-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button
        matButton="filled"
        color="primary"
        [disabled]="selected() === data.currentDate"
        (click)="dialogRef.close(selected())"
      >
        Move
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .day-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 260px;
        max-height: 60vh;
        overflow-y: auto;
      }
    `,
  ],
})
export class MoveDayDialog {
  readonly data = inject<MoveDayDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(
    MatDialogRef<MoveDayDialog, string | undefined>,
  );

  readonly selected = signal(this.data.currentDate);
}
