import { Injectable } from '@nestjs/common';
import type { OrderDetail } from '@orders/shared';

import { OrderNotFoundError } from '../common/errors/app-error';
import { DatabaseService, type SqlExecutor } from '../database/database.service';
import { PaymentsRepository } from '../payments/payments.repository';
import { OrderEventsRepository } from './order-events.repository';
import { toLineItem, toOrderEvent, toOrderSummary, toPayment } from './order.mapper';
import { OrdersRepository } from './orders.repository';

/**
 * Assembles the full order view: header, line items, payment history, audit trail.
 *
 * Lives on its own because both OrdersService and PaymentsService return it — creating an
 * order, updating one, and recording a payment all answer with the same shape. Keeping one
 * copy means the detail response cannot differ depending on which endpoint produced it.
 */
@Injectable()
export class OrderDetailService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly payments: PaymentsRepository,
    private readonly events: OrderEventsRepository,
    private readonly db: DatabaseService,
  ) {}

  /**
   * The four reads run one after another, not through Promise.all.
   *
   * Inside a transaction, `tx` is a single connection. A pooled connection can only execute
   * one statement at a time, so firing them concurrently just queues them behind each other
   * while relying on driver behaviour that node-postgres has deprecated. Sequential is what
   * actually happens either way; this makes it explicit and keeps working on pg 9.
   */
  async load(orderId: number, userId: number, executor: SqlExecutor = this.db): Promise<OrderDetail> {
    const order = await this.orders.findById(orderId, userId, executor);

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    const lineItems = await this.orders.findLineItems(orderId, executor);
    const payments = await this.payments.findByOrder(orderId, executor);
    const events = await this.events.findByOrder(orderId, executor);

    return {
      ...toOrderSummary(order),
      lineItems: lineItems.map(toLineItem),
      payments: payments.map(toPayment),
      events: events.map(toOrderEvent),
    };
  }
}
