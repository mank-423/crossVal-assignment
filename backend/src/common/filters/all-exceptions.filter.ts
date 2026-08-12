import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorCode, ApiErrorResponse } from '../../shared';

import { AppError } from '../errors/app-error';
import { ValidationError } from '../errors/validation-error';

/**
 * Turns every failure into the one response shape the API promises.
 *
 * Catching everything — not just HttpException — is the point: an unexpected throw from a
 * repository would otherwise produce Nest's default body, so clients would need to handle two
 * different error formats and would inevitably handle only the documented one.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const body = this.toErrorResponse(exception, request.url);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Unexpected failures get the stack in the log. The client gets none of it.
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${body.statusCode} ${body.code}`);
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorResponse(exception: unknown, path: string): ApiErrorResponse {
    const timestamp = new Date().toISOString();

    if (exception instanceof ValidationError) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        hint: exception.hint,
        fieldErrors: exception.fieldErrors,
        path,
        timestamp,
      };
    }

    if (exception instanceof AppError) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        hint: exception.hint,
        details: exception.details,
        path,
        timestamp,
      };
    }

    // Exceptions raised by the framework itself: guards, 404 for unmatched routes, payload
    // size limits. Mapped onto the same envelope so clients never see a second shape.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        statusCode: status,
        code: this.codeForStatus(status),
        message: this.messageFrom(exception),
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      // Never echo the underlying message: it can carry connection strings, SQL, or row data.
      message: 'Something went wrong while processing the request.',
      hint: 'Try again. If it keeps happening, the server logs have the details.',
      path,
      timestamp,
    };
  }

  private messageFrom(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') return response;

    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join('; ');
    }

    return exception.message;
  }

  private codeForStatus(status: number): ApiErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_FAILED';
      case HttpStatus.NOT_FOUND:
        return 'ORDER_NOT_FOUND';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
