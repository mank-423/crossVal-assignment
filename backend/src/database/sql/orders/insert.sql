-- Create an order shell. Totals start at zero and are set by recalculate_totals.sql once the
-- line items exist, so the database computes the money rather than trusting the client's sum.
-- $1 user_id, $2 customer_name, $3 due_date
INSERT INTO orders (user_id, customer_name, due_date)
VALUES ($1, $2, $3)
RETURNING id;
