-- Take a row lock on an order before touching its money.
--
-- This is the concurrency control for payments. Two payments arriving at the same instant
-- both reach this statement; the second blocks here until the first transaction commits, then
-- reads the balance the first one left behind. Without it, both would read the same stale
-- amount_paid_cents, both would pass validation, and the order would end up overpaid.
--
-- Must be called inside a transaction — a lock taken in autocommit is released immediately
-- and protects nothing.
--
-- $1 order_id, $2 user_id
SELECT
    o.id,
    o.user_id,
    o.customer_name,
    o.due_date,
    o.subtotal_cents,
    o.total_cents,
    o.amount_paid_cents,
    -- Counts every settlement ever recorded, in either direction. This — not the current
    -- balance — is what decides whether the order is locked: an order paid and then fully
    -- refunded is back to a zero balance but must not become editable again.
    o.settlement_count,
    o.version
FROM orders o
WHERE o.id = $1
  AND o.user_id = $2
FOR UPDATE;
