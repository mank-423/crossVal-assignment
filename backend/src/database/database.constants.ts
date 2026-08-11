export const DATABASE_POOL_OPTIONS = Symbol('DATABASE_POOL_OPTIONS');

export interface DatabasePoolOptions {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean } | false;
  maxConnections: number;
}
