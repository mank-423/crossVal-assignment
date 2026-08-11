-- Clear an order's line items so a replacement set can be inserted.
--
-- Replace-all rather than diff-and-patch: the client sends the full intended set of lines, and
-- reconciling additions, edits, removals and reordering against stable ids is a lot of code to
-- get subtly wrong for no user-visible gain. It is only reachable on unpaid orders, where no
-- payment references the lines being discarded.
--
-- Runs in the same transaction as the insert that follows it, so the order is never
-- observable with no lines.
--
-- $1 order_id
DELETE FROM order_line_items
WHERE order_id = $1;
