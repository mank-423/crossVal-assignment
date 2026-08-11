import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

import { loadEnv, resolveDatabaseUrl } from './load-env';

/**
 * Applies pending migrations, in filename order, each inside its own transaction.
 *
 * Deliberately plain: a migration is a `.sql` file, and applying one is "run it, record it".
 * A migration framework would add a dependency and a DSL without changing what happens.
 *
 * Every migration is atomic. Postgres supports transactional DDL, so a file that fails
 * halfway leaves the schema exactly as it was rather than half-migrated — the failure mode
 * that turns a bad deploy into a manual repair job.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'database', 'migrations');

const CREATE_LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

async function main(): Promise<void> {
  loadEnv();

  const connectionString = resolveDatabaseUrl();
  const client = new Client({ connectionString, ssl: sslOption(connectionString) });

  await client.connect();
  console.log(`Connected to ${redact(connectionString)}`);

  try {
    await client.query(CREATE_LEDGER);

    const applied = new Set(
      (await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
        (row) => row.version,
      ),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.toLowerCase().endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      throw new Error(`No .sql migrations found in ${MIGRATIONS_DIR}`);
    }

    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
      console.log(`Up to date — ${applied.size} migration(s) already applied.`);
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`Applying ${file} ... `);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('done');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.log('failed');
        throw error;
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

/** Managed providers require TLS; localhost does not offer it. */
function sslOption(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  const needsSsl =
    connectionString.includes('sslmode=require') ||
    (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1'));
  return needsSsl ? { rejectUnauthorized: false } : undefined;
}

/** Never print a connection string with its password in a build log. */
function redact(connectionString: string): string {
  return connectionString.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@');
}

main().catch((error: unknown) => {
  console.error('\nMigration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
