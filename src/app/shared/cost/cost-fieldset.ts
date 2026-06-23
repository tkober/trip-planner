import { Component, input, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CostInfo } from '../../models/trip.model';
import { DateField } from '../date-field/date-field';
import { SuggestField } from '../suggest-field/suggest-field';

/**
 * Reusable cost / payment form section shared by every entity dialog
 * (accommodation, car reservation, activity, transport), since they all carry
 * the same {@link CostInfo} fields. Holds the inputs as local signals (seeded
 * from the bound value in ngOnInit, since inputs aren't applied at
 * field-initializer time) and emits a normalized `CostInfo` via the two-way
 * `value` model on every change. The amount fields are `type="number"`, so their
 * value accessor already yields `number | null`.
 */
@Component({
  selector: 'app-cost-fieldset',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    DateField,
    SuggestField,
  ],
  templateUrl: './cost-fieldset.html',
  styles: [
    `
      :host {
        display: block;
      }
      .section-label {
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant);
        margin: 0.5rem 0 0.25rem;
      }
      .paid-toggle {
        display: block;
        margin: 0.25rem 0 0.5rem;
      }
      .row {
        display: flex;
        gap: 1rem;

        mat-form-field,
        app-date-field {
          flex: 1;
        }

        @media (max-width: 520px) {
          flex-direction: column;
          gap: 0;
        }
      }
    `,
  ],
})
export class CostFieldset implements OnInit {
  /** Currency codes offered in the picker; free typing is still allowed. */
  readonly options = input<readonly string[]>([]);
  /** Heading shown above the section. */
  readonly label = input('Cost (optional)');
  /** Two-way bound cost info. */
  readonly value = model<CostInfo>({});

  protected readonly totalPrice = signal<number | null>(null);
  protected readonly currency = signal('');
  protected readonly alreadyPaid = signal(false);
  protected readonly cancellationCost = signal<number | null>(null);
  protected readonly paymentDate = signal('');
  protected readonly freeCancellationUntil = signal('');

  ngOnInit(): void {
    const v = this.value();
    this.totalPrice.set(v.totalPrice ?? null);
    this.currency.set(v.currency ?? '');
    this.alreadyPaid.set(!!v.alreadyPaid);
    this.cancellationCost.set(v.cancellationCost ?? null);
    this.paymentDate.set(v.paymentDate ?? '');
    this.freeCancellationUntil.set(v.freeCancellationUntil ?? '');
  }

  setTotalPrice(v: number | null): void {
    this.totalPrice.set(v);
    this.emit();
  }
  setCurrency(v: string): void {
    this.currency.set(v);
    this.emit();
  }
  setAlreadyPaid(v: boolean): void {
    this.alreadyPaid.set(v);
    this.emit();
  }
  setCancellationCost(v: number | null): void {
    this.cancellationCost.set(v);
    this.emit();
  }
  setPaymentDate(v: string): void {
    this.paymentDate.set(v);
    this.emit();
  }
  setFreeCancellationUntil(v: string): void {
    this.freeCancellationUntil.set(v);
    this.emit();
  }

  private emit(): void {
    this.value.set({
      totalPrice: this.amount(this.totalPrice()),
      currency: this.currency().trim().toUpperCase() || undefined,
      alreadyPaid: this.alreadyPaid() || undefined,
      cancellationCost: this.amount(this.cancellationCost()),
      paymentDate: this.paymentDate() || undefined,
      freeCancellationUntil: this.freeCancellationUntil() || undefined,
    });
  }

  /** Coerce a number-input value to a finite number, or undefined. */
  private amount(n: number | null): number | undefined {
    return n != null && Number.isFinite(n) ? n : undefined;
  }
}
