import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { DATABASE_POOL_OPTIONS, DatabasePoolOptions } from './database.constants';
import { DatabaseService } from './database.service';
import { SqlLoaderService } from './sql-loader.service';

/**
 * Global so repositories can inject DatabaseService without every feature module importing
 * this one. There is a single connection pool for the process, which is the point of a pool.
 */
@Global()
@Module({
  providers: [
    SqlLoaderService,
    {
      provide: DATABASE_POOL_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<{ app: AppConfig }, true>): DatabasePoolOptions => {
        const database = config.get('app', { infer: true }).database;

        return {
          connectionString: database.url,
          // Managed Postgres providers present a certificate from their own CA, which is not
          // in Node's trust store. Verification is relaxed rather than TLS disabled: the
          // connection is still encrypted.
          ssl: database.ssl ? { rejectUnauthorized: false } : false,
          maxConnections: database.maxConnections,
        };
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService, SqlLoaderService],
})
export class DatabaseModule {}
