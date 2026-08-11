-- Migration 003 — refunds.
--
-- A refund is a settlement in the opposite direction, not a separate kind of record. It is
-- therefore a row in `payments` with a `kind` discriminator and a negative amount, rather than
-- a `refunds` table:
--
--   * `amount_paid_cents` stays a plain running sum. Applying a refund is the same increment
--     statement with a negative operand, so the row lock and the transaction that make
--     payments safe protect refunds too, with no second code path to get wrong.
--   * The two constraints that already guard the money keep working unchanged, and between
--     them they bound a refund from both ends without a single line of new validation SQL:
--         amount_paid_cents >= 0            — cannot refund more than was collected
--         amount_paid_cents <= total_cents  — cannot overpay
--   * Payment history is one ordered list. Reconstructing it from two tables and merging by
--     date is work that buys nothing.

-- ---------------------------------------------------------------------------
-- payments: discriminator, and a signed amount
-- ---------------------------------------------------------------------------
ALTER TABLE payments
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'payment';

ALTER TABLE payments
    DROP CONSTRAINT payments_amount_positive;

-- The sign is not left to the caller's discretion: it must agree with the kind. Without this,
-- a positive-amount 'refund' would quietly *increase* the amount collected.
ALTER TABLE payments
    ADD CONSTRAINT payments_kind_valid CHECK (kind IN ('payment', 'refund')),
    ADD CONSTRAINT payments_amount_sign_matches_kind CHECK (
        (kind = 'payment' AND amount_cents > 0) OR
        (kind = 'refund'  AND amount_cents < 0)
    );

-- ---------------------------------------------------------------------------
-- orders: lock on history, not on balance
-- ---------------------------------------------------------------------------
-- Until now `is_locked` was `amount_paid_cents > 0`. Refunds break that: refunding an order in
-- full returns the balance to zero, which would silently unlock the line items of an order
-- that has real settlement history behind it.
--
-- Locking is about whether money has ever moved, so it is counted rather than inferred from
-- the current balance.
ALTER TABLE orders
    ADD COLUMN settlement_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders
    ADD CONSTRAINT orders_settlement_count_non_negative CHECK (settlement_count >= 0);

UPDATE orders o
SET settlement_count = COALESCE(counted.total, 0)
FROM (SELECT order_id, count(*) AS total FROM payments GROUP BY order_id) AS counted
WHERE o.id = counted.order_id;

-- ---------------------------------------------------------------------------
-- order_events: a refund is its own kind of event
-- ---------------------------------------------------------------------------
ALTER TABLE order_events
    DROP CONSTRAINT order_events_type_valid;

ALTER TABLE order_events
    ADD CONSTRAINT order_events_type_valid CHECK (
        event_type IN (
            'order_created',
            'order_updated',
            'payment_recorded',
            'refund_recorded',
            'status_changed',
            'order_deleted'
        )
    );

-- ---------------------------------------------------------------------------
-- The read model
-- ---------------------------------------------------------------------------
-- Same columns in the same order, so CREATE OR REPLACE is enough. Only `is_locked` changes.
--
-- Status needs no change at all: `amount_paid_cents` is the net collected, so a refunded order
-- falls out of `paid` and back to `partially_paid` (or `overdue`) on its own.
CREATE OR REPLACE VIEW order_summaries AS
SELECT
    o.id,
    o.user_id,
    o.customer_name,
    o.due_date,
    o.subtotal_cents,
    o.total_cents,
    o.amount_paid_cents,
    GREATEST(o.total_cents - o.amount_paid_cents, 0) AS amount_due_cents,

    CASE
        WHEN o.amount_paid_cents >= o.total_cents THEN 'paid'
        WHEN o.due_date < CURRENT_DATE            THEN 'overdue'
        WHEN o.amount_paid_cents > 0              THEN 'partially_paid'
        ELSE 'pending'
    END AS status,

    (o.amount_paid_cents < o.total_cents AND o.due_date < CURRENT_DATE) AS is_overdue,

    -- Any settlement, in either direction, freezes the line items permanently.
    (o.settlement_count > 0) AS is_locked,

    (SELECT count(*) FROM order_line_items li WHERE li.order_id = o.id) AS line_item_count,

    o.version,
    o.created_at,
    o.updated_at
FROM orders o;

-- Refund history per order, for the detail page and for reporting.
CREATE INDEX payments_order_kind_idx ON payments (order_id, kind);
