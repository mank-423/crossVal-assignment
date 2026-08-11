import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app-setup';
import type { AppConfig } from '../../src/config/configuration';

export const API = '/api/v1';

/**
 * Boots the real application against the test database.
 *
 * Nothing is mocked. The whole point of these specs is that the SQL, the constraints, the
 * transactions, and the status derivation agree with each other; a suite with a stubbed
 * repository would pass while the database rejected every write.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(ConfigService<{ app: AppConfig }, true>).get('app', { infer: true });

  configureApp(app, config);
  await app.init();

  return app;
}

/**
 * Empties every table between specs.
 *
 * Uses its own connection rather than the application's SqlLoader, so a TRUNCATE statement
 * never ships in the production SQL directory. Guards on the database name: this wipes
 * everything, and pointing it at the development database by a stray environment variable
 * would be an expensive mistake.
 */
export async function resetDatabase(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  }

  if (!/_test(\?|$)/.test(url)) {
    throw new Error(
      `Refusing to truncate: TEST_DATABASE_URL must point at a database whose name ends in ` +
        `"_test". Got "${url.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@')}".`,
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // RESTART IDENTITY keeps ids predictable across specs; CASCADE handles the foreign keys.
    await client.query(
      'TRUNCATE users, orders, order_line_items, payments, order_events RESTART IDENTITY CASCADE',
    );
  } finally {
    await client.end();
  }
}

export interface TestUser {
  email: string;
  token: string;
  auth: { Authorization: string };
}

let userCounter = 0;

/** Registers a fresh user and returns a ready-to-use Authorization header. */
export async function signUp(app: INestApplication, email?: string): Promise<TestUser> {
  const address = email ?? `user${++userCounter}-${Date.now()}@example.com`;

  const response = await request(app.getHttpServer())
    .post(`${API}/auth/signup`)
    .send({ email: address, password: 'correct-horse-staple' })
    .expect(201);

  const token = response.body.accessToken as string;

  return { email: address, token, auth: { Authorization: `Bearer ${token}` } };
}

/** `YYYY-MM-DD`, offset from today. Negative is in the past. */
export function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The brief's sample order: 2 × $500, due in 7 days. */
export function sampleOrder(overrides: Record<string, unknown> = {}) {
  return {
    customerName: 'Acme Industries',
    dueDate: isoDate(7),
    lineItems: [{ description: 'Consulting day', quantity: 2, unitPrice: '500.00' }],
    ...overrides,
  };
}
