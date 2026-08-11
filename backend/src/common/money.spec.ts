import {
  amountDueCents,
  centsToDecimalString,
  lineTotalCents,
  MoneyParseError,
  sumCents,
  toCents,
} from '@orders/shared';

/**
 * Money conversion is the foundation everything else sits on: if an amount is a cent out, the
 * status derivation built on top of it is wrong in a way no other test would catch.
 */
describe('money', () => {
  describe('toCents', () => {
    it.each([
      ['0', 0],
      ['1', 100],
      ['500.00', 50_000],
      ['1000.5', 100_050],
      ['0.01', 1],
      ['0.1', 10],
      ['-25.50', -2550],
      [500, 50_000],
      [0.01, 1],
    ])('converts %p to %p cents', (input, expected) => {
      expect(toCents(input)).toBe(expected);
    });

    /**
     * The reason this parses the string form instead of multiplying. Each of these amounts
     * lands a fraction off when multiplied as a float, which is why the naive implementation
     * needs a rounding step — and why anything built on the naive version is one unlucky
     * value away from a cent-level discrepancy.
     */
    it.each([
      ['0.07', 7],
      ['0.29', 29],
      ['0.57', 57],
      ['1.10', 110],
      ['1.12', 112],
    ])('converts %s to %i exactly, where float multiplication does not', (input, expected) => {
      expect(toCents(input)).toBe(expected);
      expect(Number(input) * 100).not.toBe(expected);
    });

    it.each(['', 'abc', '1.234', '1,000', '1e5', ' ', '--5'])('rejects %p', (input) => {
      expect(() => toCents(input)).toThrow(MoneyParseError);
    });

    it('rejects more than two decimal places rather than rounding silently', () => {
      expect(() => toCents('10.999')).toThrow(/2 decimal places/);
    });
  });

  describe('centsToDecimalString', () => {
    it.each([
      [0, '0.00'],
      [1, '0.01'],
      [50_000, '500.00'],
      [100_050, '1000.50'],
      [-2550, '-25.50'],
    ])('formats %p cents as %p', (cents, expected) => {
      expect(centsToDecimalString(cents)).toBe(expected);
    });

    it('round-trips through toCents', () => {
      for (const cents of [0, 1, 99, 100, 123_456, 999_999_99]) {
        expect(toCents(centsToDecimalString(cents))).toBe(cents);
      }
    });
  });

  describe('line and order arithmetic', () => {
    it('computes a line total as an exact integer', () => {
      expect(lineTotalCents(2, 50_000)).toBe(100_000);
      expect(lineTotalCents(3, 3_333)).toBe(9_999);
    });

    it('sums the brief\'s sample order to $1,000', () => {
      expect(sumCents([lineTotalCents(2, toCents('500.00'))])).toBe(100_000);
    });

    it('floors amount due at zero rather than reporting a negative balance', () => {
      expect(amountDueCents(100_000, 40_000)).toBe(60_000);
      expect(amountDueCents(100_000, 100_000)).toBe(0);
      expect(amountDueCents(100_000, 150_000)).toBe(0);
    });
  });
});
