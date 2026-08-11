-- Delete an order.
--
-- Only reachable for orders with no payments — the service refuses otherwise with
-- ORDER_LOCKED. That restriction is what makes a hard delete acceptable here: line items and
-- audit events cascade away with the order, but an order that never took money has no
-- financial history worth preserving. Anything that has been paid against is undeletable and
-- keeps its full trail.
--
-- The settlement_count = 0 predicate is a second line of defence: even if the service check
-- were bypassed, this statement cannot remove an order that money has moved against.
--
-- It counts settlements rather than testing the balance, because an order that was paid and
-- then fully refunded is back to zero — and deleting that would destroy a real financial
-- history.
--
-- $1 order_id, $2 user_id
DELETE FROM orders
WHERE id = $1
  AND user_id = $2
  AND settlement_count = 0
RETURNING id;
