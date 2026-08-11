import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PaymentsController, RefundsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, RefundsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
