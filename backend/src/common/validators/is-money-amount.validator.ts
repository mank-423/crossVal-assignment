import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MAX_AMOUNT_CENTS, toCents } from '@orders/shared';

export interface MoneyAmountOptions {
  /** Smallest accepted value, in cents. Defaults to 0. */
  minCents?: number;
}

/**
 * Accepts a decimal money amount as either a string or a number.
 *
 * Validation delegates to the same `toCents` the service uses to convert it, so anything that
 * passes here is guaranteed to convert. A separate regex would be a second definition of
 * "valid amount" that could drift from the first.
 *
 * Strings are the preferred wire format — `0.1 + 0.2` problems start at the client, not at
 * the database — but numbers are accepted because rejecting `500` would be pedantic.
 */
@ValidatorConstraint({ name: 'isMoneyAmount', async: false })
export class IsMoneyAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string' && typeof value !== 'number') return false;

    const { minCents = 0 } = (args.constraints[0] ?? {}) as MoneyAmountOptions;

    try {
      const cents = toCents(value);
      return cents >= minCents && cents <= MAX_AMOUNT_CENTS;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const { minCents = 0 } = (args.constraints[0] ?? {}) as MoneyAmountOptions;
    const minimum = (minCents / 100).toFixed(2);

    return (
      `${args.property} must be an amount of at least ${minimum} with at most 2 decimal places ` +
      `(for example "500.00").`
    );
  }
}

export function IsMoneyAmount(
  options: MoneyAmountOptions = {},
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [options],
      validator: IsMoneyAmountConstraint,
    });
  };
}
