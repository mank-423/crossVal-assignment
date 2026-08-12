import { HttpStatus, Injectable } from '@nestjs/common';
import {
  deriveOrderStatus,
  formatMoney,
  toCents,
  type DashboardSummary,
  type OrderDetail,
  type OrderStatus,
  type OrderSummary,
  type Paginated,
  type StatusBucket,
  ORDER_STATUSES,
} from '../shared';

import { AppError, OrderLockedError, OrderNotFoundError } from '../common/errors/app-error';
import { DatabaseService } from '../database/database.service';
import { CreateOrderDto, LineItemDto, UpdateOrderDto } from './dto/order.dto';
import { ListOrdersQuery } from './dto/list-orders.query';
import { OrderDetailService } from './order-detail.service';
import { OrderEventsRepository } from './order-events.repository';
import { toOrderSummary } from './order.mapper';
import {
  OrdersRepository,
  type LineItemInsert,
  type OrderLockRow,
  type OrderSummaryRow,
} from './orders.repository';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly events: OrderEventsRepository,
    private readonly detail: OrderDetailService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Create an order and its lines atomically.
   *
   * Four statements have to agree: the order row, its lines, the recomputed totals, and the
   * audit event. A partial failure that left an order with no lines would show a $0 total that
   * reads as `paid`, so the whole thing is one transaction.
   */
  async create(userId: number, dto: CreateOrderDto): Promise<OrderDetail> {
    const items = toLineItemInserts(dto.lineItems);
    assertOrderHasValue(items);

    return this.db.transaction(async (tx) => {
      const orderId = await this.orders.create(tx, userId, dto.customerName, dto.dueDate);

      await this.orders.insertLineItems(tx, orderId, items);
      const totals = await this.orders.recalculateTotals(tx, orderId, userId);

      if (!totals) {
        throw new Error(`Failed to compute totals for order ${orderId}.`);
      }

      await this.events.append(tx, {
        orderId,
        userId,
        eventType: 'order_created',
        toStatus: deriveOrderStatus({
          totalCents: totals.total_cents,
          amountPaidCents: 0,
          dueDate: dto.dueDate,
        }),
        amountCents: totals.total_cents,
        metadata: {
          customerName: dto.customerName,
          dueDate: dto.dueDate,
          lineItemCount: items.length,
        },
      });

      return this.detail.load(orderId, userId, tx);
    });
  }

  async findAll(userId: number, query: ListOrdersQuery): Promise<Paginated<OrderSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    const rows = await this.orders.findByUser(userId, {
      status: query.status ?? null,
      search: query.search || null,
      limit,
      offset: (page - 1) * limit,
      sort: query.sort ?? 'due_date',
      direction: query.direction ?? 'asc',
    });

    // count(*) OVER () is identical on every row, so an empty page means an empty result set.
    const total = rows[0]?.total_count ?? 0;

    return {
      data: rows.map(toOrderSummary),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(userId: number, orderId: number): Promise<OrderDetail> {
    return this.detail.load(orderId, userId);
  }

  /**
   * Update an order.
   *
   * Customer name and due date remain editable for the order's whole life. Line items do not:
   * once a payment exists, the total it was validated against is frozen. Rewriting the lines
   * afterwards could drop the total below what has already been collected, leaving an order
   * that is overpaid by construction — which the database would refuse anyway, as a 500
   * instead of a comprehensible error.
   */
  async update(userId: number, orderId: number, dto: UpdateOrderDto): Promise<OrderDetail> {
    const replacementItems = dto.lineItems ? toLineItemInserts(dto.lineItems) : null;

    if (replacementItems) {
      assertOrderHasValue(replacementItems);
    }

    return this.db.transaction(async (tx) => {
      // Locked for the duration: an update and a concurrent payment must not interleave
      // between the lock check and the write.
      const current = await this.orders.lockForUpdate(tx, orderId, userId);

      if (!current) {
        throw new OrderNotFoundError(orderId);
      }

      // Locked by settlement history, not by the current balance: an order that was paid and
      // then fully refunded has a zero balance but must not become editable again.
      if (replacementItems && current.settlement_count > 0) {
        throw new OrderLockedError(orderId, current.amount_paid_cents);
      }

      const previousStatus = statusOf(current);
      const changed: Record<string, unknown> = {};

      if (dto.customerName !== undefined || dto.dueDate !== undefined) {
        await this.orders.updateDetails(
          tx,
          orderId,
          userId,
          dto.customerName ?? null,
          dto.dueDate ?? null,
        );

        if (dto.customerName !== undefined && dto.customerName !== current.customer_name) {
          changed.customerName = { from: current.customer_name, to: dto.customerName };
        }
        if (dto.dueDate !== undefined && dto.dueDate !== current.due_date) {
          changed.dueDate = { from: current.due_date, to: dto.dueDate };
        }
      }

      if (replacementItems) {
        // Replace-all rather than diff: see line_items/delete_by_order.sql.
        await this.orders.deleteLineItems(tx, orderId);
        await this.orders.insertLineItems(tx, orderId, replacementItems);
        const totals = await this.orders.recalculateTotals(tx, orderId, userId);

        if (totals && totals.total_cents !== current.total_cents) {
          changed.totalCents = { from: current.total_cents, to: totals.total_cents };
        }
        changed.lineItemCount = replacementItems.length;
      }

      const updated = await this.orders.findById(orderId, userId, tx);

      if (!updated) {
        throw new OrderNotFoundError(orderId);
      }

      await this.events.append(tx, {
        orderId,
        userId,
        eventType: 'order_updated',
        fromStatus: previousStatus,
        toStatus: updated.status,
        metadata: { changed },
      });

      // A due-date edit can move an order between overdue and pending without any money
      // moving, which is worth its own entry in the timeline.
      if (updated.status !== previousStatus) {
        await this.events.append(tx, {
          orderId,
          userId,
          eventType: 'status_changed',
          fromStatus: previousStatus,
          toStatus: updated.status,
          metadata: { reason: 'order_updated' },
        });
      }

      return this.detail.load(orderId, userId, tx);
    });
  }

  /**
   * Delete an order.
   *
   * Refused once any settlement exists — payment or refund. That is what keeps a hard delete
   * defensible: an order money has never moved against has no financial history, so cascading
   * its lines and audit events away destroys nothing anyone can be asked to account for.
   */
  async remove(userId: number, orderId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await this.orders.lockForUpdate(tx, orderId, userId);

      if (!current) {
        throw new OrderNotFoundError(orderId);
      }

      if (current.settlement_count > 0) {
        throw new OrderLockedError(orderId, current.amount_paid_cents);
      }

      const deleted = await this.orders.remove(orderId, userId, tx);

      if (!deleted) {
        throw new OrderNotFoundError(orderId);
      }

      // No `order_deleted` event is written: order_events cascades with the order, so the row
      // would be removed by the same statement that created it. The event type exists for the
      // soft-delete path described in the README's future-work section.
    });
  }

  async summary(userId: number): Promise<DashboardSummary> {
    const rows = await this.orders.dashboardSummary(userId);

    const byStatus: StatusBucket[] = ORDER_STATUSES.map((status: any) => {
      const row = rows.find((candidate) => candidate.status === status);
      return {
        status,
        count: row?.order_count ?? 0,
        totalCents: row?.total_cents ?? 0,
        amountDueCents: row?.amount_due_cents ?? 0,
      };
    });

    const overdue = byStatus.find((bucket) => bucket.status === 'overdue');

    return {
      orderCount: sum(rows.map((row) => row.order_count)),
      totalInvoicedCents: sum(rows.map((row) => row.total_cents)),
      totalCollectedCents: sum(rows.map((row) => row.amount_paid_cents)),
      totalOutstandingCents: sum(rows.map((row) => row.amount_due_cents)),
      overdueCount: overdue?.count ?? 0,
      overdueAmountCents: overdue?.amountDueCents ?? 0,
      byStatus,
    };
  }

}

function toLineItemInserts(items: LineItemDto[]): LineItemInsert[] {
  return items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    // Validated by @IsMoneyAmount before reaching here, so this cannot throw.
    unitPriceCents: toCents(item.unitPrice),
  }));
}

/**
 * A zero-total order would satisfy `amount_paid >= total` on day one and present as `paid`
 * without anyone paying anything. Rejected at the boundary so that state cannot exist.
 */
function assertOrderHasValue(items: LineItemInsert[]): void {
  const total = sum(items.map((item) => item.quantity * item.unitPriceCents));

  if (total <= 0) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: `Order total must be greater than ${formatMoney(0)}.`,
      hint: 'Give at least one line item a unit price above zero.',
      details: { computedTotalCents: total },
    });
  }
}

function statusOf(order: OrderLockRow | OrderSummaryRow): OrderStatus {
  return deriveOrderStatus({
    totalCents: order.total_cents,
    amountPaidCents: order.amount_paid_cents,
    dueDate: order.due_date,
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
