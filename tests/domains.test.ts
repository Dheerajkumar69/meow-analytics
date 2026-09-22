import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Domain Management & Normalization', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_12345';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = '12345678901234567890123456789012';
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = 'http://localhost:5173';

    await migrateDatabase('memory://');
    app = await buildApp();

    // Create Project A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Project A' },
    });
    projectAId = JSON.parse(resA.payload).id;

    // Create Project B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Project B' },
    });
    projectBId = JSON.parse(resB.payload).id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  let createdDomainId: string;

  it('normalizes uppercase, https, trailing slash, and path into a clean domain', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectAId}/domains`,
      headers: authHeaders,
      payload: {
        domain: 'https://STREAM.MEOWANALYTICS.DEV/blog/post-1?ref=twitter',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.domain).toBe('stream.meowanalytics.dev');
    expect(body.project_id).toBe(projectAId);
    expect(body.id).toMatch(/^dom_[a-z0-9]+/);

    createdDomainId = body.id;
  });

  it('rejects invalid domain strings', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectAId}/domains`,
      headers: authHeaders,
      payload: {
        domain: 'invalid..domain--name',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate domain on the same project with 409 Conflict', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectAId}/domains`,
      headers: authHeaders,
      payload: {
        domain: 'stream.meowanalytics.dev',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('GET /api/v1/projects/:id/domains lists domains for project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectAId}/domains`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]?.domain).toBe('stream.meowanalytics.dev');
  });

  it('prevents cross-project domain access (Project B cannot delete Project A domain)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectBId}/domains/${createdDomainId}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/projects/:id/domains/:domainId removes domain', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectAId}/domains/${createdDomainId}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectAId}/domains`,
      headers: authHeaders,
    });

    const list = JSON.parse(listRes.payload);
    expect(list).toHaveLength(0);
  });
});
