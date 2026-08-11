import { Global, Module } from '@nestjs/common';

import { OrderDetailService } from './orders/order-detail.service';
import { OrderEventsRepository } from './orders/order-events.repository';
import { OrdersRepository } from './orders/orders.repository';
import { PaymentsRepository } from './payments/payments.repository';

/**
 * The data-access layer, in one place.
 *
 * Orders and payments each need repositories the other owns: an order's detail page includes
 * its payment history, and recording a payment reads and updates the order. Declaring the
 * repositories in their respective feature modules would make those modules import each other
 * and require forwardRef to break the cycle.
 *
 * Grouping them here instead removes the cycle rather than working around it, and gives one
 * place to see everything that talks to the database. Global because repositories are
 * stateless and every feature module needs them.
 */
@Global()
@Module({
  providers: [OrdersRepository, PaymentsRepository, OrderEventsRepository, OrderDetailService],
  exports: [OrdersRepository, PaymentsRepository, OrderEventsRepository, OrderDetailService],
})
export class PersistenceModule {}
