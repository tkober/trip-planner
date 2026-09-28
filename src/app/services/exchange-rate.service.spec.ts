import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ExchangeRateService, FRANKFURTER_URL } from './exchange-rate.service';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExchangeRateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('inverts units-per-EUR into EUR-per-unit', async () => {
    const promise = service.fetchEurRates(['JPY', 'USD']);
    const req = httpMock.expectOne(
      `${FRANKFURTER_URL}?base=EUR&symbols=JPY,USD`,
    );
    req.flush({
      amount: 1,
      base: 'EUR',
      date: '2026-09-25',
      rates: { JPY: 179.7, USD: 1.1403 },
    });
    expect(await promise).toEqual({
      JPY: 1 / 179.7,
      USD: 1 / 1.1403,
    });
  });

  it('drops EUR from the requested symbols and dedupes', async () => {
    const promise = service.fetchEurRates(['eur', 'jpy', 'JPY']);
    const req = httpMock.expectOne(`${FRANKFURTER_URL}?base=EUR&symbols=JPY`);
    req.flush({ amount: 1, base: 'EUR', date: '2026-09-25', rates: { JPY: 179.7 } });
    await promise;
  });

  it('makes no request for an empty (or EUR-only) list', async () => {
    expect(await service.fetchEurRates([])).toEqual({});
    expect(await service.fetchEurRates(['EUR'])).toEqual({});
    httpMock.expectNone(() => true);
  });

  it('omits a currency the ECB does not return', async () => {
    const promise = service.fetchEurRates(['JPY', 'XYZ']);
    const req = httpMock.expectOne(
      `${FRANKFURTER_URL}?base=EUR&symbols=JPY,XYZ`,
    );
    // The ECB simply omits currencies it doesn't publish.
    req.flush({ amount: 1, base: 'EUR', date: '2026-09-25', rates: { JPY: 179.7 } });
    expect(await promise).toEqual({ JPY: 1 / 179.7 });
  });

  it('skips a non-positive or non-finite rate', async () => {
    const promise = service.fetchEurRates(['JPY', 'USD']);
    const req = httpMock.expectOne(
      `${FRANKFURTER_URL}?base=EUR&symbols=JPY,USD`,
    );
    req.flush({
      amount: 1,
      base: 'EUR',
      date: '2026-09-25',
      rates: { JPY: 0, USD: 1.1403 },
    });
    expect(await promise).toEqual({ USD: 1 / 1.1403 });
  });

  it('propagates HTTP errors', async () => {
    const promise = service.fetchEurRates(['JPY']);
    const req = httpMock.expectOne(`${FRANKFURTER_URL}?base=EUR&symbols=JPY`);
    req.flush('not found', { status: 404, statusText: 'Not Found' });
    await expect(promise).rejects.toBeTruthy();
  });
});
