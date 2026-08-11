import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from './database/database.service';

/**
 * Unauthenticated liveness check for deployment platforms.
 *
 * It runs a real query rather than returning a constant: a process that is up but cannot
 * reach its database should not report itself healthy, because that is precisely the state a
 * health check exists to catch.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: string; database: string; timestamp: string }> {
    let database = 'ok';

    try {
      await this.db.run('health/ping');
    } catch {
      database = 'unreachable';
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
