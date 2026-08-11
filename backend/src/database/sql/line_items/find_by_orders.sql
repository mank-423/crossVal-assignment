-- Line items for several orders at once.
--
-- Exists so that listing N orders with their lines is two queries rather than 1 + N. The
-- caller groups the result by order_id in memory.
--
-- $1 order ids bigint[]
SELECT order_id, id, description, quantity, unit_price_cents, line_total_cents, sort_order
FROM order_line_items
WHERE order_id = ANY($1::bigint[])
ORDER BY order_id ASC, sort_order ASC, id ASC;
