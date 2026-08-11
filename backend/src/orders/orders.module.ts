import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DashboardController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  // Repositories arrive from the global PersistenceModule; AuthModule supplies the passport
  // strategy that JwtAuthGuard depends on.
  imports: [AuthModule],
  controllers: [OrdersController, DashboardController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
