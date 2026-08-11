import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PersistenceModule } from './persistence.module';
import { loadConfiguration } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // ConfigModule reads the .env file into process.env before running these factories, so
      // loadConfiguration sees the file's values. Anything already in the real environment
      // takes precedence, which is what deployment platforms rely on.
      load: [() => ({ app: loadConfiguration() })],
      cache: true,
    }),
    DatabaseModule,
    PersistenceModule,
    AuthModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
