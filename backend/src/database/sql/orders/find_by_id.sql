-- Fetch one order for its detail page.
--
-- user_id is part of the predicate, not an afterthought check in the service. A request for
-- another user's order returns zero rows and the caller gets 404 — the API never confirms
-- that an id it does not own exists.
--
-- $1 order_id, $2 user_id
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
    s.updated_at
FROM order_summaries s
WHERE s.id = $1
  AND s.user_id = $2;
