-- Recompute subtotal and total from the order's own line items.
--
-- Deliberately does not accept a total from the caller. line_total_cents is a generated
-- column, so this sums values the database itself produced: the stored total cannot disagree
-- with the lines that justify it, whatever the client sent.
--
-- Total equals subtotal for this assignment (no order-level tax or discount).
--
-- $1 order_id, $2 user_id
UPDATE orders o
SET subtotal_cents = totals.sum_cents,
    total_cents    = totals.sum_cents,
    version        = o.version + 1
FROM (
    SELECT COALESCE(SUM(li.line_total_cents), 0) AS sum_cents
    FROM order_line_items li
    WHERE li.order_id = $1
) AS totals
WHERE o.id = $1
  AND o.user_id = $2
RETURNING o.id, o.subtotal_cents, o.total_cents, o.amount_paid_cents, o.version;
