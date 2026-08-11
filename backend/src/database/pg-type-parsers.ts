import { types } from 'pg';

/**
 * Two of node-postgres' default type conversions are wrong for this application, and both
 * fail quietly. They are corrected once, at import time, before any pool is created.
 */

/** `bigint` — OID 20. */
const PG_INT8 = 20;
/** `date` — OID 1082. */
const PG_DATE = 1082;

let applied = false;

export function applyPgTypeParsers(): void {
  if (applied) return;

  /*
   * BIGINT arrives as a string, because a Postgres bigint can exceed Number.MAX_SAFE_INTEGER.
   * That is prudent in general and unhelpful here: every bigint in this schema is either a
   * surrogate id or an amount in cents, and leaving them as strings means `total - paid`
   * silently concatenates instead of subtracting.
   *
   * Amounts are capped at MAX_AMOUNT_CENTS (about 1e13) by validation, well inside the safe
   * integer range, so converting to number is sound. Ids are converted at the API boundary.
   */
  types.setTypeParser(PG_INT8, (value: string) => Number.parseInt(value, 10));

  /*
   * DATE arrives as a JavaScript Date at local midnight. A due date is a calendar day, not an
   * instant: constructing `2026-08-17T00:00:00+05:30` and later reading it in UTC yields
   * 2026-08-16, so an order silently becomes overdue a day early for anyone east of London.
   *
   * Keeping the raw `YYYY-MM-DD` string means the value that comes out is the value that went
   * in, and string comparison on ISO dates is the same as chronological comparison.
   */
  types.setTypeParser(PG_DATE, (value: string) => value);

  applied = true;
}
