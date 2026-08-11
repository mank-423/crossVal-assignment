-- Append one audit event.
--
-- Always called inside the transaction that performs the change it describes, so the log and
-- the data commit together or not at all. There is no update or delete counterpart: the table
-- is append-only by design, not by convention.
--
-- $1 order_id, $2 user_id, $3 event_type, $4 from_status, $5 to_status,
-- $6 payment_id, $7 amount_cents, $8 metadata jsonb
INSERT INTO order_events (
    order_id, user_id, event_type, from_status, to_status, payment_id, amount_cents, metadata
)
VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::jsonb, '{}'::jsonb))
RETURNING id, created_at;
