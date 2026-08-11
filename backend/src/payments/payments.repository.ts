import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlExecutor } from '../database/database.service';

import type { SettlementKind } from '@orders/shared';

export interface PaymentRow {
  id: number;
  order_id: number;
  /** Positive for a payment, negative for a refund. */
  amount_cents: number;
  /** `YYYY-MM-DD`. */
  paid_on: string;
  note: string | null;
  kind: SettlementKind;
  created_at: Date;
}

export interface AppliedOrderRow {
  id: number;
  total_cents: number;
  amount_paid_cents: number;
  due_date: string;
  settlement_count: number;
  version: number;
}

export interface InsertPaymentParams {
  orderId: number;
  userId: number;
  /** Signed: the service negates a refund before it reaches here. */
  amountCents: number;
  paidOn: string;
  note: string | null;
  idempotencyKey: string | null;
  kind: SettlementKind;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async insert(tx: SqlExecutor, params: InsertPaymentParams): Promise<PaymentRow> {
    const row = await tx.runOne<PaymentRow>('payments/insert', [
      params.orderId,
      params.userId,
      params.amountCents,
      params.paidOn,
      params.note,
      params.idempotencyKey,
      params.kind,
    ]);

    if (!row) {
      throw new Error('Payment insert returned no row.');
    }

    return row;
  }

  /**
   * Moves the order's running total forward. Returns the post-update figures so the caller can
   * derive the new status without a second read.
   */
  async applyToOrder(
    tx: SqlExecutor,
    orderId: number,
    userId: number,
    amountCents: number,
  ): Promise<AppliedOrderRow> {
    const row = await tx.runOne<AppliedOrderRow>('payments/apply_to_order', [
      orderId,
      userId,
      amountCents,
    ]);

    if (!row) {
      throw new Error(`Failed to apply payment to order ${orderId}.`);
    }

    return row;
  }

  findByOrder(orderId: number, tx: SqlExecutor = this.db): Promise<PaymentRow[]> {
    return tx.run<PaymentRow>('payments/find_by_order', [orderId]);
  }

  findByIdempotencyKey(
    orderId: number,
    key: string,
    tx: SqlExecutor = this.db,
  ): Promise<PaymentRow | null> {
    return tx.runOne<PaymentRow>('payments/find_by_idempotency_key', [orderId, key]);
  }
}
