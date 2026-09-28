import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Frankfurter (ECB reference rates) — free, no API key, CORS-enabled. Rates
 * come back as units-per-EUR; the trip stores EUR-per-unit, so callers invert.
 */
export const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest';

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Fetches current EUR exchange rates for the Overview "Exchange rates" refresh
 * button. Pure HTTP wrapper — no store/signal state — so `TripActionsService`
 * can call it and decide how to persist the result.
 */
@Injectable({ providedIn: 'root' })
export class ExchangeRateService {
  private readonly http = inject(HttpClient);

  /**
   * Fetch current EUR-per-unit rates for the given ISO 4217 codes (EUR itself
   * and duplicates are dropped). Returns `{}` without making a request for an
   * empty/EUR-only list. Codes the ECB doesn't publish are simply absent from
   * the result; a non-positive/non-finite rate is skipped too. HTTP errors
   * propagate to the caller.
   */
  async fetchEurRates(codes: string[]): Promise<Record<string, number>> {
    const symbols = [
      ...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)),
    ].filter((c) => c !== 'EUR');
    if (!symbols.length) return {};

    const url = `${FRANKFURTER_URL}?base=EUR&symbols=${symbols.join(',')}`;
    const res = await firstValueFrom(this.http.get<FrankfurterResponse>(url));

    const out: Record<string, number> = {};
    for (const [code, unitsPerEur] of Object.entries(res.rates ?? {})) {
      if (!Number.isFinite(unitsPerEur) || unitsPerEur <= 0) continue;
      out[code] = 1 / unitsPerEur;
    }
    return out;
  }
}
