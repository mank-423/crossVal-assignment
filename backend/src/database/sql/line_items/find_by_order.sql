-- Line items for an order's detail page, in the order the user entered them.
-- Ownership is checked on the parent order before this runs.
-- $1 order_id
SELECT id, description, quantity, unit_price_cents, line_total_cents, sort_order
FROM order_line_items
WHERE order_id = $1
ORDER BY sort_order ASC, id ASC;
