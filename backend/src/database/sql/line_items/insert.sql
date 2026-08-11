-- Insert every line item of an order in one statement.
--
-- The parallel-arrays + unnest form means an order with fifty lines costs one round trip
-- instead of fifty, and the whole set lands atomically. Looping INSERTs in the service would
-- also work but turns a single network hop into N inside an open transaction, holding the
-- order's row lock for that much longer.
--
-- line_total_cents is not supplied: it is a generated column.
--
-- $1 order_id
-- $2 descriptions text[]
-- $3 quantities int[]
-- $4 unit prices bigint[] (cents)
-- $5 sort orders int[]
INSERT INTO order_line_items (order_id, description, quantity, unit_price_cents, sort_order)
SELECT $1, item.description, item.quantity, item.unit_price_cents, item.sort_order
FROM unnest($2::text[], $3::int[], $4::bigint[], $5::int[])
     AS item(description, quantity, unit_price_cents, sort_order)
RETURNING id, description, quantity, unit_price_cents, line_total_cents, sort_order;
