import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import { applyPgTypeParsers } from './pg-type-parsers';
import { SqlLoaderService } from './sql-loader.service';
import { DATABASE_POOL_OPTIONS, DatabasePoolOptions } from './database.constants';

applyPgTypeParsers();

/**
 * Runs named SQL statements. Implemented both by the pool (each call independent) and by the
 * transaction handle, so a repository method works unchanged inside or outside a transaction.
 */
export interface SqlExecutor {
  run<T extends QueryResultRow>(name: string, params?: readonly unknown[]): Promise<T[]>;
  runOne<T extends QueryResultRow>(name: string, params?: readonly unknown[]): Promise<T | null>;
}

/** Postgres SQLSTATE codes this application translates into domain errors. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
} as const;

export function isPgError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

export function pgConstraintName(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'constraint' in error) {
    const constraint = (error as { constraint?: unknown }).constraint;
    return typeof constraint === 'string' ? constraint : undefined;
  }
  return undefined;
}

@Injectable()
export class DatabaseService implements SqlExecutor, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(
    private readonly sql: SqlLoaderService,
    @Inject(DATABASE_POOL_OPTIONS) options: DatabasePoolOptions,
  ) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
      max: options.maxConnections,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    // An idle client erroring (server restart, network blip) emits on the pool. Without a
    // listener, Node treats it as an unhandled 'error' event and kills the process.
    this.pool.on('error', (error) => {
      this.logger.error(`Idle client error: ${error.message}`, error.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    // Fail fast: a bad DATABASE_URL should stop the process at boot, not surface as a 500 on
    // the first request that happens to touch the database.
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      this.logger.log('Database connection established');
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async run<T extends QueryResultRow>(name: string, params: readonly unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(this.sql.get(name), params as unknown[]);
    return result.rows;
  }

  async runOne<T extends QueryResultRow>(
    name: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.run<T>(name, params);
    return rows[0] ?? null;
  }

  /**
   * Run a unit of work in a single transaction.
   *
   * Commits when the callback returns, rolls back if it throws — including on an error thrown
   * by application logic, not just by the database. That is what makes "validate the balance,
   * insert the payment, update the order, append the audit event" all-or-nothing: there is no
   * arrangement of failures that records a payment without moving the total, or moves the
   * total without logging why.
   */
  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await work(this.executorFor(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await this.rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private executorFor(client: PoolClient): SqlExecutor {
    return {
      run: async <T extends QueryResultRow>(
        name: string,
        params: readonly unknown[] = [],
      ): Promise<T[]> => {
        const result = await client.query<T>(this.sql.get(name), params as unknown[]);
        return result.rows;
      },
      runOne: async <T extends QueryResultRow>(
        name: string,
        params: readonly unknown[] = [],
      ): Promise<T | null> => {
        const result = await client.query<T>(this.sql.get(name), params as unknown[]);
        return result.rows[0] ?? null;
      },
    };
  }

  /**
   * A failed ROLLBACK must not replace the error that caused it — that would report a
   * connection problem while hiding the actual business failure.
   */
  private async rollbackQuietly(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      this.logger.error(
        `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`,
      );
    }
  }
}
