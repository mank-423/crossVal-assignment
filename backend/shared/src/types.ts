/**
 * The API contract, declared once and imported by both sides.
 *
 * The web client builds its requests from these types and reads its responses through them,
 * so a change to the API surface breaks the frontend build rather than production.
 */

import type { OrderStatus } from './status';

/* ------------------------------------------------------------------ *
 * Domain resources
 * ------------------------------------------------------------------ */

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  position: number;
}

export const SETTLEMENT_KINDS = ['payment', 'refund'] as const;

export type SettlementKind = (typeof SETTLEMENT_KINDS)[number];

/**
 * One movement of money against an order.
 *
 * A refund is the same record with `kind: 'refund'` and a negative `amountCents`, so payment
 * history is a single ordered list and the running balance stays a plain sum.
 */
export interface Payment {
  id: string;
  orderId: string;
  /** Positive for a payment, negative for a refund. */
  amountCents: number;
  /** Calendar date, `YYYY-MM-DD`. */
  paidOn: string;
  note: string | null;
  kind: SettlementKind;
  createdAt: string;
}

export const ORDER_EVENT_TYPES = [
  'order_created',
  'order_updated',
  'payment_recorded',
  'refund_recorded',
  'status_changed',
  'order_deleted',
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export interface OrderEvent {
  id: string;
  orderId: string;
  eventType: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  paymentId: string | null;
  amountCents: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  customerName: string;
  /** Calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  subtotalCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  status: OrderStatus;
  /**
   * Past due and unsettled. Reported separately from `status` because an order can be both
   * partially paid and overdue, and a single enum cannot say so.
   */
  isOverdue: boolean;
  /** Line items are read-only once any payment exists. */
  isLocked: boolean;
  lineItemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderSummary {
  lineItems: LineItem[];
  payments: Payment[];
  events: OrderEvent[];
}

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

export interface LineItemInput {
  description: string;
  quantity: number;
  /** Decimal string or number, e.g. `"500.00"`. Converted to cents server-side. */
  unitPrice: string | number;
}

export interface CreateOrderRequest {
  customerName: string;
  dueDate: string;
  lineItems: LineItemInput[];
}

export interface UpdateOrderRequest {
  customerName?: string;
  dueDate?: string;
  /** Rejected with `ORDER_LOCKED` once the order has a payment against it. */
  lineItems?: LineItemInput[];
}

export interface CreatePaymentRequest {
  /** Decimal string or number, e.g. `"400.00"`. */
  amount: string | number;
  /** Calendar date, `YYYY-MM-DD`. Defaults to today. */
  paidOn?: string;
  note?: string;
}

export interface CreateRefundRequest {
  /**
   * Positive decimal amount to return, e.g. `"200.00"`. The API stores it negated; the caller
   * never has to reason about the sign.
   */
  amount: string | number;
  /** Calendar date, `YYYY-MM-DD`. Defaults to today. */
  refundedOn?: string;
  note?: string;
}

export interface ListOrdersQuery {
  status?: OrderStatus;
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'due_date' | 'created_at' | 'total' | 'amount_due';
  direction?: 'asc' | 'desc';
}

export interface SignUpRequest {
  email: string;
  password: string;
}

export type SignInRequest = SignUpRequest;

/* ------------------------------------------------------------------ *
 * Responses
 * ------------------------------------------------------------------ */

export interface AuthenticatedUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

/**
 * Returned by both the payment and refund endpoints. `payment.kind` says which happened —
 * a refund is a settlement row like any other.
 */
export interface RecordPaymentResponse {
  payment: Payment;
  /** The order after the payment, so the client re-renders from one authoritative read. */
  order: OrderDetail;
  /**
   * True when an `Idempotency-Key` matched an existing payment and nothing new was recorded.
   * The payment and order returned are the originals.
   */
  replayed: boolean;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface StatusBucket {
  status: OrderStatus;
  count: number;
  totalCents: number;
  amountDueCents: number;
}

export interface DashboardSummary {
  orderCount: number;
  totalInvoicedCents: number;
  totalCollectedCents: number;
  totalOutstandingCents: number;
  overdueCount: number;
  overdueAmountCents: number;
  byStatus: StatusBucket[];
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_REGISTERED',
  'UNAUTHENTICATED',
  'ORDER_NOT_FOUND',
  'ORDER_LOCKED',
  'OVERPAYMENT_REJECTED',
  'REFUND_EXCEEDS_COLLECTED',
  'IDEMPOTENCY_KEY_REUSED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every non-2xx response from the API has exactly this shape. */
export interface ApiErrorResponse {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  /** What the caller can do about it — surfaced verbatim in the UI. */
  hint?: string;
  /** Machine-readable specifics, e.g. the maximum payment currently allowed. */
  details?: Record<string, unknown>;
  /** Per-field messages when `code` is `VALIDATION_FAILED`. */
  fieldErrors?: Record<string, string[]>;
  path: string;
  timestamp: string;
}
