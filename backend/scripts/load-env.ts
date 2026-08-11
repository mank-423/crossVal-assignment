import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal `.env` reader for the standalone scripts.
 *
 * The Nest application gets its environment through @nestjs/config; migrate and seed run
 * outside the framework, and pulling in a config dependency for twenty lines of parsing is
 * not worth it. Existing environment variables always win, so CI and deployment platforms
 * that inject configuration directly keep working with no `.env` file present.
 */
export function loadEnv(fileName = '.env'): void {
  const path = resolve(__dirname, '..', fileName);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

/**
 * Which database the script should act on. `--test` (or NODE_ENV=test) targets the test
 * database, so a mistyped command cannot seed or reset development data.
 */
export function resolveDatabaseUrl(): string {
  const useTest = process.argv.includes('--test') || process.env.NODE_ENV === 'test';
  const variable = useTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const url = process.env[variable];

  if (!url) {
    throw new Error(
      `${variable} is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.`,
    );
  }

  return url;
}
