import { Injectable } from '@nestjs/common';
import type { OrderEventType, OrderStatus } from '../shared';

import { DatabaseService, type SqlExecutor } from '../database/database.service';

export interface OrderEventRow {
  id: number;
  order_id: number;
  user_id: number | null;
  event_type: OrderEventType;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  payment_id: number | null;
  amount_cents: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface AppendEventParams {
  orderId: number;
  userId: number | null;
  eventType: OrderEventType;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  paymentId?: number | null;
  amountCents?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only writer for the audit log.
 *
 * `append` requires an executor rather than defaulting to the pool: an event must be written
 * in the same transaction as the change it records, and making the caller pass the
 * transaction handle is what prevents someone from accidentally logging a change that then
 * rolls back.
 *
 * There is no update or delete method, by design.
 */
@Injectable()
export class OrderEventsRepository {
  constructor(private readonly db: DatabaseService) {}

  async append(tx: SqlExecutor, params: AppendEventParams): Promise<void> {
    await tx.run('events/insert', [
      params.orderId,
      params.userId,
      params.eventType,
      params.fromStatus ?? null,
      params.toStatus ?? null,
      params.paymentId ?? null,
      params.amountCents ?? null,
      JSON.stringify(params.metadata ?? {}),
    ]);
  }

  findByOrder(orderId: number, tx: SqlExecutor = this.db): Promise<OrderEventRow[]> {
    return tx.run<OrderEventRow>('events/find_by_order', [orderId]);
  }
}
