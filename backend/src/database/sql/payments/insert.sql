-- Record a settlement: a payment (positive amount) or a refund (negative amount).
--
-- Append-only. Payments and refunds are never updated or deleted — correcting a payment means
-- recording a refund against it, which is why both live in this one table and read back as a
-- single ordered history.
--
-- The amount has already been validated against the balance under a row lock by the time this
-- runs. payments_amount_sign_matches_kind is the database's own guarantee that the sign agrees
-- with the kind, and the order's two CHECK constraints bound the result from both ends.
--
-- $1 order_id, $2 user_id, $3 amount_cents (signed), $4 paid_on, $5 note,
-- $6 idempotency_key, $7 kind ('payment' | 'refund')
INSERT INTO payments (order_id, user_id, amount_cents, paid_on, note, idempotency_key, kind)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, order_id, amount_cents, paid_on, note, kind, created_at;
