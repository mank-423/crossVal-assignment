import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Payment, RecordPaymentResponse } from '@orders/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { PaymentsService } from './payments.service';

/**
 * Payments hang off an order rather than living at `/payments`: a payment has no meaning
 * without the order it settles, and the nested path makes the ownership check unavoidable.
 */
@Controller('orders/:orderId/payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  record(
    @CurrentUser() user: RequestUser,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CreatePaymentDto,
    /**
     * Optional. When supplied, retrying the same request — a dropped response, a
     * double-clicked submit button — returns the original payment instead of recording a
     * second one.
     */
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<RecordPaymentResponse> {
    return this.payments.record(user.id, orderId, dto, idempotencyKey?.trim() || undefined);
  }

  /** Payments and refunds together, in the order they happened. */
  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<Payment[]> {
    return this.payments.listForOrder(user.id, orderId);
  }
}

/**
 * Refunds get their own path rather than a `kind` field on the payment endpoint. Returning
 * money is a distinct action with a distinct limit, and a client should not be one mistyped
 * enum away from it.
 */
@Controller('orders/:orderId/refunds')
@UseGuards(JwtAuthGuard)
export class RefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  record(
    @CurrentUser() user: RequestUser,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CreateRefundDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<RecordPaymentResponse> {
    return this.payments.refund(user.id, orderId, dto, idempotencyKey?.trim() || undefined);
  }
}
