import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ORDER_STATUSES, type OrderStatus } from '@orders/shared';

export const SORT_KEYS = ['due_date', 'created_at', 'total', 'amount_due'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const MAX_PAGE_SIZE = 100;

export class ListOrdersQuery {
  @IsOptional()
  @IsIn(ORDER_STATUSES, {
    message: `Status must be one of: ${ORDER_STATUSES.join(', ')}.`,
  })
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be a whole number.' })
  @Min(1, { message: 'Page starts at 1.' })
  page?: number;

  // Capped so a client cannot ask for the entire table in one request and turn a dashboard
  // into an unbounded query.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be a whole number.' })
  @Min(1)
  @Max(MAX_PAGE_SIZE, { message: `Limit must be at most ${MAX_PAGE_SIZE}.` })
  limit?: number;

  @IsOptional()
  @IsIn(SORT_KEYS, { message: `Sort must be one of: ${SORT_KEYS.join(', ')}.` })
  sort?: SortKey;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'Direction must be asc or desc.' })
  direction?: 'asc' | 'desc';
}
