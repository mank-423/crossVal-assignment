/**
 * Order status rules.
 *
 * The API derives status in SQL so that filtering and pagination happen in the database
 * (see `apps/api/src/database/sql/orders/status_case.sql`). This module is the same rule
 * expressed in TypeScript: it backs the unit tests and lets the web client label an order
 * without a round trip. The two must agree — the test suite asserts it.
 */

export const ORDER_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

export interface StatusInput {
  totalCents: number;
  amountPaidCents: number;
  /** Calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  /** Calendar date to evaluate against, `YYYY-MM-DD`. Defaults to today. */
  asOf?: string;
}

/**
 * Precedence is `paid` > `overdue` > `partially_paid` > `pending`.
 *
 * `paid` is checked first so an order that was overdue and has since been settled reads as
 * `paid` rather than staying flagged forever — the edge case the brief calls out.
 *
 * `overdue` outranks `partially_paid` because a past-due order needs attention regardless of
 * how much has been collected. That collapses two orthogonal facts into one field, so the API
 * also returns `isOverdue` separately and the UI renders "Partially paid · overdue".
 */
export function deriveOrderStatus(input: StatusInput): OrderStatus {
  const { totalCents, amountPaidCents, dueDate } = input;
  const asOf = input.asOf ?? todayIsoDate();

  if (amountPaidCents >= totalCents) return 'paid';
  if (dueDate < asOf) return 'overdue';
  if (amountPaidCents > 0) return 'partially_paid';
  return 'pending';
}

/** True when the order is past its due date and not yet settled. */
export function isOrderOverdue(input: StatusInput): boolean {
  const { totalCents, amountPaidCents, dueDate } = input;
  const asOf = input.asOf ?? todayIsoDate();
  return amountPaidCents < totalCents && dueDate < asOf;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Today in the server's local calendar, as `YYYY-MM-DD`. */
export function todayIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
