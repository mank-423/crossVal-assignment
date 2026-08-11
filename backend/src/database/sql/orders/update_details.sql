-- Update the editable header fields of an order.
--
-- Customer name and due date stay editable for the life of the order, including after
-- payment: correcting a typo or renegotiating a date does not change what is owed. Line items
-- do change what is owed, which is why they are handled separately and refused once a payment
-- exists (see the ORDER_LOCKED rule in orders.service.ts).
--
-- COALESCE keeps this a partial update: a NULL parameter means "leave this field alone",
-- so one statement serves any subset of the editable fields.
--
-- $1 order_id, $2 user_id, $3 customer_name (nullable), $4 due_date (nullable)
UPDATE orders o
SET customer_name = COALESCE($3::text, o.customer_name),
    due_date      = COALESCE($4::date, o.due_date),
    version       = o.version + 1
WHERE o.id = $1
  AND o.user_id = $2
RETURNING o.id, o.version;
