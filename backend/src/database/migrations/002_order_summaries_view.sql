-- Migration 002 — the derived read model.
--
-- Status is computed here and nowhere else. Every read path selects from this view, so
-- "what does pending mean" has exactly one answer in the system, and `?status=overdue`
-- filters and paginates inside the database instead of loading rows to filter in JavaScript.
--
-- Precedence: paid > overdue > partially_paid > pending.
--   * `paid` is tested first so an order that was overdue and has since been settled reads
--     as `paid` rather than carrying the flag forever.
--   * `overdue` outranks `partially_paid` because a past-due order needs chasing regardless
--     of how much has been collected. That folds two independent facts into one enum, so
--     `is_overdue` is also exposed on its own and the UI renders "Partially paid · overdue".

CREATE VIEW order_summaries AS
SELECT
    o.id,
    o.user_id,
    o.customer_name,
    o.due_date,
    o.subtotal_cents,
    o.total_cents,
    o.amount_paid_cents,
    GREATEST(o.total_cents - o.amount_paid_cents, 0) AS amount_due_cents,

    CASE
        WHEN o.amount_paid_cents >= o.total_cents THEN 'paid'
        WHEN o.due_date < CURRENT_DATE            THEN 'overdue'
        WHEN o.amount_paid_cents > 0              THEN 'partially_paid'
        ELSE 'pending'
    END AS status,

    (o.amount_paid_cents < o.total_cents AND o.due_date < CURRENT_DATE) AS is_overdue,

    -- Line items freeze once money has been taken against the order. Derived rather than
    -- stored: there is no flag that can fall out of sync with the payments themselves.
    (o.amount_paid_cents > 0) AS is_locked,

    (SELECT count(*) FROM order_line_items li WHERE li.order_id = o.id) AS line_item_count,

    o.version,
    o.created_at,
    o.updated_at
FROM orders o;

COMMENT ON VIEW order_summaries IS
    'Orders with derived status, amount due, and lock state. Single source of truth for reads.';
