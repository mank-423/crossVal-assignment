-- Full settlement history for an order: payments and refunds, in one ordered list.
--
-- Ordered by date, then by insertion order. created_at breaks ties because several
-- settlements can share a date and the history should still read in the sequence the user
-- recorded them — which matters especially for a refund that follows a payment on the same
-- day.
--
-- $1 order_id
SELECT id, order_id, amount_cents, paid_on, note, kind, created_at
FROM payments
WHERE order_id = $1
ORDER BY paid_on ASC, created_at ASC, id ASC;
