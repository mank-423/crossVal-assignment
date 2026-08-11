-- Audit trail for an order, newest first.
--
-- Note what this can and cannot show: every row here was caused by someone doing something.
-- An order sliding into `overdue` is caused by the calendar, writes nothing, and therefore
-- has no row. from_status/to_status record the status as derived at the moment of each event,
-- which is enough to reconstruct the sequence of deliberate changes.
--
-- $1 order_id
SELECT
    id,
    order_id,
    user_id,
    event_type,
    from_status,
    to_status,
    payment_id,
    amount_cents,
    metadata,
    created_at
FROM order_events
WHERE order_id = $1
ORDER BY created_at DESC, id DESC;
