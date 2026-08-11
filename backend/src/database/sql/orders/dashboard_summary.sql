-- Dashboard headline figures, aggregated in the database.
--
-- Returns at most four rows (one per status). The service adds them up into the overall
-- totals rather than issuing a second query, so the whole dashboard header costs one trip.
--
-- This is the query the denormalised orders.amount_paid_cents exists for: without it, every
-- row here would need a correlated SUM over payments, and the dashboard would get slower
-- every time anyone recorded a payment.
--
-- $1 user_id
SELECT
    s.status,
    count(*)::bigint                             AS order_count,
    COALESCE(SUM(s.total_cents), 0)::bigint      AS total_cents,
    COALESCE(SUM(s.amount_paid_cents), 0)::bigint AS amount_paid_cents,
    COALESCE(SUM(s.amount_due_cents), 0)::bigint  AS amount_due_cents
FROM order_summaries s
WHERE s.user_id = $1
GROUP BY s.status;
