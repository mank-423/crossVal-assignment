import type { LineItem, OrderEvent, OrderSummary, Payment } from '@orders/shared';

import type { OrderEventRow } from './order-events.repository';
import type { LineItemRow, OrderSummaryRow } from './orders.repository';
import type { PaymentRow } from '../payments/payments.repository';

/**
 * Translates database rows into the public API shape.
 *
 * Two conversions happen here and nowhere else:
 *   * snake_case columns become camelCase fields
 *   * bigint ids become strings, because an id is an opaque handle and JSON numbers stop
 *     being exact past 2^53
 *
 * Keeping this in one place means a column rename touches the mapper and the SQL, not every
 * controller.
 */

export function toOrderSummary(row: OrderSummaryRow): OrderSummary {
  return {
    id: String(row.id),
    customerName: row.customer_name,
    dueDate: row.due_date,
    subtotalCents: row.subtotal_cents,
    totalCents: row.total_cents,
    amountPaidCents: row.amount_paid_cents,
    amountDueCents: row.amount_due_cents,
    status: row.status,
    isOverdue: row.is_overdue,
    isLocked: row.is_locked,
    lineItemCount: row.line_item_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toLineItem(row: LineItemRow): LineItem {
  return {
    id: String(row.id),
    description: row.description,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    lineTotalCents: row.line_total_cents,
    position: row.sort_order,
  };
}

export function toPayment(row: PaymentRow): Payment {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    amountCents: row.amount_cents,
    paidOn: row.paid_on,
    note: row.note,
    kind: row.kind,
    createdAt: row.created_at.toISOString(),
  };
}

export function toOrderEvent(row: OrderEventRow): OrderEvent {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    paymentId: row.payment_id === null ? null : String(row.payment_id),
    amountCents: row.amount_cents,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}
