import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Health & Readiness Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = '12345678901234567890123456789012';
    process.env.ADMIN_SECRET = 'admin_secret_12345';
    process.env.CORS_ORIGINS = 'http://localhost:5173';

    await migrateDatabase('memory://');
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('GET /api/health returns 200 OK with status "ok"', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ status: 'ok' });
  });

  it('GET /api/ready returns 200 OK and confirms database is connected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ready',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ready');
    expect(body.database).toBe('connected');
    expect(body.timestamp).toBeDefined();
  });
});
