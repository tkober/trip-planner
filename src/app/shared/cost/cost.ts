/**
 * Pure cost / currency helpers. No Angular DI — usable from components, the
 * Overview cost summary, and the Markdown export alike (mirrors the style of
 * `anonymize.ts` / `trip-markdown.ts`).
 *
 * Every priced entity carries a {@link CostInfo} (amount + currency). Amounts are
 * converted to the base currency (EUR) via the trip's `exchangeRates`, stored as
 * EUR-per-foreign-unit, so conversion is a single multiply. A non-EUR amount with
 * no rate set is reported as "unconverted" rather than guessed.
 */
import { CostInfo, TripDto } from '../../models/trip.model';
import { transportLabel } from '../transport-format';

/** Base currency for the trip total. */
export const BASE_CURRENCY = 'EUR';

/** Normalize a (possibly unset) currency code to upper-case, defaulting to EUR. */
export function normalizeCurrency(currency?: string): string {
  return (currency || BASE_CURRENCY).trim().toUpperCase() || BASE_CURRENCY;
}

/**
 * Format an amount in its own currency via Intl (JPY → 0 decimals, EUR/USD → 2,
 * etc.). Falls back to `"<amount> <CODE>"` for codes Intl doesn't recognize.
 */
export function formatMoney(amount: number, currency?: string): string {
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(amount);
  } catch {
    return `${amount} ${code}`;
  }
}

/** Format an EUR amount (the base currency). */
export function formatEur(amount: number): string {
  return formatMoney(amount, BASE_CURRENCY);
}

/** Extract just the {@link CostInfo} fields from an entity (for dialog seeding). */
export function pickCost(src?: Partial<CostInfo>): CostInfo {
  if (!src) return {};
  const {
    totalPrice,
    currency,
    alreadyPaid,
    paymentDate,
    freeCancellationUntil,
    cancellationCost,
  } = src;
  return {
    totalPrice,
    currency,
    alreadyPaid,
    paymentDate,
    freeCancellationUntil,
    cancellationCost,
  };
}

/**
 * Convert `amount` in `currency` to EUR using `rates` (code → EUR per unit).
 * EUR passes through; a non-EUR amount with no (positive, finite) rate returns
 * `undefined` so callers can flag it as unconverted.
 */
export function toEur(
  amount: number,
  currency: string | undefined,
  rates: Record<string, number>,
): number | undefined {
  const code = normalizeCurrency(currency);
  if (code === BASE_CURRENCY) return amount;
  const rate = rates[code];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return undefined;
  return amount * rate;
}

export type CostCategory = 'accommodation' | 'car' | 'activity' | 'transport';

const CATEGORY_LABELS: Record<CostCategory, string> = {
  accommodation: 'Accommodation',
  car: 'Car rentals',
  activity: 'Activities',
  transport: 'Transport',
};

/** Order categories appear in the Overview breakdown. */
const CATEGORY_ORDER: CostCategory[] = [
  'accommodation',
  'car',
  'activity',
  'transport',
];

/** One priced entity flattened for aggregation / display. */
export interface CostLine {
  category: CostCategory;
  label: string;
  /** Total price in the entity's own currency. */
  amount: number;
  currency: string;
  /** Total converted to EUR, or undefined when the rate is missing. */
  amountEur?: number;
  /** Whether the total has been paid. */
  alreadyPaid?: boolean;
  /** Paid amount in EUR (the full total when paid, else 0; undefined if no rate). */
  paidEur?: number;
}

export interface CategoryTotal {
  category: CostCategory;
  label: string;
  totalEur: number;
  paidEur: number;
  /** A line in this category had a missing rate and is excluded from the totals. */
  hasUnconverted: boolean;
}

export interface TripCostSummary {
  grandTotalEur: number;
  paidEur: number;
  outstandingEur: number;
  /** Non-empty categories only, in display order. */
  byCategory: CategoryTotal[];
  /** Distinct non-EUR currency codes used by any priced entity. */
  currenciesInUse: string[];
  /** Subset of `currenciesInUse` with no exchange rate set. */
  missingRates: string[];
  lines: CostLine[];
}

/** True when an entity carries any cost information worth aggregating. */
function isPriced(c: CostInfo): boolean {
  return c.totalPrice != null || !!c.alreadyPaid;
}

/**
 * Aggregate every priced entity in the trip into a cost summary: grand total,
 * already paid and outstanding (all in EUR), a per-category breakdown, and the
 * set of currencies still needing an exchange rate.
 */
export function tripCostSummary(
  trip: TripDto,
  rates: Record<string, number>,
): TripCostSummary {
  const lines: CostLine[] = [];
  const inUse = new Set<string>();
  const missing = new Set<string>();

  const collect = <T extends CostInfo>(
    items: readonly T[] | undefined,
    category: CostCategory,
    label: (item: T) => string,
  ): void => {
    for (const item of items ?? []) {
      if (!isPriced(item)) continue;
      const currency = normalizeCurrency(item.currency);
      if (currency !== BASE_CURRENCY) inUse.add(currency);

      const amountEur =
        item.totalPrice != null
          ? toEur(item.totalPrice, currency, rates)
          : 0;
      // A paid entity contributes its full total to "paid".
      const paidEur = item.alreadyPaid ? amountEur : 0;
      if (amountEur === undefined && currency !== BASE_CURRENCY) {
        missing.add(currency);
      }

      lines.push({
        category,
        label: label(item),
        amount: item.totalPrice ?? 0,
        currency,
        amountEur,
        alreadyPaid: item.alreadyPaid,
        paidEur,
      });
    }
  };

  collect(trip.accommodations, 'accommodation', (a) => a.name);
  collect(trip.carReservations, 'car', (c) => c.name);
  collect(trip.activities, 'activity', (a) => a.title);
  collect(trip.transport, 'transport', (t) => transportLabel(t));

  const byCategory: CategoryTotal[] = [];
  for (const category of CATEGORY_ORDER) {
    const catLines = lines.filter((l) => l.category === category);
    if (!catLines.length) continue;
    let totalEur = 0;
    let paidEur = 0;
    let hasUnconverted = false;
    for (const l of catLines) {
      if (l.amountEur === undefined) hasUnconverted = true;
      else totalEur += l.amountEur;
      if (l.paidEur === undefined) hasUnconverted = true;
      else paidEur += l.paidEur;
    }
    byCategory.push({
      category,
      label: CATEGORY_LABELS[category],
      totalEur,
      paidEur,
      hasUnconverted,
    });
  }

  const grandTotalEur = byCategory.reduce((s, c) => s + c.totalEur, 0);
  const paidEur = byCategory.reduce((s, c) => s + c.paidEur, 0);

  return {
    grandTotalEur,
    paidEur,
    outstandingEur: grandTotalEur - paidEur,
    byCategory,
    currenciesInUse: [...inUse].sort(),
    missingRates: [...missing].sort(),
    lines,
  };
}
