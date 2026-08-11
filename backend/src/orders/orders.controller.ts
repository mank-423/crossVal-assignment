import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { DashboardSummary, OrderDetail, OrderSummary, Paginated } from '@orders/shared';

import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto, UpdateOrderDto } from './dto/order.dto';
import { ListOrdersQuery } from './dto/list-orders.query';
import { OrdersService } from './orders.service';

/**
 * Every route here is scoped to the authenticated user. The guard establishes who is asking;
 * the user id then travels into the SQL, so ownership is enforced by the query rather than by
 * a check that a future handler might forget.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateOrderDto): Promise<OrderDetail> {
    return this.orders.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: ListOrdersQuery,
  ): Promise<Paginated<OrderSummary>> {
    return this.orders.findAll(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderDetail> {
    return this.orders.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderDetail> {
    return this.orders.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.orders.remove(user.id, id);
  }
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly orders: OrdersService) {}

  /** Headline figures for the dashboard header, aggregated in one database round trip. */
  @Get('summary')
  summary(@CurrentUser() user: RequestUser): Promise<DashboardSummary> {
    return this.orders.summary(user.id);
  }
}
