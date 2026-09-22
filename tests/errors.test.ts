import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Centralized Error Handling & Safety', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_12345';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
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

  it('returns structured 404 error when accessing non-existent route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/unknown-endpoint-404',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /api/v1/unknown-endpoint-404 not found',
      },
    });
  });

  it('returns structured 400 error when request body contains invalid JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      payload: '{ malformed json: true, ',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBeDefined();
    expect(body.stack).toBeUndefined();
  });

  it('does not leak internal database credentials or stack traces', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: 'Safe Project',
        unexpected_injected_field: 'malicious',
      },
    });

    // Zod strict schema rejection
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.stack).toBeUndefined();
    expect(res.payload).not.toContain('password');
    expect(res.payload).not.toContain('memory://');
  });
});
