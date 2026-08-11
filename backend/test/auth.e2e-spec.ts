import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { API, createTestApp, resetDatabase, signUp } from './helpers/test-app';

describe('Authentication (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /auth/signup', () => {
    it('creates an account and returns a usable token', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API}/auth/signup`)
        .send({ email: 'ada@example.com', password: 'correct-horse-staple' })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user).toMatchObject({ email: 'ada@example.com' });
      // The hash must never leave the server, under any field name.
      expect(JSON.stringify(response.body)).not.toMatch(/password/i);

      await request(app.getHttpServer())
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
    });

    it('rejects a duplicate email with a clear code', async () => {
      await signUp(app, 'taken@example.com');

      const response = await request(app.getHttpServer())
        .post(`${API}/auth/signup`)
        .send({ email: 'taken@example.com', password: 'another-password' })
        .expect(409);

      expect(response.body.code).toBe('EMAIL_ALREADY_REGISTERED');
      expect(response.body.hint).toBeTruthy();
    });

    it('treats email as case-insensitive, so one address cannot register twice', async () => {
      await signUp(app, 'Ada@Example.com');

      const response = await request(app.getHttpServer())
        .post(`${API}/auth/signup`)
        .send({ email: 'ada@example.com', password: 'correct-horse-staple' })
        .expect(409);

      expect(response.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('returns per-field validation errors', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API}/auth/signup`)
        .send({ email: 'not-an-email', password: 'short' })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.fieldErrors.email).toBeDefined();
      expect(response.body.fieldErrors.password).toBeDefined();
    });

    it('rejects unknown fields rather than silently dropping them', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API}/auth/signup`)
        .send({ email: 'ada@example.com', password: 'correct-horse-staple', isAdmin: true })
        .expect(422);

      expect(response.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /auth/login', () => {
    it('returns a token for correct credentials', async () => {
      await signUp(app, 'ada@example.com');

      const response = await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: 'ada@example.com', password: 'correct-horse-staple' })
        .expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    /**
     * Both failures must look identical. A different message for "no such account" would tell
     * an attacker which addresses are registered.
     */
    it('gives the same response for a wrong password and an unknown account', async () => {
      await signUp(app, 'ada@example.com');

      const wrongPassword = await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: 'ada@example.com', password: 'wrong-password' })
        .expect(401);

      const unknownUser = await request(app.getHttpServer())
        .post(`${API}/auth/login`)
        .send({ email: 'nobody@example.com', password: 'wrong-password' })
        .expect(401);

      expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknownUser.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('GET /auth/me', () => {
    it('rejects a request with no token', async () => {
      const response = await request(app.getHttpServer()).get(`${API}/auth/me`).expect(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a malformed token', async () => {
      await request(app.getHttpServer())
        .get(`${API}/auth/me`)
        .set('Authorization', 'Bearer not.a.real.token')
        .expect(401);
    });
  });
});
