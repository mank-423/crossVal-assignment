import type {
  AuthResponse,
  AuthenticatedUser,
  CreateOrderRequest,
  CreatePaymentRequest,
  CreateRefundRequest,
  DashboardSummary,
  ListOrdersQuery,
  OrderDetail,
  OrderSummary,
  Paginated,
  Payment,
  RecordPaymentResponse,
  SignInRequest,
  SignUpRequest,
  UpdateOrderRequest,
} from '@orders/shared';

import { apiFetch } from './client';

/**
 * One function per endpoint, typed with the shared contract.
 *
 * Request and response types come from `@orders/shared`, which the API also compiles
 * against, so a change to the contract fails this build rather than showing up as an
 * undefined field at runtime.
 */

export const authApi = {
  signUp: (body: SignUpRequest) => apiFetch<AuthResponse>('/auth/signup', { method: 'POST', body }),
  signIn: (body: SignInRequest) => apiFetch<AuthResponse>('/auth/login', { method: 'POST', body }),
  me: () => apiFetch<AuthenticatedUser>('/auth/me'),
};

export const ordersApi = {
  list: (query: ListOrdersQuery = {}) =>
    apiFetch<Paginated<OrderSummary>>(`/orders${toQueryString(query)}`),

  get: (id: string) => apiFetch<OrderDetail>(`/orders/${id}`),

  create: (body: CreateOrderRequest) =>
    apiFetch<OrderDetail>('/orders', { method: 'POST', body }),

  update: (id: string, body: UpdateOrderRequest) =>
    apiFetch<OrderDetail>(`/orders/${id}`, { method: 'PATCH', body }),

  remove: (id: string) => apiFetch<void>(`/orders/${id}`, { method: 'DELETE' }),

  summary: () => apiFetch<DashboardSummary>('/dashboard/summary'),
};

export const paymentsApi = {
  list: (orderId: string) => apiFetch<Payment[]>(`/orders/${orderId}/payments`),

  /**
   * The idempotency key is generated per submission attempt, not per render, so a retry of
   * the same submission is recognised while a genuine second payment is not.
   */
  record: (orderId: string, body: CreatePaymentRequest, idempotencyKey: string) =>
    apiFetch<RecordPaymentResponse>(`/orders/${orderId}/payments`, {
      method: 'POST',
      body,
      idempotencyKey,
    }),

  /** Amount is stated positive; the API stores it negated. */
  refund: (orderId: string, body: CreateRefundRequest, idempotencyKey: string) =>
    apiFetch<RecordPaymentResponse>(`/orders/${orderId}/refunds`, {
      method: 'POST',
      body,
      idempotencyKey,
    }),
};

/**
 * Typed as `object` rather than `Record<string, unknown>` because an interface has no
 * implicit index signature, so the query DTOs would not be assignable.
 */
function toQueryString(query: object): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}
