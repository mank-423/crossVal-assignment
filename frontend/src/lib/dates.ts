/**
 * `YYYY-MM-DD` offset from today, in the browser's own calendar.
 *
 * Built from the local date parts rather than `toISOString().slice(0, 10)`, which converts to
 * UTC first — so anywhere ahead of UTC in the evening, "today" would already be tomorrow.
 */
export function isoDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}
