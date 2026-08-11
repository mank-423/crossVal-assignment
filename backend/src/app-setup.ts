import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationError } from './common/errors/validation-error';
import type { AppConfig } from './config/configuration';

/**
 * Applies the global prefix, pipes, and filters.
 *
 * Extracted so the end-to-end tests boot an application configured exactly like the one that
 * runs in production. Repeating this block in the test harness would let the two drift, and
 * the first thing to drift is usually validation — which is most of what the tests assert.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api/v1');

  app.use(helmet());

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip undeclared fields, then reject if the caller sent them anyway. Silently
      // ignoring a typo like `dueDte` would let a request look successful while the value
      // never landed.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => new ValidationError(errors),
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
