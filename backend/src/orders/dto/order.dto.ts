import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';
import { IsMoneyAmount } from '../../common/validators/is-money-amount.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LineItemDto {
  @IsString()
  @Transform(trim)
  @MinLength(1, { message: 'Description is required.' })
  @MaxLength(500, { message: 'Description must be at most 500 characters.' })
  description!: string;

  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1, { message: 'Quantity must be at least 1.' })
  @Max(1_000_000, { message: 'Quantity must be at most 1,000,000.' })
  @Type(() => Number)
  quantity!: number;

  // Zero is allowed so a free line can be itemised on an order. The order as a whole is still
  // required to come to more than zero; see OrdersService.
  @IsMoneyAmount({ minCents: 0 })
  unitPrice!: string | number;
}

export class CreateOrderDto {
  @IsString()
  @Transform(trim)
  @MinLength(1, { message: 'Customer is required.' })
  @MaxLength(200, { message: 'Customer must be at most 200 characters.' })
  customerName!: string;

  // Past dates are accepted: back-dating an order that was agreed last week is legitimate,
  // and it lands as `overdue`, which is the correct description of it.
  @IsCalendarDate({ message: 'Due date must be a calendar date in YYYY-MM-DD format.' })
  dueDate!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'An order needs at least one line item.' })
  @ArrayMaxSize(200, { message: 'An order can have at most 200 line items.' })
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems!: LineItemDto[];
}

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1, { message: 'Customer is required.' })
  @MaxLength(200, { message: 'Customer must be at most 200 characters.' })
  customerName?: string;

  @IsOptional()
  @IsCalendarDate({ message: 'Due date must be a calendar date in YYYY-MM-DD format.' })
  dueDate?: string;

  /**
   * Omit to leave the lines untouched. Supplying this on an order that has a payment against
   * it is refused with ORDER_LOCKED — the totals are what the payment was validated against.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'An order needs at least one line item.' })
  @ArrayMaxSize(200, { message: 'An order can have at most 200 line items.' })
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];
}
