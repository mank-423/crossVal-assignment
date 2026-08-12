import { HttpException, HttpStatus } from '@nestjs/common';
import type { ValidationError as ClassValidatorError } from 'class-validator';
import type { ApiErrorCode } from '../../shared';

/**
 * A failed DTO validation, flattened into per-field messages.
 *
 * Nest's default ValidationPipe produces `message: string[]`, which forces the client to
 * string-match to work out which input was wrong. Keying by field path means a form can put
 * each message next to the input that caused it, including for nested line items
 * (`lineItems.0.quantity`).
 */
export class ValidationError extends HttpException {
  readonly code: ApiErrorCode = 'VALIDATION_FAILED';
  readonly hint = 'Correct the highlighted fields and submit again.';
  readonly fieldErrors: Record<string, string[]>;

  constructor(errors: ClassValidatorError[]) {
    super('One or more fields are invalid.', HttpStatus.UNPROCESSABLE_ENTITY);
    this.fieldErrors = flatten(errors);
  }
}

function flatten(
  errors: ClassValidatorError[],
  parentPath = '',
  accumulator: Record<string, string[]> = {},
): Record<string, string[]> {
  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      accumulator[path] = [...(accumulator[path] ?? []), ...Object.values(error.constraints)];
    }

    if (error.children?.length) {
      flatten(error.children, path, accumulator);
    }
  }

  return accumulator;
}
