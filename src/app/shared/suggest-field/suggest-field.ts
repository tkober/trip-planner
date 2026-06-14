import { Component, computed, input, model, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';

/**
 * Free-text field with autocomplete suggestions: the user can pick one of the
 * provided `options` or type a custom value. Binds to a string via two-way
 * `value`. Used for the configurable train / bus "kind" fields.
 */
@Component({
  selector: 'app-suggest-field',
  imports: [MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  template: `
    <mat-form-field class="full-width">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        [value]="value()"
        (input)="onInput($event)"
        [matAutocomplete]="auto"
        autocomplete="off"
      />
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onSelected($event)">
        @for (option of filtered(); track option) {
          <mat-option [value]="option">{{ option }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
})
export class SuggestField {
  readonly label = input('');
  readonly value = model<string>('');
  readonly options = input<readonly string[]>([]);

  private readonly query = signal('');

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return this.options();
    return this.options().filter((o) => o.toLowerCase().includes(q));
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
