import { todayIsoDate, type OrderStatus } from '../shared';

/**
 * `YYYY-MM-DD` rendered for a human.
 *
 * Parsed with an explicit UTC time and formatted in UTC. Passing the bare date string to
 * `new Date()` gives midnight UTC, which `toLocaleDateString` then renders in local time —
 * so anywhere behind UTC, a due date of the 17th displays as the 16th.
 */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Timestamps are instants, so these are shown in the reader's own timezone. */
export function formatDateTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Whole days between two calendar dates, ignoring clock time entirely. */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const from = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * "Due in 7 days" / "9 days overdue" — the phrasing a person actually wants beside a date.
 * A settled order says nothing, because how late it was is no longer actionable.
 */
export function relativeDueLabel(dueDate: string, status: OrderStatus): string {
  if (status === 'paid') return 'Settled';

  const days = daysBetween(todayIsoDate(), dueDate);

  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}
