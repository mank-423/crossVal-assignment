import { Logger } from '@nestjs/common';

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  database: {
    url: string;
    maxConnections: number;
    ssl: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  corsOrigins: string[];
}

/** Only ever used outside production, and only when JWT_SECRET was not supplied. */
const INSECURE_DEV_SECRET = 'insecure-development-only-secret-do-not-deploy';

/**
 * Reads and validates configuration once, at boot.
 *
 * Anything missing or malformed throws here rather than surfacing later as a confusing
 * runtime failure — a process that cannot possibly work should not accept traffic first.
 */
export function loadConfiguration(): AppConfig {
  const logger = new Logger('Configuration');
  const nodeEnv = readNodeEnv();
  const isProduction = nodeEnv === 'production';

  const databaseUrl = requireEnv(
    nodeEnv === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL',
    'Copy apps/api/.env.example to apps/api/.env and set your Postgres connection string.',
  );

  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (isProduction) {
    // In production an absent or placeholder secret means every token this process issues is
    // forgeable by anyone who has read the repository. Refuse to start.
    if (!jwtSecret || jwtSecret === INSECURE_DEV_SECRET || jwtSecret.includes('replace-this')) {
      throw new Error(
        'JWT_SECRET must be set to a real random value in production. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
      );
    }
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
  } else if (!jwtSecret) {
    logger.warn('JWT_SECRET is not set; falling back to a development-only secret.');
  }

  return {
    nodeEnv,
    port: readInt('PORT', 3000),
    database: {
      url: databaseUrl,
      maxConnections: readInt('DATABASE_MAX_CONNECTIONS', 10),
      // Managed providers terminate TLS with their own CA. Enabled by default in production,
      // where the database is almost never on localhost.
      ssl: readBool('DATABASE_SSL', isProduction),
    },
    jwt: {
      secret: jwtSecret || INSECURE_DEV_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN?.trim() || '7d',
    },
    corsOrigins: readList('CORS_ORIGIN', ['http://localhost:5173']),
  };
}

function readNodeEnv(): NodeEnv {
  const value = process.env.NODE_ENV?.trim() || 'development';
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }
  throw new Error(`NODE_ENV must be development, test, or production. Received "${value}".`);
}

function requireEnv(name: string, hint: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required but not set. ${hint}`);
  }
  return value;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer. Received "${raw}".`);
  }
  return parsed;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function readList(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
