-- Move the order's running balance by one settlement.
--
-- Written as an increment (`+ $3`) rather than assigning a total computed in the service.
-- Combined with the FOR UPDATE lock taken earlier in the transaction, the arithmetic happens
-- in the database against the current value, so there is no window in which a value read
-- earlier in the request could be written back stale.
--
-- The same statement serves refunds: $3 is simply negative. That is the whole reason refunds
-- are a signed row in `payments` rather than their own table — there is no second path to keep
-- correct, and the two CHECK constraints on `orders` bound the result in both directions:
--
--   amount_paid_cents >= 0            aborts a refund larger than what was collected
--   amount_paid_cents <= total_cents  aborts a payment beyond the order total
--
-- Either violation rolls the whole transaction back, taking the settlement row with it.
--
-- settlement_count only ever climbs. It is what `is_locked` reads, so refunding an order in
-- full does not reopen line items that real money has already moved against.
--
-- $1 order_id, $2 user_id, $3 amount_cents (signed)
UPDATE orders
SET amount_paid_cents = amount_paid_cents + $3,
    settlement_count  = settlement_count + 1,
    version           = version + 1
WHERE id = $1
  AND user_id = $2
RETURNING id, total_cents, amount_paid_cents, due_date, settlement_count, version;
