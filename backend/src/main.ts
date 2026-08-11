import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app-setup';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<{ app: AppConfig }, true>).get('app', { infer: true });

  configureApp(app, config);

  await app.listen(config.port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on port ${config.port} (${config.nodeEnv})`);
  logger.log(`Accepting browser requests from: ${config.corsOrigins.join(', ')}`);
}

bootstrap().catch((error: unknown) => {
  // Nothing is listening yet, so there is no request to fail — exit non-zero and let the
  // supervisor decide whether to restart.
  console.error('Failed to start API:', error instanceof Error ? error.message : error);
  process.exit(1);
});
