import {
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { TimeZoneService } from '../../services/time-zone.service';

/**
 * IANA time-zone picker with autocomplete filtering over the runtime's
 * supported zones. Binds to a string zone id via two-way `value`.
 */
@Component({
  selector: 'app-timezone-select',
  imports: [MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
    <mat-form-field class="full-width">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [value]="value()"
        (input)="onInput($event)"
        [matAutocomplete]="auto"
        [disabled]="disabled()"
        placeholder="e.g. Asia/Tokyo"
        autocomplete="off"
      />
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onSelected($event)">
        @for (zone of filtered(); track zone) {
          <mat-option [value]="zone">{{ zone }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
})
export class TimezoneSelect {
  private readonly tz = inject(TimeZoneService);

  readonly label = input('Time zone');
  readonly disabled = input(false);
  readonly value = model<string>('');

  private readonly query = signal('');
  private readonly allZones = this.tz.supportedZones();

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    const source = q
      ? this.allZones.filter((z) => z.toLowerCase().includes(q))
      : this.allZones;
    return source.slice(0, 50);
  });

  onInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.query.set(v);
    this.value.set(v);
  }

  onSelected(event: MatAutocompleteSelectedEvent): void {
    this.value.set(event.option.value);
  }
}
