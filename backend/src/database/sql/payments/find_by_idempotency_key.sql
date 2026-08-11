-- Has this exact request already been recorded?
--
-- Checked before doing any work when the caller sends an Idempotency-Key. A retry after a
-- dropped response, or a double-clicked submit button, returns the original settlement instead
-- of moving the money twice. The unique index is the real guarantee; this lookup is what turns
-- a would-be constraint violation into a clean, correct reply.
--
-- $1 order_id, $2 idempotency_key
SELECT id, order_id, amount_cents, paid_on, note, kind, created_at
FROM payments
WHERE order_id = $1
  AND idempotency_key = $2;
