import { deriveOrderStatus, isOrderOverdue } from '@orders/shared';

const TODAY = '2026-08-10';
const FUTURE = '2026-08-17';
const PAST = '2026-08-03';

const TOTAL = 100_000; // $1,000.00

function status(amountPaidCents: number, dueDate: string) {
  return deriveOrderStatus({ totalCents: TOTAL, amountPaidCents, dueDate, asOf: TODAY });
}

/**
 * These assertions mirror `database/sql` migration 002's CASE expression. The e2e suite
 * checks that the database agrees; this suite pins the rule itself.
 */
describe('order status derivation', () => {
  it('is pending when nothing has been paid and the due date is ahead', () => {
    expect(status(0, FUTURE)).toBe('pending');
  });

  it('is partially_paid when some but not all has been paid', () => {
    expect(status(1, FUTURE)).toBe('partially_paid');
    expect(status(40_000, FUTURE)).toBe('partially_paid');
    expect(status(TOTAL - 1, FUTURE)).toBe('partially_paid');
  });

  it('is paid when the payments equal the total', () => {
    expect(status(TOTAL, FUTURE)).toBe('paid');
  });

  it('is overdue when past the due date with nothing paid', () => {
    expect(status(0, PAST)).toBe('overdue');
  });

  it('treats the due date itself as still in time', () => {
    // Payment is due *on* that day, so it is not late until the day after.
    expect(status(0, TODAY)).toBe('pending');
  });

  describe('edge cases the brief asks to be documented', () => {
    /**
     * The named case: an order that was overdue and has since been settled. `paid` is checked
     * before `overdue`, so it stops being chased instead of carrying the flag forever.
     */
    it('reports paid, not overdue, once a late order is settled in full', () => {
      expect(status(TOTAL, PAST)).toBe('paid');
      expect(isOrderOverdue({ totalCents: TOTAL, amountPaidCents: TOTAL, dueDate: PAST, asOf: TODAY })).toBe(
        false,
      );
    });

    /**
     * An order can be both partially paid and past due. A single enum cannot say so, so
     * `overdue` wins — it is the fact that needs acting on — and `isOverdue` carries the
     * other half for the UI.
     */
    it('reports overdue for a part-paid order past its due date, and flags it separately', () => {
      expect(status(40_000, PAST)).toBe('overdue');
      expect(
        isOrderOverdue({ totalCents: TOTAL, amountPaidCents: 40_000, dueDate: PAST, asOf: TODAY }),
      ).toBe(true);
    });

    /**
     * Overpayment is impossible through the API and blocked by a database constraint, but the
     * derivation should still behave sanely if it ever saw such a row.
     */
    it('treats an over-paid total as paid rather than falling through', () => {
      expect(status(TOTAL + 1, FUTURE)).toBe('paid');
      expect(status(TOTAL + 1, PAST)).toBe('paid');
    });
  });
});
