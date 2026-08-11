import { Injectable, Logger } from '@nestjs/common';
import {
  deriveOrderStatus,
  formatMoney,
  todayIsoDate,
  toCents,
  type OrderStatus,
  type Payment,
  type RecordPaymentResponse,
  type SettlementKind,
} from '@orders/shared';

import {
  OrderNotFoundError,
  OverpaymentError,
  RefundExceedsCollectedError,
} from '../common/errors/app-error';
import { DatabaseService, isPgError, PG_ERROR, type SqlExecutor } from '../database/database.service';
import { OrderDetailService } from '../orders/order-detail.service';
import { OrderEventsRepository } from '../orders/order-events.repository';
import { toPayment } from '../orders/order.mapper';
import { OrdersRepository, type OrderLockRow } from '../orders/orders.repository';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { PaymentsRepository, type PaymentRow } from './payments.repository';

interface SettlementInput {
  kind: SettlementKind;
  /** Signed: positive for a payment, negative for a refund. */
  amountCents: number;
  paidOn: string;
  note: string | null;
  idempotencyKey?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersRepository,
    private readonly events: OrderEventsRepository,
    private readonly detail: OrderDetailService,
    private readonly db: DatabaseService,
  ) {}

  /** Record a payment against an order. */
  record(
    userId: number,
    orderId: number,
    dto: CreatePaymentDto,
    idempotencyKey?: string,
  ): Promise<RecordPaymentResponse> {
    return this.settle(userId, orderId, {
      kind: 'payment',
      // Safe: @IsMoneyAmount already proved this converts.
      amountCents: toCents(dto.amount),
      paidOn: dto.paidOn ?? todayIsoDate(),
      note: dto.note?.trim() || null,
      idempotencyKey,
    });
  }

  /**
   * Record a refund against an order.
   *
   * The caller states a positive sum; it is negated here so that everything downstream — the
   * balance update, the constraints, the status derivation — is the same arithmetic as a
   * payment with the sign flipped. There is no separate refund code path to keep correct.
   */
  refund(
    userId: number,
    orderId: number,
    dto: CreateRefundDto,
    idempotencyKey?: string,
  ): Promise<RecordPaymentResponse> {
    return this.settle(userId, orderId, {
      kind: 'refund',
      amountCents: -toCents(dto.amount),
      paidOn: dto.refundedOn ?? todayIsoDate(),
      note: dto.note?.trim() || null,
      idempotencyKey,
    });
  }

  /**
   * Move money against an order, in either direction.
   *
   * One transaction, opening with a row lock. That ordering is the whole concurrency story:
   *
   *   1. `SELECT ... FOR UPDATE` — a second settlement for the same order blocks here
   *   2. validate the amount against the balance just read
   *   3. insert the settlement row
   *   4. move the order's running total
   *   5. append the audit events
   *
   * Two $600 payments against a $1,000 order with $400 paid cannot both succeed: the second
   * does not reach step 2 until the first has committed, so it reads $1,000 paid and is
   * rejected. Without the lock, both would read $400, both would pass, and the order would end
   * up $200 overpaid. Refunds race against payments through exactly the same gate.
   */
  private async settle(
    userId: number,
    orderId: number,
    input: SettlementInput,
  ): Promise<RecordPaymentResponse> {
    const { idempotencyKey } = input;

    try {
      return await this.db.transaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await this.payments.findByIdempotencyKey(orderId, idempotencyKey, tx);

          if (existing) {
            this.logger.log(`Replaying settlement ${existing.id} for idempotency key`);
            return this.buildResponse(existing, userId, orderId, tx, true);
          }
        }

        const order = await this.orders.lockForUpdate(tx, orderId, userId);

        if (!order) {
          throw new OrderNotFoundError(orderId);
        }

        this.assertWithinBounds(orderId, order, input);

        const fromStatus = statusOf(order);

        const settlement = await this.payments.insert(tx, {
          orderId,
          userId,
          amountCents: input.amountCents,
          paidOn: input.paidOn,
          note: input.note,
          idempotencyKey: idempotencyKey ?? null,
          kind: input.kind,
        });

        const applied = await this.payments.applyToOrder(tx, orderId, userId, input.amountCents);

        const toStatus = deriveOrderStatus({
          totalCents: applied.total_cents,
          amountPaidCents: applied.amount_paid_cents,
          dueDate: applied.due_date,
        });

        await this.events.append(tx, {
          orderId,
          userId,
          eventType: input.kind === 'refund' ? 'refund_recorded' : 'payment_recorded',
          fromStatus,
          toStatus,
          paymentId: settlement.id,
          amountCents: input.amountCents,
          metadata: {
            paidOn: settlement.paid_on,
            note: settlement.note,
            amountDueAfterCents: Math.max(0, applied.total_cents - applied.amount_paid_cents),
          },
        });

        // A refund can move an order out of `paid` just as a payment moves it in.
        if (toStatus !== fromStatus) {
          await this.events.append(tx, {
            orderId,
            userId,
            eventType: 'status_changed',
            fromStatus,
            toStatus,
            paymentId: settlement.id,
            metadata: { reason: input.kind === 'refund' ? 'refund_recorded' : 'payment_recorded' },
          });
        }

        return this.buildResponse(settlement, userId, orderId, tx, false);
      });
    } catch (error) {
      /*
       * Two identical requests can both pass the idempotency lookup before either inserts —
       * separate transactions, neither seeing the other's uncommitted row. The unique index
       * decides; the loser lands here and returns the winner's settlement, which is exactly
       * what an idempotent retry should get.
       */
      if (idempotencyKey && isPgError(error, PG_ERROR.UNIQUE_VIOLATION)) {
        const existing = await this.payments.findByIdempotencyKey(orderId, idempotencyKey);

        if (existing) {
          return this.db.transaction((tx) =>
            this.buildResponse(existing, userId, orderId, tx, true),
          );
        }
      }

      throw error;
    }
  }

  /**
   * The two directions have mirrored ceilings, both of which the database also enforces:
   * a payment may not exceed what is still due, a refund may not exceed what was collected.
   * Checking here is what turns a constraint violation into an error that names the limit.
   */
  private assertWithinBounds(
    orderId: number,
    order: OrderLockRow,
    input: SettlementInput,
  ): void {
    if (input.kind === 'payment') {
      const maxAllowedCents = order.total_cents - order.amount_paid_cents;

      if (input.amountCents > maxAllowedCents) {
        throw new OverpaymentError({
          orderId,
          attemptedCents: input.amountCents,
          totalCents: order.total_cents,
          amountPaidCents: order.amount_paid_cents,
          formatted: {
            attempted: formatMoney(input.amountCents),
            maxAllowed: formatMoney(Math.max(0, maxAllowedCents)),
            total: formatMoney(order.total_cents),
            paid: formatMoney(order.amount_paid_cents),
          },
        });
      }

      return;
    }

    const requestedCents = Math.abs(input.amountCents);

    if (requestedCents > order.amount_paid_cents) {
      throw new RefundExceedsCollectedError({
        orderId,
        attemptedCents: requestedCents,
        amountPaidCents: order.amount_paid_cents,
        formatted: {
          attempted: formatMoney(requestedCents),
          maxAllowed: formatMoney(order.amount_paid_cents),
        },
      });
    }
  }

  listForOrder(userId: number, orderId: number): Promise<Payment[]> {
    return this.db.transaction(async (tx) => {
      // Confirms ownership before returning anything: without it, any authenticated user could
      // read any order's payment history by guessing an id.
      const order = await this.orders.findById(orderId, userId, tx);

      if (!order) {
        throw new OrderNotFoundError(orderId);
      }

      const rows = await this.payments.findByOrder(orderId, tx);
      return rows.map(toPayment);
    });
  }

  private async buildResponse(
    settlement: PaymentRow,
    userId: number,
    orderId: number,
    tx: SqlExecutor,
    replayed: boolean,
  ): Promise<RecordPaymentResponse> {
    return {
      payment: toPayment(settlement),
      order: await this.detail.load(orderId, userId, tx),
      replayed,
    };
  }
}

function statusOf(order: OrderLockRow): OrderStatus {
  return deriveOrderStatus({
    totalCents: order.total_cents,
    amountPaidCents: order.amount_paid_cents,
    dueDate: order.due_date,
  });
}
