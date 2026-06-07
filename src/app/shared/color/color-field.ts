import { Component, computed, input, model } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { COLOR_PALETTE } from './color';

/**
 * Colour picker for an entity. Offers a "Default" chip (clears the explicit
 * colour, falling back to the entity-type default), a quick-pick palette, and a
 * native colour input for a fully custom colour.
 *
 * `value` is the explicit hex colour or `undefined` when using the default.
 */
@Component({
  selector: 'app-color-field',
  imports: [MatIconModule],
  template: `
    <div class="color-field">
      <span class="label">{{ label() }}</span>
      <div class="swatches">
        <button
          type="button"
          class="swatch default"
          [class.selected]="value() == null"
          [style.--c]="defaultColor()"
          (click)="select(undefined)"
          title="Default colour"
        >
          @if (value() == null) {
            <mat-icon>check</mat-icon>
          } @else {
            <mat-icon>auto_awesome</mat-icon>
          }
        </button>

        @for (c of palette; track c.value) {
          <button
            type="button"
            class="swatch"
            [class.selected]="value() === c.value"
            [style.--c]="c.value"
            (click)="select(c.value)"
            [title]="c.name"
          >
            @if (value() === c.value) {
              <mat-icon>check</mat-icon>
            }
          </button>
        }

        <label
          class="swatch custom"
          [class.selected]="isCustom()"
          [style.--c]="customColor()"
          title="Custom colour"
        >
          <mat-icon>colorize</mat-icon>
          <input
            type="color"
            [value]="customColor()"
            (input)="select($any($event.target).value)"
          />
        </label>
      </div>
    </div>
  `,
  styleUrl: './color-field.scss',
})
export class ColorField {
  /** Explicit hex colour, or undefined to use the default. */
  readonly value = model<string | undefined>(undefined);
  /** The colour shown on the "Default" chip (the entity-type default). */
  readonly defaultColor = input<string>('#888888');
  readonly label = input<string>('Colour');

  readonly palette = COLOR_PALETTE;

  /** True when an explicit colour is set that isn't one of the quick picks. */
  readonly isCustom = computed(() => {
    const v = this.value();
    return !!v && !this.palette.some((c) => c.value === v);
  });

  readonly customColor = computed(() =>
    this.isCustom() ? this.value()! : '#000000',
  );

  select(color: string | undefined): void {
    this.value.set(color);
  }
}
