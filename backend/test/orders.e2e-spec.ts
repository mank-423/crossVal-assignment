import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, isoDate, resetDatabase, sampleOrder, signUp, TestUser } from './helpers/test-app';

describe('Orders (e2e)', () => {
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

  const post = () => request(app.getHttpServer()).post(`${API}/orders`).set(user.auth);
  const get = (path = '') => request(app.getHttpServer()).get(`${API}/orders${path}`).set(user.auth);

  describe('create', () => {
    it('computes the subtotal and total from the line items', async () => {
      const response = await post().send(sampleOrder()).expect(201);

      expect(response.body).toMatchObject({
        customerName: 'Acme Industries',
        subtotalCents: 100_000,
        totalCents: 100_000,
        amountPaidCents: 0,
        amountDueCents: 100_000,
        status: 'pending',
        isOverdue: false,
        isLocked: false,
        lineItemCount: 1,
      });
      expect(response.body.lineItems[0].lineTotalCents).toBe(100_000);
    });

    it('sums several lines with different quantities', async () => {
      const response = await post()
        .send(
          sampleOrder({
            lineItems: [
              { description: 'Design', quantity: 3, unitPrice: '250.50' },
              { description: 'Hosting', quantity: 12, unitPrice: '19.99' },
              { description: 'Free support', quantity: 1, unitPrice: '0' },
            ],
          }),
        )
        .expect(201);

      // 3 x 250.50 = 751.50, 12 x 19.99 = 239.88 -> 991.38
      expect(response.body.totalCents).toBe(99_138);
    });

    /**
     * The client's arithmetic is never trusted: totals are recomputed from the stored line
     * items, which are themselves generated columns.
     */
    it('ignores any total the client tries to supply', async () => {
      const response = await post()
        .send({ ...sampleOrder(), totalCents: 1 })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('records an order_created audit event', async () => {
      const response = await post().send(sampleOrder()).expect(201);

      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0]).toMatchObject({
        eventType: 'order_created',
        fromStatus: null,
        toStatus: 'pending',
        amountCents: 100_000,
      });
    });

    it('rejects an order with no line items', async () => {
      const response = await post().send(sampleOrder({ lineItems: [] })).expect(422);
      expect(response.body.fieldErrors.lineItems).toBeDefined();
    });

    it('rejects a quantity below 1', async () => {
      const response = await post()
        .send(sampleOrder({ lineItems: [{ description: 'X', quantity: 0, unitPrice: '10.00' }] }))
        .expect(422);

      expect(response.body.fieldErrors['lineItems.0.quantity']).toBeDefined();
    });

    it('rejects more than two decimal places on a price', async () => {
      const response = await post()
        .send(sampleOrder({ lineItems: [{ description: 'X', quantity: 1, unitPrice: '10.999' }] }))
        .expect(422);

      expect(response.body.fieldErrors['lineItems.0.unitPrice']).toBeDefined();
    });

    /**
     * A zero-total order satisfies `paid >= total` immediately and would present as settled
     * without anyone paying. Refused so that state cannot exist.
     */
    it('rejects an order whose lines come to zero', async () => {
      const response = await post()
        .send(sampleOrder({ lineItems: [{ description: 'Free', quantity: 2, unitPrice: '0' }] }))
        .expect(422);

      expect(response.body.message).toMatch(/greater than/i);
    });

    it('accepts a past due date and reports it as overdue', async () => {
      const response = await post().send(sampleOrder({ dueDate: isoDate(-5) })).expect(201);

      expect(response.body.status).toBe('overdue');
      expect(response.body.isOverdue).toBe(true);
    });

    it('rejects a timestamp where a calendar date is required', async () => {
      await post().send(sampleOrder({ dueDate: '2026-08-17T00:00:00Z' })).expect(422);
    });
  });

  describe('read', () => {
    it('returns line items, payments, and events on the detail route', async () => {
      const created = await post().send(sampleOrder()).expect(201);
      const response = await get(`/${created.body.id}`).expect(200);

      expect(response.body.lineItems).toHaveLength(1);
      expect(response.body.payments).toEqual([]);
      expect(response.body.events).toHaveLength(1);
    });

    it('returns 404 for an order that does not exist', async () => {
      const response = await get('/999999').expect(404);
      expect(response.body.code).toBe('ORDER_NOT_FOUND');
    });

    it('paginates and reports the unfiltered total', async () => {
      for (let index = 0; index < 5; index++) {
        await post().send(sampleOrder({ customerName: `Customer ${index}` })).expect(201);
      }

      const response = await get('?page=1&limit=2').expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
    });

    it('filters by status in the database', async () => {
      await post().send(sampleOrder({ customerName: 'Future' })).expect(201);
      await post().send(sampleOrder({ customerName: 'Late', dueDate: isoDate(-2) })).expect(201);

      const overdue = await get('?status=overdue').expect(200);

      expect(overdue.body.data).toHaveLength(1);
      expect(overdue.body.data[0].customerName).toBe('Late');
      expect(overdue.body.meta.total).toBe(1);
    });

    it('searches by customer name, case-insensitively', async () => {
      await post().send(sampleOrder({ customerName: 'Blue Harbour' })).expect(201);
      await post().send(sampleOrder({ customerName: 'Cedarwood' })).expect(201);

      const response = await get('?search=harbour').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].customerName).toBe('Blue Harbour');
    });

    it('rejects an unknown status filter', async () => {
      const response = await get('?status=nonsense').expect(422);
      expect(response.body.fieldErrors.status).toBeDefined();
    });
  });

  describe('update', () => {
    it('updates the customer and due date', async () => {
      const created = await post().send(sampleOrder()).expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${API}/orders/${created.body.id}`)
        .set(user.auth)
        .send({ customerName: 'Renamed Ltd', dueDate: isoDate(30) })
        .expect(200);

      expect(response.body.customerName).toBe('Renamed Ltd');
      expect(response.body.dueDate).toBe(isoDate(30));
    });

    it('replaces line items and recomputes the total', async () => {
      const created = await post().send(sampleOrder()).expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${API}/orders/${created.body.id}`)
        .set(user.auth)
        .send({ lineItems: [{ description: 'Revised', quantity: 1, unitPrice: '250.00' }] })
        .expect(200);

      expect(response.body.totalCents).toBe(25_000);
      expect(response.body.lineItems).toHaveLength(1);
    });

    it('logs a status change when a due date edit makes an order overdue', async () => {
      const created = await post().send(sampleOrder()).expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${API}/orders/${created.body.id}`)
        .set(user.auth)
        .send({ dueDate: isoDate(-1) })
        .expect(200);

      expect(response.body.status).toBe('overdue');
      expect(response.body.events.map((event: { eventType: string }) => event.eventType)).toContain(
        'status_changed',
      );
    });
  });

  describe('delete', () => {
    it('deletes an order that has no payments', async () => {
      const created = await post().send(sampleOrder()).expect(201);

      await request(app.getHttpServer())
        .delete(`${API}/orders/${created.body.id}`)
        .set(user.auth)
        .expect(204);

      await get(`/${created.body.id}`).expect(404);
    });
  });

  /**
   * Ownership is part of the SQL predicate, not a check in the service. These specs are the
   * proof: every route must behave as though another user's order simply does not exist.
   */
  describe('tenant isolation', () => {
    it("hides another user's order behind a 404 on every route", async () => {
      const created = await post().send(sampleOrder()).expect(201);
      const intruder = await signUp(app);
      const id = created.body.id;

      await request(app.getHttpServer()).get(`${API}/orders/${id}`).set(intruder.auth).expect(404);

      await request(app.getHttpServer())
        .patch(`${API}/orders/${id}`)
        .set(intruder.auth)
        .send({ customerName: 'Hijacked' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`${API}/orders/${id}`)
        .set(intruder.auth)
        .expect(404);

      await request(app.getHttpServer())
        .post(`${API}/orders/${id}/payments`)
        .set(intruder.auth)
        .send({ amount: '10.00' })
        .expect(404);

      await request(app.getHttpServer())
        .get(`${API}/orders/${id}/payments`)
        .set(intruder.auth)
        .expect(404);
    });

    it("excludes another user's orders from the list and the dashboard", async () => {
      await post().send(sampleOrder()).expect(201);
      const intruder = await signUp(app);

      const list = await request(app.getHttpServer())
        .get(`${API}/orders`)
        .set(intruder.auth)
        .expect(200);
      expect(list.body.data).toEqual([]);

      const summary = await request(app.getHttpServer())
        .get(`${API}/dashboard/summary`)
        .set(intruder.auth)
        .expect(200);
      expect(summary.body.orderCount).toBe(0);
    });

    it('requires authentication on every order route', async () => {
      await request(app.getHttpServer()).get(`${API}/orders`).expect(401);
      await request(app.getHttpServer()).post(`${API}/orders`).send(sampleOrder()).expect(401);
      await request(app.getHttpServer()).get(`${API}/dashboard/summary`).expect(401);
    });
  });
});
