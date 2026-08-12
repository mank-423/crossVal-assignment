import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '../../shared';

export interface AppErrorOptions {
  code: ApiErrorCode;
  status: HttpStatus;
  message: string;
  /** What the caller can do about it. Surfaced to the user verbatim, so write it for a human. */
  hint?: string;
  /** Machine-readable specifics the client can act on, e.g. the maximum payment allowed. */
  details?: Record<string, unknown>;
}

/**
 * Base class for every failure this application raises deliberately.
 *
 * Carrying `code` and `hint` on the exception itself means the filter has nothing to infer:
 * the layer that knows why the request failed is the layer that says what to do about it.
 * The brief asks for validation errors with resolution hints, and this is the mechanism.
 */
export class AppError extends HttpException {
  readonly code: ApiErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.message, options.status);
    this.code = options.code;
    this.hint = options.hint;
    this.details = options.details;
  }
}

export class OrderNotFoundError extends AppError {
  constructor(orderId: string | number) {
    super({
      code: 'ORDER_NOT_FOUND',
      status: HttpStatus.NOT_FOUND,
      message: `No order with id ${orderId}.`,
      hint: 'Check the order id, or list your orders at GET /api/v1/orders.',
    });
  }
}

/**
 * Raised when line items are edited, or the order deleted, after money has been taken.
 *
 * 409 rather than 403: the caller is permitted to do this in general, but the order's current
 * state conflicts with the request.
 */
export class OrderLockedError extends AppError {
  constructor(orderId: string | number, amountPaidCents: number) {
    super({
      code: 'ORDER_LOCKED',
      status: HttpStatus.CONFLICT,
      message: 'Line items cannot be changed once a payment has been recorded against the order.',
      hint:
        'Customer name and due date can still be edited. To change what is owed, record a ' +
        'correcting payment or create a new order.',
      details: { orderId: String(orderId), amountPaidCents },
    });
  }
}

/**
 * Raised when a payment would push the order past its total.
 *
 * `maxAllowedCents` is included because the brief asks for an actionable error: telling the
 * user "too much" without telling them the ceiling makes them guess.
 */
export class OverpaymentError extends AppError {
  constructor(params: {
    orderId: string | number;
    attemptedCents: number;
    totalCents: number;
    amountPaidCents: number;
    formatted: { attempted: string; maxAllowed: string; total: string; paid: string };
  }) {
    const maxAllowedCents = Math.max(0, params.totalCents - params.amountPaidCents);

    super({
      code: 'OVERPAYMENT_REJECTED',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: `Payment of ${params.formatted.attempted} exceeds the amount due on this order.`,
      hint:
        maxAllowedCents === 0
          ? `This order is already fully paid (${params.formatted.total}). No further payment can be recorded.`
          : `The maximum payment allowed right now is ${params.formatted.maxAllowed}.`,
      details: {
        orderId: String(params.orderId),
        attemptedCents: params.attemptedCents,
        orderTotalCents: params.totalCents,
        amountPaidCents: params.amountPaidCents,
        maxAllowedCents,
      },
    });
  }
}

/**
 * Raised when a refund would return more than has actually been collected.
 *
 * The mirror image of OverpaymentError, and guarded by the same pair of constraints from the
 * other direction: `amount_paid_cents >= 0` would abort the transaction anyway, but the caller
 * deserves the ceiling rather than a constraint violation.
 */
export class RefundExceedsCollectedError extends AppError {
  constructor(params: {
    orderId: string | number;
    attemptedCents: number;
    amountPaidCents: number;
    formatted: { attempted: string; maxAllowed: string };
  }) {
    super({
      code: 'REFUND_EXCEEDS_COLLECTED',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: `Refund of ${params.formatted.attempted} is more than has been collected on this order.`,
      hint:
        params.amountPaidCents === 0
          ? 'Nothing has been collected on this order, so there is nothing to refund.'
          : `The maximum refund allowed right now is ${params.formatted.maxAllowed}.`,
      details: {
        orderId: String(params.orderId),
        attemptedCents: params.attemptedCents,
        amountPaidCents: params.amountPaidCents,
        maxAllowedCents: params.amountPaidCents,
      },
    });
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super({
      code: 'INVALID_CREDENTIALS',
      status: HttpStatus.UNAUTHORIZED,
      // Deliberately does not distinguish unknown email from wrong password: that difference
      // is a free account-enumeration oracle.
      message: 'Email or password is incorrect.',
      hint: 'Check the address and password, or sign up if you do not have an account yet.',
    });
  }
}

export class EmailAlreadyRegisteredError extends AppError {
  constructor(email: string) {
    super({
      code: 'EMAIL_ALREADY_REGISTERED',
      status: HttpStatus.CONFLICT,
      message: `An account already exists for ${email}.`,
      hint: 'Sign in instead, or use a different email address.',
    });
  }
}
