import { Component, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { ZonedTime } from '../../models/trip.model';
import { TimezoneSelect } from '../timezone-select/timezone-select';

/**
 * Edits a {@link ZonedTime}: a native datetime-local input (whose value is
 * exactly the "YYYY-MM-DDTHH:mm" wall-clock string we store) paired with an
 * IANA zone picker. The zone defaults from the parent but stays editable so a
 * flight can depart in the home zone and arrive in the destination zone.
 */
@Component({
  selector: 'app-zoned-time-field',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, TimezoneSelect],
  template: `
    <div class="zoned-field" [class.stacked]="stack()">
      <mat-form-field class="dt">
        <mat-label>{{ label() }}</mat-label>
        <input
          matInput
          type="datetime-local"
          [ngModel]="value().dateTime"
          (ngModelChange)="setDateTime($event)"
          [disabled]="disabled()"
        />
      </mat-form-field>
      <app-timezone-select
        class="zone"
        label="Zone"
        [value]="value().zone"
        (valueChange)="setZone($event)"
        [disabled]="disabled()"
      />
    </div>
  `,
  styles: [
    `
      .zoned-field {
        display: flex;
        gap: 0.75rem;
      }
      .dt {
        flex: 1.4;
      }
      .zone {
        flex: 1;
      }
      .zoned-field.stacked {
        flex-direction: column;
        gap: 0;
      }
      @media (max-width: 520px) {
        .zoned-field {
          flex-direction: column;
          gap: 0;
        }
      }
    `,
  ],
})
export class ZonedTimeField {
  readonly label = input('Time');
  /** Stack the datetime input above the zone picker (for narrow columns). */
  readonly stack = input(false);
  readonly disabled = input(false);
  readonly value = model.required<ZonedTime>();

  setDateTime(dateTime: string): void {
    this.value.set({ ...this.value(), dateTime });
  }

  setZone(zone: string): void {
    this.value.set({ ...this.value(), zone });
  }
}
