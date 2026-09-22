import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Admin Authentication Foundation', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_12345';

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = '12345678901234567890123456789012';
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = 'http://localhost:5173';

    await migrateDatabase('memory://');
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('rejects unauthenticated request with 401 and predictable error envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing admin credentials',
      },
    });
  });

  it('rejects invalid Bearer token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: {
        authorization: 'Bearer wrong_token_value',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('accepts valid Authorization: Bearer <ADMIN_SECRET>', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: {
        authorization: `Bearer ${adminSecret}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload))).toBe(true);
  });

  it('accepts valid x-admin-secret header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: {
        'x-admin-secret': adminSecret,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload))).toBe(true);
  });
});
