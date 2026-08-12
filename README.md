# Orders & Settlements

A web application for tracking orders with line items, recording full or partial payments against them, and seeing what is still owed.

Everything the application derives — line totals, order totals, amount due, status — is derived in one place and, wherever possible, by the database itself. The recurring theme in the notes below is that a rule enforced in only one layer is a rule that eventually gets bypassed.

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Everyday commands](#everyday-commands)
- [Database design](#database-design)
- [Status derivation and edge cases](#status-derivation-and-edge-cases)
- [Business rules](#business-rules)
- [Concurrency](#concurrency)
- [API reference](#api-reference)
- [Testing](#testing)
- [Assumptions and tradeoffs](#assumptions-and-tradeoffs)
- [What I would improve before production](#what-i-would-improve-before-production)
- [Deployment](#deployment)

## What it does

- **Accounts** — email and password sign-up and sign-in. Every user sees only their own data.
- **Orders** — a customer, a due date, and one or more line items. Subtotal and total are computed server-side from the lines.
- **Payments** — full or partial, as many as needed, never exceeding the order total.
- **Refunds** — return part or all of what was collected; the order's status follows automatically.
- **Status** — `pending`, `partially_paid`, `paid`, or `overdue`, derived from payments and the due date rather than stored.
- **Dashboard** — outstanding, overdue, collected and invoiced totals; a filterable, searchable, paginated order list.
- **Order detail** — line items, full settlement history, and an audit trail of every change.

Two of the brief's optional stretch goals are included: refunds and an audit log.

### The brief's sample scenario

Run against the live API, this is the exact flow the brief asks for:

| Step | Result |
|---|---|
| Create an order: 2 × $500, due in 7 days | $1,000.00 · `pending` |
| Record a payment of $400 | `partially_paid` · $600.00 due |
| Record a payment of $600 | `paid` · $0.00 due |
| Attempt a further $1 | `422 OVERPAYMENT_REJECTED`, maximum allowed stated as $0.00 |

It is also encoded as an end-to-end test.

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | NestJS + TypeScript | Dependency injection and module boundaries keep controllers, business rules, and data access genuinely separate |
| Database | PostgreSQL, accessed through `pg` | Constraints, generated columns, and row locking do real work here; an ORM would hide the parts that matter most |
| SQL | Standalone `.sql` files | Every query is readable and runnable on its own, and repositories contain only parameter binding |
| Frontend | React + TypeScript + Vite | Fast dev loop, straightforward production build |
| Server state | TanStack Query | Caching and invalidation without hand-written loading flags |
| Styling | Tailwind CSS | Consistent spacing and colour without a parallel stylesheet to maintain |
| UI Components | shadcn/ui with Base UI | Accessible, customizable, and modern component system |
| Tests | Jest + Supertest | Runs the real application against a real database |

## Repository layout

```text
.
├── backend/                    NestJS REST API
│   ├── src/
│   │   ├── config/             Environment validation, at boot
│   │   ├── common/             Error envelope, filters, validators, decorators
│   │   ├── database/
│   │   │   ├── migrations/     001_init.sql, 002_order_summaries_view.sql, 003_refunds.sql
│   │   │   ├── sql/            Every query in the system, as .sql files
│   │   │   ├── database.service.ts    Pool, query, transaction
│   │   │   └── sql-loader.service.ts  Loads and caches the .sql files at boot
│   │   ├── auth/               Sign-up, sign-in, JWT strategy and guard
│   │   ├── orders/             Orders, line items, audit log, dashboard
│   │   └── payments/           Payment recording, over-payment rejection
│   ├── scripts/                migrate.ts, seed.ts
│   └── test/                   End-to-end specs
│
├── frontend/                   React dashboard
│   ├── src/
│   │   ├── api/                API client and endpoints
│   │   ├── auth/                Authentication context and hooks
│   │   ├── components/         Reusable UI components (shadcn/ui)
│   │   ├── pages/               Dashboard, OrderDetail, NewOrder, Home
│   │   └── lib/                 Utilities and helpers
│   └── shared/                  Shared types and utilities (copied from backend)
│
├── shared/                      Shared types, money helpers, and status rules
│   └── src/                     Used by both backend and frontend
│
└── docs/                        The assignment brief
```

The `shared` folder is what keeps the two sides consistent. `OrderStatus`, the request and response types, and the cents-to-display money helpers are declared once and used by both sides, so the frontend cannot drift from the API contract.

## Setup

### Prerequisites

- Node.js 20 or newer (developed on 24) — https://nodejs.org
- PostgreSQL 14 or newer (developed on 17) — https://www.postgresql.org/download/

On Windows both are available through winget:

```powershell
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.17
```

Restart your terminal afterwards so the new executables are on PATH.

### 1. Clone and navigate

```bash
git clone https://github.com/mank-423/crossVal-assignment
cd crossVal-assignment
```

### 2. Install dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 3. Create the databases

```bash
createdb -U postgres orders_settlements
createdb -U postgres orders_settlements_test
```

The second database is used by the end-to-end tests, which truncate every table between specs. It must be separate from the development database — the test helper refuses to run against any database whose name does not end in `_test`.

### 4. Configure the API

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env` and set `DATABASE_URL` and `TEST_DATABASE_URL` to match your Postgres credentials.

### 5. Create the schema and load demo data

```bash
cd backend
npm run migrate
npm run migrate -- --test   # same schema, test database
npm run seed
```

The seed loads six orders covering every status, including both edge cases described below.

### 6. Run it

```bash
# From the root directory
# Start backend (in one terminal)
cd backend
npm run start:dev

# Start frontend (in another terminal)
cd frontend
npm run dev
```

- API — http://localhost:3000/api/v1
- Web — http://localhost:5173

Sign in with the seeded account:

```text
demo@example.com  /  demo-password-123
```

## Environment variables

All API configuration lives in `backend/.env`. It is validated at boot: a missing or malformed value stops the process immediately rather than surfacing later as a confusing runtime failure.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string. A hosted provider's URL drops in unchanged |
| `TEST_DATABASE_URL` | for tests | — | Must name a database ending in `_test` |
| `JWT_SECRET` | in production | dev-only fallback | The process refuses to start in production with a missing, short, or placeholder secret |
| `JWT_EXPIRES_IN` | no | `7d` | |
| `PORT` | no | `3000` | |
| `NODE_ENV` | no | `development` | `test` switches to `TEST_DATABASE_URL` |
| `CORS_ORIGIN` | no | `http://localhost:5173` | Comma-separated list of allowed origins |
| `DATABASE_SSL` | no | on in production | Managed providers need TLS; localhost does not |
| `DATABASE_MAX_CONNECTIONS` | no | `10` | |

The web app needs `VITE_API_URL` only when deployed. In development, Vite proxies `/api` to the API process, so the browser talks to a single origin and there is no CORS to configure.

Frontend `.env.development`:

```env
VITE_API_URL=/api/v1
```

Frontend `.env.production` (for deployment):

```env
VITE_API_URL=https://crossval-assignment.onrender.com/api/v1
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run start:dev` (backend) | Starts API in watch mode |
| `npm run dev` (frontend) | Starts Vite dev server |
| `npm run build` (backend) | Builds API for production |
| `npm run build` (frontend) | Builds frontend for production |
| `npm test` | Unit tests (money, status derivation) |
| `npm run test:e2e` | End-to-end tests against the test database |
| `npm run migrate` | Applies pending migrations |
| `npm run seed` | Resets and reloads the demo account |

## Database design

Six tables. Money is stored as `BIGINT` cents everywhere — no `NUMERIC`, no floats, no rounding at rest. `0.1 + 0.2 !== 0.3` is not a curiosity when it decides whether an order is fully paid.

| Table | Purpose |
|---|---|
| `users` | Accounts. `email` is `CITEXT`, so case-insensitive uniqueness is enforced by the type rather than by remembering to `lower()` at each call site |
| `orders` | Customer, due date, subtotal, total, and the running `amount_paid_cents` |
| `order_line_items` | Description, quantity, unit price, and a generated `line_total_cents` |
| `payments` | Append-only settlements, payments and refunds alike. Amount, date, kind, optional note, optional idempotency key |
| `order_events` | Append-only audit log |
| `schema_migrations` | Which migrations have been applied |

### Line totals are computed by the database

```sql
line_total_cents BIGINT GENERATED ALWAYS AS (quantity * unit_price_cents) STORED
```

There is no code path — application, script, or manual `psql` session — that can write a line whose total disagrees with its own quantity and price. Order totals are then summed from those generated values, never from a number supplied by the client.

### `amount_paid_cents` is denormalised on purpose

It duplicates `SUM(payments.amount_cents)`, and is maintained inside the same transaction as the payment insert. Two reasons:

1. **Scale.** The dashboard lists orders with amount-paid and amount-due without a correlated aggregate over payments, so list queries stay proportional to page size rather than getting slower every time anyone records a payment.
2. **Enforcement.** It makes the central business rule expressible as a constraint:

```sql
CONSTRAINT orders_amount_paid_within_total CHECK (amount_paid_cents <= total_cents)
```

The database itself is now the final authority on over-payment. The service layer checks first so the caller gets a useful message, but even a buggy service, a future script, or a direct `UPDATE` cannot push an order past its total.

### The audit log

`order_events` is append-only and written inside the same transaction as the change it records, so the log cannot drift from the data — either both land or neither does. There is no update or delete method on its repository, by design.

| Column | Purpose |
|---|---|
| `event_type` | `order_created`, `order_updated`, `payment_recorded`, `status_changed`, `order_deleted` |
| `from_status` / `to_status` | Status as derived at the moment of the event |
| `payment_id`, `amount_cents` | Set for payment events |
| `metadata` (JSONB) | Event-specific detail, so a new event type needs no migration |

### Refunds are signed rows, not a second table

A refund is a settlement in the opposite direction, so it lives in `payments` with `kind = 'refund'` and a negative amount rather than in a `refunds` table:

```sql
CONSTRAINT payments_amount_sign_matches_kind CHECK (
    (kind = 'payment' AND amount_cents > 0) OR
    (kind = 'refund'  AND amount_cents < 0)
)
```

This buys three things:

- `amount_paid_cents` stays a plain running sum. Applying a refund is the same increment statement with a negative operand, so the row lock and transaction that make payments safe protect refunds too, with no second code path to keep correct.
- The existing constraints bound refunds from both ends, with no new validation SQL. `amount_paid_cents >= 0` aborts a refund larger than what was collected; `amount_paid_cents <= total_cents` still aborts over-payment.
- Status needs no change whatsoever. `amount_paid_cents` is the net collected, so a refunded order falls out of `paid` and back to `partially_paid` (or `overdue`) on its own.

### Locking counts settlements, not balance

`orders.settlement_count` increments on every payment and every refund, and it is what `is_locked` reads. The obvious alternative — locking when `amount_paid_cents > 0` — has a hole: refunding an order in full returns the balance to zero, which would silently reopen the line items of an order that real money has already moved against.

### Indexes

Every index leads with `user_id`, because no query in this system crosses a user boundary.

```sql
orders (user_id, due_date)
orders (user_id, created_at DESC)
orders (user_id, lower(customer_name))
orders (user_id, due_date) WHERE amount_paid_cents < total_cents   -- partial
payments (order_id, created_at DESC)
payments (user_id, paid_on DESC)
order_line_items (order_id, sort_order)
order_events (order_id, created_at DESC, id DESC)
```

## Status derivation and edge cases

Status is not stored. It is computed by a database view, `order_summaries`, which every read path selects from — so "what does `pending` mean" has exactly one answer, and `?status=overdue` filters and paginates inside the database rather than loading rows to filter in JavaScript.

```sql
CASE
    WHEN o.amount_paid_cents >= o.total_cents THEN 'paid'
    WHEN o.due_date < CURRENT_DATE            THEN 'overdue'
    WHEN o.amount_paid_cents > 0              THEN 'partially_paid'
    ELSE 'pending'
END
```

| Status | Condition |
|---|---|
| `pending` | No payments, due date not yet passed |
| `partially_paid` | Some payment recorded, less than the total, not yet due |
| `paid` | Payments equal (or exceed) the total |
| `overdue` | Past the due date and not fully paid |

Precedence is `paid` > `overdue` > `partially_paid` > `pending`.

### Documented edge cases

- **An order that was overdue but is now fully paid → `paid`.** This is the case the brief names. `paid` is tested first, so a late order that has since been settled stops being chased instead of carrying the flag forever.
- **An order that is both partially paid and past due → `overdue`, plus `isOverdue: true`.** These are two independent facts and a single enum cannot express both. `overdue` wins because a past-due order needs attention regardless of how much has been collected. The API therefore also returns `isOverdue` separately, and the UI renders "Partially paid · overdue".
- **The due date itself is not late.** Payment is due on that day, so an order becomes overdue the day after. `due_date < CURRENT_DATE`, not `<=`.
- **A zero-total order is refused at creation.** It would satisfy `paid >= total` on day one and present as settled without anyone paying anything, so that state is prevented rather than special-cased.
- **Overdue is evaluated in the server's timezone.** `CURRENT_DATE` is a server-side calendar day. For a single-region deployment this is right; for users spread across timezones it means an order can read as overdue a few hours early or late relative to the user's own midnight.

## Business rules

### Orders become read-only after the first payment

Line items are frozen once any payment exists. Attempting to change them returns `409 ORDER_LOCKED`.

The reason is that the total is what the payment was validated against. Rewriting the lines afterwards could drop the total below what has already been collected, producing an order that is overpaid by construction.

What stays editable, deliberately:

- Customer name and due date, for the whole life of the order. Correcting a typo or renegotiating a date does not change what is owed.
- Deleting an order is refused once a payment exists, for the same reason.

### Over-payment is rejected with an actionable error

Total payments can never exceed the order total. The rejection names the ceiling:

```json
{
  "statusCode": 422,
  "code": "OVERPAYMENT_REJECTED",
  "message": "Payment of $1.00 exceeds the amount due on this order.",
  "hint": "This order is already fully paid ($1,000.00). No further payment can be recorded.",
  "details": {
    "orderId": "1",
    "attemptedCents": 100,
    "orderTotalCents": 100000,
    "amountPaidCents": 100000,
    "maxAllowedCents": 0
  }
}
```

### Refunds

A refund returns part or all of what has been collected and increases the amount due again. It cannot exceed the amount collected — the mirror of the over-payment rule:

```json
{
  "statusCode": 422,
  "code": "REFUND_EXCEEDS_COLLECTED",
  "message": "Refund of $400.01 is more than has been collected on this order.",
  "hint": "The maximum refund allowed right now is $400.00."
}
```

### Tenant isolation

Ownership is part of the `WHERE` clause of every query (`AND user_id = $n`), not an application-level check that a future handler might forget. A request for another user's order returns `404`, never `403`, so the API never confirms that an id it does not own exists.

## Concurrency

Recording a payment is one transaction that opens by locking the order row:

```sql
BEGIN;
  SELECT ... FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE;  -- 1
  -- validate amount <= total_cents - amount_paid_cents               -- 2
  INSERT INTO payments ...;                                           -- 3
  UPDATE orders SET amount_paid_cents = amount_paid_cents + $n ...;   -- 4
  INSERT INTO order_events ...;                                       -- 5
COMMIT;
```

Consider two $600 payments arriving simultaneously against a $1,000 order with $400 already paid. Both reach step 1; the second blocks there until the first transaction commits, then reads the balance the first one left behind and is rejected. Without the lock, both would read $400, both would pass validation, and the order would end up $200 overpaid.

### Idempotency keys

A row lock cannot distinguish a legitimate second payment from the same payment submitted twice — only the caller knows that. Sending an `Idempotency-Key` header makes a retry return the original payment instead of taking the money twice. A partial unique index on `(order_id, idempotency_key)` is the real guarantee; two racing duplicates that both miss the lookup are resolved by the index, and the loser returns the winner's payment.

## API reference

Base URL: `/api/v1`. All routes except sign-up, sign-in, and health require `Authorization: Bearer <token>`.

### Authentication

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | `{ email, password }` → token + user |
| POST | `/auth/login` | `{ email, password }` → token + user |
| GET | `/auth/me` | Current user |

### Orders

| Method | Path | Notes |
|---|---|---|
| GET | `/orders` | `?status=&search=&page=&limit=&sort=&direction=` |
| POST | `/orders` | Creates order and line items in one transaction |
| GET | `/orders/:id` | Line items, payment history, audit trail |
| PATCH | `/orders/:id` | `409 ORDER_LOCKED` if line items change after a payment |
| DELETE | `/orders/:id` | `409 ORDER_LOCKED` once a payment exists |
| GET | `/dashboard/summary` | Per-status counts and totals |

### Payments

| Method | Path | Notes |
|---|---|---|
| POST | `/orders/:orderId/payments` | Optional `Idempotency-Key` header |
| POST | `/orders/:orderId/refunds` | Positive amount; stored negated. Same idempotency support |
| GET | `/orders/:orderId/payments` | Payments and refunds, in one ordered history |

### Error format

Every non-2xx response has the same shape, from every layer:

```json
{
  "statusCode": 422,
  "code": "VALIDATION_FAILED",
  "message": "One or more fields are invalid.",
  "hint": "Correct the highlighted fields and submit again.",
  "fieldErrors": {
    "lineItems.0.quantity": ["Quantity must be at least 1."]
  },
  "path": "/api/v1/orders",
  "timestamp": "2026-08-10T15:42:11.204Z"
}
```

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 422 | Bad input; see `fieldErrors` |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `EMAIL_ALREADY_REGISTERED` | 409 | Address already has an account |
| `UNAUTHENTICATED` | 401 | Missing or invalid token |
| `ORDER_NOT_FOUND` | 404 | No such order for this user |
| `ORDER_LOCKED` | 409 | Line items frozen by an existing settlement |
| `OVERPAYMENT_REJECTED` | 422 | Would exceed the order total |
| `REFUND_EXCEEDS_COLLECTED` | 422 | Would return more than was collected |
| `INTERNAL_ERROR` | 500 | Unexpected; details are logged, not returned |

## Testing

```bash
cd backend
npm test           # Unit tests
npm run test:e2e   # End-to-end tests
```

- **Unit** — money conversion (including values where float multiplication is provably inexact), line and order arithmetic, and all four status derivations plus every edge case above.
- **End-to-end** — the real application against a real Postgres database. Nothing is mocked: the point is that the SQL, the constraints, the transactions, and the derivation agree with each other.

Coverage includes CRUD for auth, orders and payments; the brief's sample scenario verbatim; over-payment at the boundary (exact remainder accepted, one cent more refused); refunds, including the refund ceiling and the fact that a fully refunded order stays locked; order locking; the audit trail; idempotent replays; tenant isolation across every route; and the concurrency cases described above.

## Assumptions and tradeoffs

- Customer is a plain string, as the brief permits. Denormalised onto `orders` with an index on `(user_id, lower(customer_name))`. Promoting it to its own table is the first normalisation step once customers gain attributes of their own.
- Order total equals subtotal. No order-level tax or discount, as specified. `total_cents` is kept as its own column anyway so that change lands without rewriting every read query.
- Settlements are append-only and cannot be edited or deleted. Correcting a payment means recording a refund against it, which is exactly what refunds are for.
- A refund is not tied to a specific payment. It reduces the order's balance rather than reversing one particular row.
- Line-item edits replace the whole set rather than diffing against stable ids.
- Deletion is a hard delete, which discards the order's line items and audit events. This is defensible only because deletion is refused once any payment exists: an order that never took money has no financial history to preserve.
- Access tokens are stored in `localStorage`. Simple and appropriate here; httpOnly cookies with CSRF protection would be the production choice.
- Bcrypt at 12 rounds, via `bcryptjs` — pure JavaScript, so there is no native build step to fail on a fresh machine or in a slim container.

## What I would improve before production

- Refresh tokens and revocation. Access tokens currently live for 7 days with no way to invalidate one early.
- A scheduled sweep for overdue transitions, writing the `status_changed` events the clock currently produces silently.
- Rate limiting on sign-in and sign-up. Nothing currently slows down credential stuffing.
- Structured logging with request ids, so a reported failure can be traced through the transaction that produced it.
- Cursor pagination for the order list. Offset pagination degrades on deep pages.
- Generated API documentation. OpenAPI generated from the DTOs would not go stale.
- Frontend tests. The API is well covered; the React app is currently verified by hand and by the type system.
- Better error boundaries and loading states on the frontend.

## Deployment

The application is deployed on Render:

- API: https://crossval-assignment.onrender.com
- Frontend: https://crossval-assignment.onrender.com

### Render Configuration

#### Backend (Web Service)

| Setting | Value |
|---|---|
| Build Command | `npm install && npm run build` |
| Start Command | `node dist/main.js` |
| Environment | Node.js |
| Root Directory | `backend/` |

Environment Variables:

```text
NODE_ENV=production
JWT_SECRET=<production-secret>
DATABASE_URL=<production-database-url>
CORS_ORIGIN=https://crossval-assignment.onrender.com
PORT=3000
```

#### Frontend (Static Site)

| Setting | Value |
|---|---|
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |
| Root Directory | `frontend/` |

Environment Variables:

```text
VITE_API_URL=https://crossval-assignment.onrender.com/api/v1
```

### Deployment Steps

1. Push code to GitHub repository
2. Render automatically detects changes and deploys
3. Database migrations run as part of the build process
4. Health check endpoint: `/api/v1/health` verifies database connectivity

### Database (Render PostgreSQL)

- Plan: Free tier
- SSL: Required
- Migrations: Run via `npm run migrate` during build

## Live Demo

The application is live at: https://crossval-assignment.onrender.com

Use the seeded demo account:

```text
Email: demo@example.com
Password: demo-password-123
```