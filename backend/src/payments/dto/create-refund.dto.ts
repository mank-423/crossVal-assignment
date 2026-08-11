import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';
import { IsMoneyAmount } from '../../common/validators/is-money-amount.validator';

export class CreateRefundDto {
  /**
   * A positive amount, stated as the sum being returned. The service negates it before
   * storage, so a caller never has to think about the sign — and cannot accidentally send a
   * "refund" that increases what has been collected.
   */
  @IsMoneyAmount(
    { minCents: 1 },
    { message: 'Refund amount must be at least 0.01 with at most 2 decimal places.' },
  )
  amount!: string | number;

  /** Defaults to today. Back-dating is allowed, as it is for payments. */
  @IsOptional()
  @IsCalendarDate({ message: 'Refund date must be a calendar date in YYYY-MM-DD format.' })
  refundedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Note must be at most 1000 characters.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;
}
