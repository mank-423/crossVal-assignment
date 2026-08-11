import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, isoDate, resetDatabase, sampleOrder, signUp, TestUser } from './helpers/test-app';

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let user: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    user = await signUp(app);
  });

  async function createOrder(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${API}/orders`)
      .set(user.auth)
      .send(sampleOrder(overrides))
      .expect(201);

    return response.body.id as string;
  }

  const pay = (orderId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`${API}/orders/${orderId}/payments`).set(user.auth).send(body);

  /**
   * The scenario the brief gives to verify an implementation, step for step.
   */
  describe("the brief's sample scenario", () => {
    it('goes pending -> partially_paid -> paid, then rejects a further payment', async () => {
      // 1. An order of 2 x $500 = $1,000, due in 7 days.
      const orderId = await createOrder();

      const created = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);
      expect(created.body.totalCents).toBe(100_000);
      expect(created.body.status).toBe('pending');

      // 2. Record $400 -> partially_paid, $600 due.
      const first = await pay(orderId, { amount: '400.00' }).expect(201);
      expect(first.body.order.status).toBe('partially_paid');
      expect(first.body.order.amountDueCents).toBe(60_000);
      expect(first.body.order.amountPaidCents).toBe(40_000);

      // 3. Record $600 -> paid, $0 due.
      const second = await pay(orderId, { amount: '600.00' }).expect(201);
      expect(second.body.order.status).toBe('paid');
      expect(second.body.order.amountDueCents).toBe(0);

      // 4. A further $1 must be rejected, with the ceiling stated.
      const rejected = await pay(orderId, { amount: '1.00' }).expect(422);
      expect(rejected.body.code).toBe('OVERPAYMENT_REJECTED');
      expect(rejected.body.details.maxAllowedCents).toBe(0);
      expect(rejected.body.hint).toMatch(/fully paid/i);

      // The rejection must not have moved anything.
      const final = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);
      expect(final.body.amountPaidCents).toBe(100_000);
      expect(final.body.payments).toHaveLength(2);
    });
  });

  describe('over-payment rejection', () => {
    it('rejects a single payment larger than the total and names the maximum', async () => {
      const orderId = await createOrder();

      const response = await pay(orderId, { amount: '1000.01' }).expect(422);

      expect(response.body.code).toBe('OVERPAYMENT_REJECTED');
      expect(response.body.details).toMatchObject({
        attemptedCents: 100_001,
        orderTotalCents: 100_000,
        amountPaidCents: 0,
        maxAllowedCents: 100_000,
      });
      expect(response.body.hint).toContain('$1,000.00');
    });

    it('rejects a payment one cent over the remaining balance', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);

      const response = await pay(orderId, { amount: '600.01' }).expect(422);
      expect(response.body.details.maxAllowedCents).toBe(60_000);
    });

    it('accepts a payment for exactly the remaining balance', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);

      const response = await pay(orderId, { amount: '600.00' }).expect(201);
      expect(response.body.order.status).toBe('paid');
    });

    it('records nothing when a payment is rejected', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '2000.00' }).expect(422);

      const response = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}/payments`)
        .set(user.auth)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('partial payments', () => {
    it('accumulates many small payments up to the total', async () => {
      const orderId = await createOrder();

      for (let index = 0; index < 4; index++) {
        await pay(orderId, { amount: '250.00' }).expect(201);
      }

      const response = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);

      expect(response.body.status).toBe('paid');
      expect(response.body.amountPaidCents).toBe(100_000);
      expect(response.body.payments).toHaveLength(4);
    });

    it('accepts a one-cent payment and reports the balance exactly', async () => {
      const orderId = await createOrder();

      const response = await pay(orderId, { amount: '0.01' }).expect(201);

      expect(response.body.order.status).toBe('partially_paid');
      expect(response.body.order.amountDueCents).toBe(99_999);
    });

    it('stores an optional note and payment date', async () => {
      const orderId = await createOrder();

      const response = await pay(orderId, {
        amount: '100.00',
        paidOn: isoDate(-3),
        note: 'Bank transfer, ref 12345',
      }).expect(201);

      expect(response.body.payment.paidOn).toBe(isoDate(-3));
      expect(response.body.payment.note).toBe('Bank transfer, ref 12345');
    });

    it('rejects a zero or negative payment', async () => {
      const orderId = await createOrder();

      await pay(orderId, { amount: '0' }).expect(422);
      await pay(orderId, { amount: '-50.00' }).expect(422);
    });
  });

  describe('overdue handling', () => {
    it('reports overdue for a part-paid order past its due date, with isOverdue set', async () => {
      const orderId = await createOrder({ dueDate: isoDate(-5) });

      const response = await pay(orderId, { amount: '400.00' }).expect(201);

      expect(response.body.order.status).toBe('overdue');
      expect(response.body.order.isOverdue).toBe(true);
      expect(response.body.order.amountDueCents).toBe(60_000);
    });

    /** The edge case the brief asks to be documented. */
    it('reports paid, not overdue, once a late order is settled in full', async () => {
      const orderId = await createOrder({ dueDate: isoDate(-5) });

      const response = await pay(orderId, { amount: '1000.00' }).expect(201);

      expect(response.body.order.status).toBe('paid');
      expect(response.body.order.isOverdue).toBe(false);
    });
  });

  describe('order locking', () => {
    it('refuses to change line items once a payment exists', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '100.00' }).expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${API}/orders/${orderId}`)
        .set(user.auth)
        .send({ lineItems: [{ description: 'Cheaper', quantity: 1, unitPrice: '1.00' }] })
        .expect(409);

      expect(response.body.code).toBe('ORDER_LOCKED');
      expect(response.body.hint).toBeTruthy();
    });

    it('still allows the customer name and due date to be edited', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '100.00' }).expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${API}/orders/${orderId}`)
        .set(user.auth)
        .send({ customerName: 'Corrected Name Ltd', dueDate: isoDate(45) })
        .expect(200);

      expect(response.body.customerName).toBe('Corrected Name Ltd');
    });

    it('refuses to delete an order that has a payment', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '100.00' }).expect(201);

      const response = await request(app.getHttpServer())
        .delete(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(409);

      expect(response.body.code).toBe('ORDER_LOCKED');
    });

    it('reports isLocked on the order itself', async () => {
      const orderId = await createOrder();

      const before = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth);
      expect(before.body.isLocked).toBe(false);

      await pay(orderId, { amount: '100.00' }).expect(201);

      const after = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth);
      expect(after.body.isLocked).toBe(true);
    });
  });

  describe('audit trail', () => {
    it('records the payment and the status change it caused', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);
      const response = await pay(orderId, { amount: '600.00' }).expect(201);

      const events = response.body.order.events as Array<{
        eventType: string;
        fromStatus: string | null;
        toStatus: string | null;
        amountCents: number | null;
      }>;

      // Newest first: status_changed, payment_recorded, status_changed, payment_recorded, order_created
      expect(events).toHaveLength(5);
      expect(events[0]).toMatchObject({
        eventType: 'status_changed',
        fromStatus: 'partially_paid',
        toStatus: 'paid',
      });
      expect(events[1]).toMatchObject({
        eventType: 'payment_recorded',
        amountCents: 60_000,
      });
      expect(events[4]).toMatchObject({ eventType: 'order_created', toStatus: 'pending' });
    });

    it('does not log a status change when a partial payment leaves the status alone', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '100.00' }).expect(201);
      const response = await pay(orderId, { amount: '100.00' }).expect(201);

      const statusChanges = (response.body.order.events as Array<{ eventType: string }>).filter(
        (event) => event.eventType === 'status_changed',
      );

      // Only the first payment moved it off `pending`.
      expect(statusChanges).toHaveLength(1);
    });
  });

  describe('idempotency', () => {
    it('returns the original payment when a request is replayed with the same key', async () => {
      const orderId = await createOrder();
      const key = 'retry-key-abc-123';

      const first = await request(app.getHttpServer())
        .post(`${API}/orders/${orderId}/payments`)
        .set(user.auth)
        .set('Idempotency-Key', key)
        .send({ amount: '400.00' })
        .expect(201);

      const replay = await request(app.getHttpServer())
        .post(`${API}/orders/${orderId}/payments`)
        .set(user.auth)
        .set('Idempotency-Key', key)
        .send({ amount: '400.00' })
        .expect(201);

      expect(replay.body.replayed).toBe(true);
      expect(replay.body.payment.id).toBe(first.body.payment.id);
      expect(replay.body.order.amountPaidCents).toBe(40_000);
      expect(replay.body.order.payments).toHaveLength(1);
    });

    it('treats a different key as a genuinely new payment', async () => {
      const orderId = await createOrder();

      await request(app.getHttpServer())
        .post(`${API}/orders/${orderId}/payments`)
        .set(user.auth)
        .set('Idempotency-Key', 'key-one')
        .send({ amount: '400.00' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`${API}/orders/${orderId}/payments`)
        .set(user.auth)
        .set('Idempotency-Key', 'key-two')
        .send({ amount: '400.00' })
        .expect(201);

      expect(second.body.replayed).toBe(false);
      expect(second.body.order.amountPaidCents).toBe(80_000);
    });
  });

  /**
   * The concurrency question the brief raises. The row lock in payments.service.ts is what
   * makes this deterministic: the requests serialise, so the second one sees the first one's
   * effect and is rejected instead of both reading the same stale balance.
   */
  describe('concurrent payments', () => {
    it('lets exactly one of two simultaneous payments succeed when both cannot fit', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);

      // $600 remains; two $600 payments arrive together.
      const [a, b] = await Promise.all([
        pay(orderId, { amount: '600.00' }),
        pay(orderId, { amount: '600.00' }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 422]);

      const rejected = a.status === 422 ? a : b;
      expect(rejected.body.code).toBe('OVERPAYMENT_REJECTED');

      const final = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);

      expect(final.body.amountPaidCents).toBe(100_000);
      expect(final.body.status).toBe('paid');
      expect(final.body.payments).toHaveLength(2);
    });

    it('accepts both when they fit, without losing either', async () => {
      const orderId = await createOrder();

      await Promise.all([pay(orderId, { amount: '300.00' }), pay(orderId, { amount: '300.00' })]);

      const final = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);

      expect(final.body.amountPaidCents).toBe(60_000);
      expect(final.body.payments).toHaveLength(2);
    });

    it('never lets five racing payments exceed the total', async () => {
      const orderId = await createOrder();

      const results = await Promise.all(
        Array.from({ length: 5 }, () => pay(orderId, { amount: '400.00' })),
      );

      const accepted = results.filter((result) => result.status === 201);
      // $1,000 total, $400 each: at most two can fit.
      expect(accepted).toHaveLength(2);

      const final = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);

      expect(final.body.amountPaidCents).toBe(80_000);
      expect(final.body.amountPaidCents).toBeLessThanOrEqual(final.body.totalCents);
    });
  });
});
