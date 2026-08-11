import { Injectable } from '@nestjs/common';
import type { OrderStatus } from '@orders/shared';

import { DatabaseService, type SqlExecutor } from '../database/database.service';

export interface OrderSummaryRow {
  id: number;
  customer_name: string;
  /** `YYYY-MM-DD` — see pg-type-parsers for why this is a string and not a Date. */
  due_date: string;
  subtotal_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  amount_due_cents: number;
  status: OrderStatus;
  is_overdue: boolean;
  is_locked: boolean;
  line_item_count: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface OrderListRow extends OrderSummaryRow {
  /** Size of the filtered set before LIMIT, from `count(*) OVER ()`. */
  total_count: number;
}

export interface OrderLockRow {
  id: number;
  user_id: number;
  customer_name: string;
  due_date: string;
  subtotal_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  /** Every settlement ever recorded. Non-zero means the order is locked. */
  settlement_count: number;
  version: number;
}

export interface LineItemRow {
  id: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  sort_order: number;
}

export interface LineItemWithOrderRow extends LineItemRow {
  order_id: number;
}

export interface StatusBucketRow {
  status: OrderStatus;
  order_count: number;
  total_cents: number;
  amount_paid_cents: number;
  amount_due_cents: number;
}

export interface LineItemInsert {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ListFilters {
  status: OrderStatus | null;
  search: string | null;
  limit: number;
  offset: number;
  sort: string;
  direction: string;
}

/**
 * Parameter binding for the statements in `database/sql/orders` and `database/sql/line_items`.
 *
 * Every method takes an optional executor so the same code runs standalone or inside a
 * transaction — creating an order needs four statements to succeed or fail together, while
 * reading one needs no transaction at all.
 */
@Injectable()
export class OrdersRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(
    tx: SqlExecutor,
    userId: number,
    customerName: string,
    dueDate: string,
  ): Promise<number> {
    const row = await tx.runOne<{ id: number }>('orders/insert', [userId, customerName, dueDate]);

    if (!row) {
      throw new Error('Order insert returned no row.');
    }

    return row.id;
  }

  /**
   * One statement for the whole set, via parallel arrays. See line_items/insert.sql for why
   * this is not a loop.
   */
  insertLineItems(tx: SqlExecutor, orderId: number, items: LineItemInsert[]): Promise<LineItemRow[]> {
    return tx.run<LineItemRow>('line_items/insert', [
      orderId,
      items.map((item) => item.description),
      items.map((item) => item.quantity),
      items.map((item) => item.unitPriceCents),
      items.map((_item, index) => index),
    ]);
  }

  async deleteLineItems(tx: SqlExecutor, orderId: number): Promise<void> {
    await tx.run('line_items/delete_by_order', [orderId]);
  }

  /** Recomputes subtotal and total from the stored lines. Never trusts a client-supplied total. */
  recalculateTotals(
    tx: SqlExecutor,
    orderId: number,
    userId: number,
  ): Promise<{ id: number; subtotal_cents: number; total_cents: number; version: number } | null> {
    return tx.runOne('orders/recalculate_totals', [orderId, userId]);
  }

  /**
   * Reads the order and holds its row until the transaction ends. The lock is what makes
   * concurrent payments safe; see lock_for_update.sql.
   */
  lockForUpdate(tx: SqlExecutor, orderId: number, userId: number): Promise<OrderLockRow | null> {
    return tx.runOne<OrderLockRow>('orders/lock_for_update', [orderId, userId]);
  }

  findById(orderId: number, userId: number, tx: SqlExecutor = this.db): Promise<OrderSummaryRow | null> {
    return tx.runOne<OrderSummaryRow>('orders/find_by_id', [orderId, userId]);
  }

  findByUser(userId: number, filters: ListFilters): Promise<OrderListRow[]> {
    return this.db.run<OrderListRow>('orders/find_by_user', [
      userId,
      filters.status,
      filters.search,
      filters.limit,
      filters.offset,
      filters.sort,
      filters.direction,
    ]);
  }

  findLineItems(orderId: number, tx: SqlExecutor = this.db): Promise<LineItemRow[]> {
    return tx.run<LineItemRow>('line_items/find_by_order', [orderId]);
  }

  /** Batched fetch so listing N orders with their lines costs 2 queries, not N + 1. */
  findLineItemsForOrders(orderIds: number[]): Promise<LineItemWithOrderRow[]> {
    if (orderIds.length === 0) return Promise.resolve([]);
    return this.db.run<LineItemWithOrderRow>('line_items/find_by_orders', [orderIds]);
  }

  updateDetails(
    tx: SqlExecutor,
    orderId: number,
    userId: number,
    customerName: string | null,
    dueDate: string | null,
  ): Promise<{ id: number; version: number } | null> {
    return tx.runOne('orders/update_details', [orderId, userId, customerName, dueDate]);
  }

  /** Returns null when nothing was deleted — wrong owner, or the order has payments. */
  remove(orderId: number, userId: number, tx: SqlExecutor = this.db): Promise<{ id: number } | null> {
    return tx.runOne<{ id: number }>('orders/delete', [orderId, userId]);
  }

  dashboardSummary(userId: number): Promise<StatusBucketRow[]> {
    return this.db.run<StatusBucketRow>('orders/dashboard_summary', [userId]);
  }
}
