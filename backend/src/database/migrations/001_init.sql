-- Migration 001 — core schema.
--
-- Applied inside a transaction by scripts/migrate.ts, so this file contains no BEGIN/COMMIT.
--
-- Conventions used throughout:
--   * Money is BIGINT cents. No NUMERIC, no floats, no rounding at rest.
--   * Dates that represent a calendar day (due date, payment date) are DATE, not TIMESTAMPTZ:
--     "due on the 14th" must not shift because the reader is in another timezone.
--   * Audit columns are TIMESTAMPTZ, because those are instants, not calendar days.
--   * Every constraint that protects money is enforced here, not only in the service layer.

CREATE EXTENSION IF NOT EXISTS citext;

-- Keeps updated_at honest without every UPDATE statement having to remember it.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    -- CITEXT so "Ada@example.com" and "ada@example.com" cannot both register.
    -- Enforced by the type rather than by remembering to lower() at every call site.
    email         CITEXT      NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT users_email_unique    UNIQUE (email),
    CONSTRAINT users_email_not_blank CHECK (length(trim(email::text)) > 0)
);

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The brief allows a plain string. Normalising into a `customers` table is the first
    -- thing to do when customers gain their own attributes; see README, "Tradeoffs".
    customer_name     TEXT        NOT NULL,
    due_date          DATE        NOT NULL,

    subtotal_cents    BIGINT      NOT NULL DEFAULT 0,
    -- Equal to subtotal for this assignment. Kept as its own column so order-level tax or
    -- discount can land later without rewriting every read query.
    total_cents       BIGINT      NOT NULL DEFAULT 0,

    -- Denormalised SUM(payments.amount_cents), maintained in the same transaction as the
    -- payment insert. This is what keeps the dashboard O(page size) instead of running a
    -- correlated aggregate over every payment ever recorded.
    amount_paid_cents BIGINT      NOT NULL DEFAULT 0,

    -- Incremented on every mutation. Lets a client detect a stale read.
    version           INTEGER     NOT NULL DEFAULT 1,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT orders_customer_name_not_blank  CHECK (length(trim(customer_name)) > 0),
    CONSTRAINT orders_subtotal_non_negative    CHECK (subtotal_cents >= 0),
    CONSTRAINT orders_total_non_negative       CHECK (total_cents >= 0),
    CONSTRAINT orders_amount_paid_non_negative CHECK (amount_paid_cents >= 0),

    -- The core business rule, enforced by the database itself. Even if the service layer is
    -- wrong, or a future script writes directly to the table, an order cannot end up
    -- overpaid. The application still checks first so the caller gets a useful message
    -- instead of a constraint violation.
    CONSTRAINT orders_amount_paid_within_total CHECK (amount_paid_cents <= total_cents)
);

CREATE TRIGGER orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every index leads with user_id: no query in this system ever crosses a user boundary.
CREATE INDEX orders_user_due_date_idx   ON orders (user_id, due_date);
CREATE INDEX orders_user_created_at_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_user_customer_idx   ON orders (user_id, lower(customer_name));

-- Partial index for the dashboard's real workload. Settled orders accumulate forever and are
-- never the ones being chased, so they are kept out of the index entirely; "what is
-- outstanding, soonest first" stays fast as the paid pile grows.
CREATE INDEX orders_user_outstanding_idx
    ON orders (user_id, due_date)
    WHERE amount_paid_cents < total_cents;


-- ---------------------------------------------------------------------------
-- order_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE order_line_items (
    id               BIGSERIAL PRIMARY KEY,
    order_id         BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    description      TEXT        NOT NULL,
    quantity         INTEGER     NOT NULL,
    unit_price_cents BIGINT      NOT NULL,

    -- Generated by the database, so the stored line total cannot disagree with its inputs.
    -- There is no code path that can write a line where quantity * unit_price != line_total.
    line_total_cents BIGINT      GENERATED ALWAYS AS (quantity * unit_price_cents) STORED,

    sort_order       INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT line_items_description_not_blank   CHECK (length(trim(description)) > 0),
    CONSTRAINT line_items_quantity_positive       CHECK (quantity >= 1),
    CONSTRAINT line_items_unit_price_non_negative CHECK (unit_price_cents >= 0)
);

CREATE INDEX order_line_items_order_idx ON order_line_items (order_id, sort_order);


-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    -- Denormalised from the parent order so payment history can be queried per user
    -- (statements, exports, date-range reporting) without joining through orders.
    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    amount_cents    BIGINT      NOT NULL,
    paid_on         DATE        NOT NULL,
    note            TEXT,

    -- Optional client-supplied Idempotency-Key. A row lock serialises concurrent payments but
    -- cannot tell a legitimate second payment from the same payment submitted twice — only
    -- the caller knows that, and this is how it says so.
    idempotency_key TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Refunds are a stretch goal and are not implemented. When they are, this becomes
    -- `<> 0` alongside a `kind` discriminator rather than a separate table.
    CONSTRAINT payments_amount_positive CHECK (amount_cents > 0)
);

-- Partial: only rows that opted into idempotency participate in the uniqueness rule.
CREATE UNIQUE INDEX payments_idempotency_key_unique
    ON payments (order_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX payments_order_idx        ON payments (order_id, created_at DESC);
CREATE INDEX payments_user_paid_on_idx ON payments (user_id, paid_on DESC);


-- ---------------------------------------------------------------------------
-- order_events — append-only audit log
-- ---------------------------------------------------------------------------
-- Written inside the same transaction as the change it describes, so the log cannot drift
-- from the data: either both land or neither does. Never updated, never deleted.
--
-- Known gap, documented rather than hidden: `overdue` is derived from the clock, so an order
-- becoming overdue produces no write and therefore no event. This log records actor-caused
-- transitions. Each row carries the status as derived at write time, so a timeline can still
-- be reconstructed; closing the gap properly needs a scheduled sweep (see README).
CREATE TABLE order_events (
    id           BIGSERIAL PRIMARY KEY,
    order_id     BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    -- Nullable and ON DELETE SET NULL: the actor may be gone, but the event still happened.
    user_id      BIGINT      REFERENCES users(id) ON DELETE SET NULL,

    event_type   TEXT        NOT NULL,
    from_status  TEXT,
    to_status    TEXT,

    payment_id   BIGINT      REFERENCES payments(id) ON DELETE SET NULL,
    amount_cents BIGINT,

    -- Event-specific detail (changed fields, payment note, previous totals). JSONB so a new
    -- event type does not require a migration to carry its payload.
    metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,

    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT order_events_type_valid CHECK (
        event_type IN ('order_created', 'order_updated', 'payment_recorded', 'status_changed', 'order_deleted')
    ),
    CONSTRAINT order_events_from_status_valid CHECK (
        from_status IS NULL OR from_status IN ('pending', 'partially_paid', 'paid', 'overdue')
    ),
    CONSTRAINT order_events_to_status_valid CHECK (
        to_status IS NULL OR to_status IN ('pending', 'partially_paid', 'paid', 'overdue')
    )
);

CREATE INDEX order_events_order_idx ON order_events (order_id, created_at DESC, id DESC);
CREATE INDEX order_events_user_idx  ON order_events (user_id, created_at DESC);
