import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';

/**
 * A Material datepicker that reads and writes a calendar date as a
 * "YYYY-MM-DD" string (the format we persist). Conversion uses local date
 * components on both sides, so there is no UTC/timezone drift.
 */
@Component({
  selector: 'app-date-field',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
  ],
  template: `
    <mat-form-field class="full-width">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [matDatepicker]="picker"
        [ngModel]="dateValue()"
        (ngModelChange)="onDate($event)"
        [required]="required()"
        [min]="minDate()"
        [max]="maxDate()"
        readonly
        (click)="picker.open()"
      />
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-datepicker #picker />
    </mat-form-field>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: 1;
      }
    `,
  ],
})
export class DateField {
  readonly label = input('Date');
  readonly required = input(false);
  /** Optional inclusive bounds as "YYYY-MM-DD"; disable earlier/later days. */
  readonly min = input<string>('');
  readonly max = input<string>('');
  /** Two-way bound calendar date as "YYYY-MM-DD". */
  readonly value = model<string>('');

  /** The string value as a local-midnight Date for the picker. */
  readonly dateValue = computed<Date | null>(() => this.parse(this.value()));
  readonly minDate = computed<Date | null>(() => this.parse(this.min()));
  readonly maxDate = computed<Date | null>(() => this.parse(this.max()));

  /** Parse a "YYYY-MM-DD" string into a local-midnight Date, or null. */
  private parse(v: string): Date | null {
    if (!v) return null;
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  onDate(date: Date | null): void {
    if (!date) {
      this.value.set('');
      return;
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    this.value.set(`${y}-${m}-${d}`);
  }
}
