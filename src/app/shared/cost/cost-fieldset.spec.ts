import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CostFieldset } from './cost-fieldset';

/**
 * Regression coverage for the amount fields: they are `type="number"`, whose
 * value accessor emits `number | null` — the setters must accept that (an earlier
 * version assumed a string and threw on `.replace`, so cost never got saved).
 */
describe('CostFieldset', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CostFieldset],
      providers: [provideNativeDateAdapter(), provideNoopAnimations()],
    });
  });

  /** Create + seed the component without rendering the Material template. */
  function make(initial: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(CostFieldset);
    fixture.componentRef.setInput('value', initial);
    const c = fixture.componentInstance;
    c.ngOnInit();
    // Cast to any: the field setters are `protected`.
    return { fixture, c: c as any };
  }

  it('emits numeric amounts from the number inputs and normalizes currency', () => {
    const { fixture, c } = make();
    c.setTotalPrice(4711); // number, as a type=number value accessor emits
    c.setAlreadyPaid(true);
    c.setCurrency('jpy');
    expect(fixture.componentInstance.value()).toEqual({
      totalPrice: 4711,
      currency: 'JPY',
      alreadyPaid: true,
      cancellationCost: undefined,
      paymentDate: undefined,
      freeCancellationUntil: undefined,
    });
  });

  it('treats an empty (null) amount as undefined', () => {
    const { fixture, c } = make({ totalPrice: 100, currency: 'EUR' });
    c.setTotalPrice(null);
    expect(fixture.componentInstance.value().totalPrice).toBeUndefined();
  });

  it('seeds local state from the bound value so untouched fields survive a re-emit', () => {
    const { fixture, c } = make({
      totalPrice: 200,
      alreadyPaid: true,
      currency: 'USD',
    });
    c.setPaymentDate('2026-03-01');
    expect(fixture.componentInstance.value()).toEqual({
      totalPrice: 200,
      currency: 'USD',
      alreadyPaid: true,
      cancellationCost: undefined,
      paymentDate: '2026-03-01',
      freeCancellationUntil: undefined,
    });
  });
});
