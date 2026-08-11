import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Requires a plain calendar date, `YYYY-MM-DD`.
 *
 * class-validator's `@IsDateString()` also accepts full timestamps, which is exactly what
 * should not be allowed here: a due date is a day, and accepting an instant invites a
 * timezone shift that moves the deadline. The round-trip check rejects impossible dates like
 * `2026-02-30`, which `Date` would silently roll forward to March 2nd.
 */
@ValidatorConstraint({ name: 'isCalendarDate', async: false })
export class IsCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;

    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return false;

    return parsed.toISOString().slice(0, 10) === value;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a calendar date in YYYY-MM-DD format.`;
  }
}

export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCalendarDateConstraint,
    });
  };
}
