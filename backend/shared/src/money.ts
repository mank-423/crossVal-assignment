/**
 * Money handling for the whole system.
 *
 * Every monetary value is stored, transported, and compared as an integer number of cents.
 * Floating point never touches a currency amount: `0.1 + 0.2 !== 0.3` is not a rounding
 * curiosity when it decides whether an order is fully paid, it is a bug that lets a customer
 * underpay by a cent and still read as `paid`.
 */

export const CENTS_PER_UNIT = 100;

/** Largest amount accepted from a client: keeps cent arithmetic inside a safe integer. */
export const MAX_AMOUNT_CENTS = 9_999_999_999_99;

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyParseError';
  }
}

/**
 * Convert a decimal amount ("1000.50", 1000.5) to integer cents.
 *
 * Parsed from the string form rather than by multiplying, because `19.99 * 100` is
 * `1998.9999999999998` and rounding that hides the problem instead of preventing it.
 */
export function toCents(amount: number | string): number {
  const raw = typeof amount === 'number' ? formatNumberForParse(amount) : amount.trim();

  if (raw === '' || !DECIMAL_PATTERN.test(raw)) {
    throw new MoneyParseError(`"${raw}" is not a valid money amount. Expected a number like 1000.50.`);
  }

  const isNegative = raw.startsWith('-');
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.');

  if (fraction.length > 2) {
    throw new MoneyParseError(
      `"${raw}" has more than 2 decimal places. Amounts are tracked to the cent.`,
    );
  }

  const cents = Number(whole) * CENTS_PER_UNIT + Number(fraction.padEnd(2, '0'));
  return isNegative ? -cents : cents;
}

/** Convert integer cents back to a decimal number. Use only at display boundaries. */
export function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

/** Convert integer cents to a fixed 2-decimal string, safe for API payloads. */
export function centsToDecimalString(cents: number): string {
  const isNegative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const whole = Math.floor(absolute / CENTS_PER_UNIT);
  const fraction = (absolute % CENTS_PER_UNIT).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole}.${fraction}`;
}

/** Human-facing currency string, e.g. `$1,000.50`. */
export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(fromCents(cents));
}

/** Total for one line: quantity is a whole count, so this stays exact in integers. */
export function lineTotalCents(quantity: number, unitPriceCents: number): number {
  return quantity * unitPriceCents;
}

/** Sum of integer cent values. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Remaining balance on an order, floored at zero. */
export function amountDueCents(totalCents: number, amountPaidCents: number): number {
  return Math.max(0, totalCents - amountPaidCents);
}

/**
 * `Number.prototype.toString` uses exponential notation for very large or very small
 * magnitudes, which the decimal pattern would reject. Normalise those to plain decimal.
 */
function formatNumberForParse(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new MoneyParseError(`${amount} is not a valid money amount.`);
  }
  return amount.toFixed(Math.min(20, Math.max(0, decimalPlaces(amount))));
}

function decimalPlaces(amount: number): number {
  const text = amount.toString();
  if (!text.includes('.')) return 0;
  if (text.includes('e') || text.includes('E')) return 2;
  return text.split('.')[1]?.length ?? 0;
}
