import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AccommodationDto } from '../../models/trip.model';

/** One half (morning or night) of a day's hotel cell. */
export interface HotelHalf {
  accommodation: AccommodationDto;
  /** Round the outer corner — true at the start/end of a stay run. */
  rounded: boolean;
  /** This half begins a stay (check-in) → show the hotel name here. */
  isStart: boolean;
  /** Stable colour index so different hotels are visually distinct. */
  colorIndex: number;
}

/** One day's hotel cell: morning (top) and night (bottom) halves. */
export interface HotelDayCell {
  /** 1-based grid row line for the day. */
  rowIndex: number;
  top?: HotelHalf;
  bottom?: HotelHalf;
}

/**
 * A single day's accommodation cell in the hotel lane. The top half is the
 * hotel you wake up in, the bottom half the hotel you sleep in. When both are
 * the same the cell reads as one solid block; when they differ (a hotel switch)
 * the day splits cleanly down the middle — no overlap, always one lane.
 */
@Component({
  selector: 'app-hotel-cell',
  imports: [MatIconModule],
  host: {
    '[style.grid-row]': 'rowIndex()',
    '[style.grid-column]': "'2 / 3'",
  },
  template: `
    <div class="hotel-cell">
      <div
        class="half top"
        [class.filled]="!!top()"
        [class.round-bottom]="top()?.rounded"
        [attr.data-color]="top()?.colorIndex ?? null"
        (click)="openHalf(top())"
      ></div>
      <div
        class="half bottom"
        [class.filled]="!!bottom()"
        [class.round-top]="bottom()?.rounded"
        [attr.data-color]="bottom()?.colorIndex ?? null"
        (click)="openHalf(bottom())"
      >
        @if (bottom()?.isStart) {
          <mat-icon class="start-icon">hotel</mat-icon>
        }
      </div>
    </div>
  `,
  styleUrl: './hotel-cell.scss',
})
export class HotelCell {
  /** 1-based grid row line for this day. */
  readonly rowIndex = input.required<number>();
  readonly top = input<HotelHalf | undefined>();
  readonly bottom = input<HotelHalf | undefined>();
  readonly open = output<AccommodationDto>();

  openHalf(half: HotelHalf | undefined): void {
    if (half) this.open.emit(half.accommodation);
  }
}
