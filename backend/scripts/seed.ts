import { hash } from 'bcryptjs';
import { Client } from 'pg';

import { loadEnv, resolveDatabaseUrl } from './load-env';

/**
 * Loads a demo account with orders spanning all four statuses, so the dashboard has something
 * to show on a fresh database and every filter has at least one row behind it.
 *
 * Idempotent: it clears the demo user's data first, so running it twice does not stack up
 * duplicates. It only ever touches the demo account — other users' rows are left alone.
 */

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo-password-123';

interface SeedOrder {
  customer: string;
  /** Days from today. Negative is in the past. */
  dueInDays: number;
  lines: Array<{ description: string; quantity: number; unitPriceCents: number }>;
  /** Payments to record, in cents. */
  payments: Array<{ amountCents: number; daysAgo: number; note?: string }>;
  /** Recorded after the payments above, as a returned sum. */
  refunds?: Array<{ amountCents: number; daysAgo: number; note?: string }>;
}

const ORDERS: SeedOrder[] = [
  {
    // pending — nothing paid, still in date
    customer: 'Acme Industries',
    dueInDays: 14,
    lines: [
      { description: 'Consulting day', quantity: 2, unitPriceCents: 50_000 },
      { description: 'Travel', quantity: 1, unitPriceCents: 12_500 },
    ],
    payments: [],
  },
  {
    // partially_paid — some money in, still in date
    customer: 'Blue Harbour Logistics',
    dueInDays: 21,
    lines: [
      { description: 'Platform licence (annual)', quantity: 1, unitPriceCents: 240_000 },
      { description: 'Onboarding', quantity: 3, unitPriceCents: 20_000 },
    ],
    payments: [{ amountCents: 100_000, daysAgo: 4, note: 'Deposit — bank transfer' }],
  },
  {
    // paid — settled in full
    customer: 'Cedarwood Design',
    dueInDays: 5,
    lines: [{ description: 'Brand refresh', quantity: 1, unitPriceCents: 175_000 }],
    payments: [
      { amountCents: 75_000, daysAgo: 12, note: 'Milestone 1' },
      { amountCents: 100_000, daysAgo: 2, note: 'Final instalment' },
    ],
  },
  {
    // overdue — past due, nothing paid
    customer: 'Dunmore Foods',
    dueInDays: -9,
    lines: [{ description: 'Quarterly audit', quantity: 1, unitPriceCents: 320_000 }],
    payments: [],
  },
  {
    // overdue AND partially paid — the case a single status field cannot express, which is
    // why the API also returns isOverdue
    customer: 'Eastgate Property',
    dueInDays: -3,
    lines: [
      { description: 'Site survey', quantity: 4, unitPriceCents: 45_000 },
      { description: 'Report', quantity: 1, unitPriceCents: 30_000 },
    ],
    payments: [{ amountCents: 60_000, daysAgo: 6, note: 'Part payment, balance promised' }],
  },
  {
    // overdue but now settled — reads as `paid`, not `overdue`
    customer: 'Fairlight Media',
    dueInDays: -20,
    lines: [{ description: 'Campaign retainer', quantity: 2, unitPriceCents: 90_000 }],
    payments: [{ amountCents: 180_000, daysAgo: 1, note: 'Settled late' }],
  },
  {
    // paid in full, then partly refunded — falls back out of `paid` on its own, because
    // status reads the net collected rather than a stored flag
    customer: 'Greenfield Analytics',
    dueInDays: 10,
    lines: [
      { description: 'Data migration', quantity: 1, unitPriceCents: 150_000 },
      { description: 'Training session', quantity: 2, unitPriceCents: 25_000 },
    ],
    payments: [{ amountCents: 200_000, daysAgo: 8, note: 'Paid in full on invoice' }],
    refunds: [{ amountCents: 25_000, daysAgo: 2, note: 'One training session cancelled' }],
  },
];

async function main(): Promise<void> {
  loadEnv();

  const connectionString = resolveDatabaseUrl();
  const client = new Client({ connectionString, ssl: sslOption(connectionString) });
  await client.connect();

  try {
    await client.query('BEGIN');

    // Start clean. Orders, line items, payments and events all cascade from the user row.
    await client.query('DELETE FROM users WHERE email = $1', [DEMO_EMAIL]);

    const passwordHash = await hash(DEMO_PASSWORD, 12);
    const { rows } = await client.query<{ id: number }>(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [DEMO_EMAIL, passwordHash],
    );
    const userId = rows[0]!.id;

    for (const spec of ORDERS) {
      await seedOrder(client, userId, spec);
    }

    await client.query('COMMIT');

    console.log(`Seeded ${ORDERS.length} orders for ${DEMO_EMAIL}`);
    console.log(`Sign in with:  ${DEMO_EMAIL}  /  ${DEMO_PASSWORD}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function seedOrder(client: Client, userId: number, spec: SeedOrder): Promise<void> {
  const dueDate = isoDate(spec.dueInDays);

  const orderResult = await client.query<{ id: number }>(
    'INSERT INTO orders (user_id, customer_name, due_date) VALUES ($1, $2, $3) RETURNING id',
    [userId, spec.customer, dueDate],
  );
  const orderId = orderResult.rows[0]!.id;

  for (const [index, line] of spec.lines.entries()) {
    await client.query(
      `INSERT INTO order_line_items (order_id, description, quantity, unit_price_cents, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, line.description, line.quantity, line.unitPriceCents, index],
    );
  }

  // Same rule as the application: totals come from the generated line totals, never from a
  // number computed here.
  const totals = await client.query<{ total_cents: number }>(
    `UPDATE orders o
     SET subtotal_cents = t.sum_cents, total_cents = t.sum_cents
     FROM (SELECT COALESCE(SUM(line_total_cents), 0) AS sum_cents
           FROM order_line_items WHERE order_id = $1) t
     WHERE o.id = $1
     RETURNING o.total_cents`,
    [orderId],
  );
  const totalCents = totals.rows[0]!.total_cents;

  await client.query(
    `INSERT INTO order_events (order_id, user_id, event_type, to_status, amount_cents, metadata)
     VALUES ($1, $2, 'order_created', $3, $4, $5)`,
    [
      orderId,
      userId,
      statusFor(totalCents, 0, dueDate),
      totalCents,
      JSON.stringify({ customerName: spec.customer, dueDate, lineItemCount: spec.lines.length }),
    ],
  );

  let paidSoFar = 0;

  for (const payment of spec.payments) {
    const before = statusFor(totalCents, paidSoFar, dueDate);
    paidSoFar += payment.amountCents;
    const after = statusFor(totalCents, paidSoFar, dueDate);

    const paymentResult = await client.query<{ id: number }>(
      `INSERT INTO payments (order_id, user_id, amount_cents, paid_on, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orderId, userId, payment.amountCents, isoDate(-payment.daysAgo), payment.note ?? null],
    );

    // settlement_count must move with the balance: it is what is_locked reads, so an order
    // seeded with payments but a zero count would present as editable.
    await client.query(
      'UPDATE orders SET amount_paid_cents = $2, settlement_count = settlement_count + 1 WHERE id = $1',
      [orderId, paidSoFar],
    );

    await client.query(
      `INSERT INTO order_events
         (order_id, user_id, event_type, from_status, to_status, payment_id, amount_cents, metadata)
       VALUES ($1, $2, 'payment_recorded', $3, $4, $5, $6, $7)`,
      [
        orderId,
        userId,
        before,
        after,
        paymentResult.rows[0]!.id,
        payment.amountCents,
        JSON.stringify({ note: payment.note ?? null }),
      ],
    );
  }

  for (const refund of spec.refunds ?? []) {
    const before = statusFor(totalCents, paidSoFar, dueDate);
    // Stored negated, exactly as the API does it.
    paidSoFar -= refund.amountCents;
    const after = statusFor(totalCents, paidSoFar, dueDate);

    const refundResult = await client.query<{ id: number }>(
      `INSERT INTO payments (order_id, user_id, amount_cents, paid_on, note, kind)
       VALUES ($1, $2, $3, $4, $5, 'refund') RETURNING id`,
      [orderId, userId, -refund.amountCents, isoDate(-refund.daysAgo), refund.note ?? null],
    );

    await client.query(
      'UPDATE orders SET amount_paid_cents = $2, settlement_count = settlement_count + 1 WHERE id = $1',
      [orderId, paidSoFar],
    );

    await client.query(
      `INSERT INTO order_events
         (order_id, user_id, event_type, from_status, to_status, payment_id, amount_cents, metadata)
       VALUES ($1, $2, 'refund_recorded', $3, $4, $5, $6, $7)`,
      [
        orderId,
        userId,
        before,
        after,
        refundResult.rows[0]!.id,
        -refund.amountCents,
        JSON.stringify({ note: refund.note ?? null }),
      ],
    );
  }
}

/** Mirrors order_summaries and deriveOrderStatus. Kept local so seeding needs no build step. */
function statusFor(totalCents: number, paidCents: number, dueDate: string): string {
  if (paidCents >= totalCents) return 'paid';
  if (dueDate < isoDate(0)) return 'overdue';
  if (paidCents > 0) return 'partially_paid';
  return 'pending';
}

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function sslOption(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  const needsSsl =
    connectionString.includes('sslmode=require') ||
    (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1'));
  return needsSsl ? { rejectUnauthorized: false } : undefined;
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
