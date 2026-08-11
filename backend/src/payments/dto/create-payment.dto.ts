import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';
import { IsMoneyAmount } from '../../common/validators/is-money-amount.validator';

export class CreatePaymentDto {
  /**
   * At least one cent. A zero payment would change nothing while still appearing in the
   * history as though something happened.
   */
  @IsMoneyAmount(
    { minCents: 1 },
    { message: 'Amount must be at least 0.01 with at most 2 decimal places.' },
  )
  amount!: string | number;

  /**
   * Defaults to today when omitted. Back-dating is allowed — payments are often recorded
   * after the fact — and the date is descriptive: it does not affect status, which depends
   * only on how much has been paid and whether the due date has passed.
   */
  @IsOptional()
  @IsCalendarDate({ message: 'Payment date must be a calendar date in YYYY-MM-DD format.' })
  paidOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Note must be at most 1000 characters.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;
}
