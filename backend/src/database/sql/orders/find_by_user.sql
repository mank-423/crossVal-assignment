-- Dashboard list: one page of a user's orders, filtered and sorted in the database.
--
-- `count(*) OVER ()` returns the size of the filtered set alongside the page. Window
-- functions are evaluated before LIMIT, so this is the full total, and pagination costs one
-- round trip instead of a second COUNT query against the same predicate.
--
-- Optional filters use the `$n IS NULL OR ...` form so one prepared statement serves every
-- combination rather than the repository concatenating fragments.
--
-- Tradeoff worth naming: sorting through CASE expressions cannot use an index for ordering,
-- so at very large scale this becomes a sort of the filtered set. It is kept this way so the
-- whole query lives in one file with no interpolation; the alternative is a whitelisted
-- ORDER BY fragment chosen in the repository, or one file per sort key.
--
-- $1 user_id
-- $2 status filter, NULL for all
-- $3 customer search, NULL for all
-- $4 limit
-- $5 offset
-- $6 sort key: due_date | created_at | total | amount_due
-- $7 direction: asc | desc
SELECT
    s.id,
    s.customer_name,
    s.due_date,
    s.subtotal_cents,
    s.total_cents,
    s.amount_paid_cents,
    s.amount_due_cents,
    s.status,
    s.is_overdue,
    s.is_locked,
    s.line_item_count,
    s.version,
    s.created_at,
    s.updated_at,
    count(*) OVER () AS total_count
FROM order_summaries s
WHERE s.user_id = $1
  AND ($2::text IS NULL OR s.status = $2::text)
  AND ($3::text IS NULL OR s.customer_name ILIKE '%' || $3::text || '%')
ORDER BY
    CASE WHEN $6::text = 'due_date'   AND $7::text = 'asc'  THEN s.due_date         END ASC  NULLS LAST,
    CASE WHEN $6::text = 'due_date'   AND $7::text = 'desc' THEN s.due_date         END DESC NULLS LAST,
    CASE WHEN $6::text = 'created_at' AND $7::text = 'asc'  THEN s.created_at       END ASC  NULLS LAST,
    CASE WHEN $6::text = 'created_at' AND $7::text = 'desc' THEN s.created_at       END DESC NULLS LAST,
    CASE WHEN $6::text = 'total'      AND $7::text = 'asc'  THEN s.total_cents      END ASC  NULLS LAST,
    CASE WHEN $6::text = 'total'      AND $7::text = 'desc' THEN s.total_cents      END DESC NULLS LAST,
    CASE WHEN $6::text = 'amount_due' AND $7::text = 'asc'  THEN s.amount_due_cents END ASC  NULLS LAST,
    CASE WHEN $6::text = 'amount_due' AND $7::text = 'desc' THEN s.amount_due_cents END DESC NULLS LAST,
    -- Stable tiebreaker: without it, equal sort keys can shuffle between pages and a row is
    -- silently skipped or repeated.
    s.id DESC
LIMIT $4
OFFSET $5;
