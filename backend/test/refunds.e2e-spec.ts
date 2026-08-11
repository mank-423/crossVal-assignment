import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, isoDate, resetDatabase, sampleOrder, signUp, TestUser } from './helpers/test-app';

describe('Refunds (e2e)', () => {
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

  const refund = (orderId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`${API}/orders/${orderId}/refunds`).set(user.auth).send(body);

  describe('recording a refund', () => {
    it('reduces the amount collected and increases the amount due', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);

      const response = await refund(orderId, { amount: '250.00' }).expect(201);

      expect(response.body.order.amountPaidCents).toBe(75_000);
      expect(response.body.order.amountDueCents).toBe(25_000);
    });

    /**
     * Status is derived from the net collected, so this needs no special handling: the order
     * falls out of `paid` because the arithmetic says so, not because anything flags it.
     */
    it('moves a fully paid order back to partially_paid', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);

      const beforeRefund = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth);
      expect(beforeRefund.body.status).toBe('paid');

      const response = await refund(orderId, { amount: '250.00' }).expect(201);
      expect(response.body.order.status).toBe('partially_paid');
    });

    it('moves a fully paid but past-due order back to overdue', async () => {
      const orderId = await createOrder({ dueDate: isoDate(-5) });
      await pay(orderId, { amount: '1000.00' }).expect(201);

      const response = await refund(orderId, { amount: '100.00' }).expect(201);

      expect(response.body.order.status).toBe('overdue');
      expect(response.body.order.isOverdue).toBe(true);
    });

    it('returns to pending when everything collected is refunded', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);

      const response = await refund(orderId, { amount: '400.00' }).expect(201);

      expect(response.body.order.amountPaidCents).toBe(0);
      expect(response.body.order.status).toBe('pending');
      expect(response.body.order.amountDueCents).toBe(100_000);
    });

    it('stores the refund as a negative amount with kind refund', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);

      const response = await refund(orderId, {
        amount: '250.00',
        refundedOn: isoDate(-1),
        note: 'Cancelled one day',
      }).expect(201);

      expect(response.body.payment).toMatchObject({
        kind: 'refund',
        amountCents: -25_000,
        paidOn: isoDate(-1),
        note: 'Cancelled one day',
      });
    });

    it('lists payments and refunds together as one history', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);
      await refund(orderId, { amount: '250.00' }).expect(201);

      const response = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}/payments`)
        .set(user.auth)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((row: { kind: string }) => row.kind)).toEqual(['payment', 'refund']);
    });
  });

  describe('refund limits', () => {
    it('refuses to refund more than has been collected, and names the maximum', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);

      const response = await refund(orderId, { amount: '400.01' }).expect(422);

      expect(response.body.code).toBe('REFUND_EXCEEDS_COLLECTED');
      expect(response.body.details.maxAllowedCents).toBe(40_000);
      expect(response.body.hint).toContain('$400.00');
    });

    it('refuses any refund on an order with no payments', async () => {
      const orderId = await createOrder();

      const response = await refund(orderId, { amount: '1.00' }).expect(422);

      expect(response.body.code).toBe('REFUND_EXCEEDS_COLLECTED');
      expect(response.body.hint).toMatch(/nothing to refund/i);
    });

    it('allows a refund of exactly what was collected', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);

      await refund(orderId, { amount: '400.00' }).expect(201);
    });

    it('records nothing when a refund is rejected', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);
      await refund(orderId, { amount: '900.00' }).expect(422);

      const response = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);

      expect(response.body.amountPaidCents).toBe(40_000);
      expect(response.body.payments).toHaveLength(1);
    });

    it('rejects a zero or negative refund amount', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);

      await refund(orderId, { amount: '0' }).expect(422);
      await refund(orderId, { amount: '-100.00' }).expect(422);
    });

    it('still refuses over-payment after a refund has freed up balance', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);
      await refund(orderId, { amount: '300.00' }).expect(201);

      // $300 is now due again — but not a cent more.
      await pay(orderId, { amount: '300.01' }).expect(422);
      await pay(orderId, { amount: '300.00' }).expect(201);
    });
  });

  /**
   * Locking is deliberately based on whether money has ever moved, not on the current
   * balance. Refunding an order to zero must not reopen line items that real settlements
   * have already been recorded against.
   */
  describe('locking', () => {
    it('keeps the order locked after a full refund', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);
      const response = await refund(orderId, { amount: '400.00' }).expect(201);

      expect(response.body.order.amountPaidCents).toBe(0);
      expect(response.body.order.isLocked).toBe(true);

      const attempt = await request(app.getHttpServer())
        .patch(`${API}/orders/${orderId}`)
        .set(user.auth)
        .send({ lineItems: [{ description: 'Rewritten', quantity: 1, unitPrice: '1.00' }] })
        .expect(409);

      expect(attempt.body.code).toBe('ORDER_LOCKED');
    });

    it('refuses to delete an order that was paid and then fully refunded', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);
      await refund(orderId, { amount: '400.00' }).expect(201);

      await request(app.getHttpServer())
        .delete(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(409);
    });
  });

  describe('audit trail', () => {
    it('records a refund_recorded event and the status change it caused', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);
      const response = await refund(orderId, { amount: '250.00' }).expect(201);

      const events = response.body.order.events as Array<{
        eventType: string;
        fromStatus: string | null;
        toStatus: string | null;
        amountCents: number | null;
      }>;

      expect(events[0]).toMatchObject({
        eventType: 'status_changed',
        fromStatus: 'paid',
        toStatus: 'partially_paid',
      });
      expect(events[1]).toMatchObject({
        eventType: 'refund_recorded',
        amountCents: -25_000,
      });
    });
  });

  describe('safety', () => {
    it('is idempotent when replayed with the same key', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);
      const key = 'refund-retry-key';

      const first = await request(app.getHttpServer())
        .post(`${API}/orders/${orderId}/refunds`)
        .set(user.auth)
        .set('Idempotency-Key', key)
        .send({ amount: '250.00' })
        .expect(201);

      const replay = await request(app.getHttpServer())
        .post(`${API}/orders/${orderId}/refunds`)
        .set(user.auth)
        .set('Idempotency-Key', key)
        .send({ amount: '250.00' })
        .expect(201);

      expect(replay.body.replayed).toBe(true);
      expect(replay.body.payment.id).toBe(first.body.payment.id);
      expect(replay.body.order.amountPaidCents).toBe(75_000);
    });

    it('never lets concurrent refunds return more than was collected', async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '1000.00' }).expect(201);

      const results = await Promise.all(
        Array.from({ length: 4 }, () => refund(orderId, { amount: '400.00' })),
      );

      // $1,000 collected, $400 each: at most two can fit.
      expect(results.filter((result) => result.status === 201)).toHaveLength(2);

      const final = await request(app.getHttpServer())
        .get(`${API}/orders/${orderId}`)
        .set(user.auth)
        .expect(200);

      expect(final.body.amountPaidCents).toBe(20_000);
      expect(final.body.amountPaidCents).toBeGreaterThanOrEqual(0);
    });

    it("hides another user's order from the refund route", async () => {
      const orderId = await createOrder();
      await pay(orderId, { amount: '400.00' }).expect(201);
      const intruder = await signUp(app);

      await request(app.getHttpServer())
        .post(`${API}/orders/${orderId}/refunds`)
        .set(intruder.auth)
        .send({ amount: '100.00' })
        .expect(404);
    });
  });
});
