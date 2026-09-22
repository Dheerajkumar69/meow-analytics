import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Project Management API', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_12345';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

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

  let createdProjectId: string;
  let createdSiteId: string;

  it('POST /api/v1/projects creates project and generates secure IDs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: 'Meow Stream',
        timezone: 'Asia/Kolkata',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Meow Stream');
    expect(body.timezone).toBe('Asia/Kolkata');
    expect(body.status).toBe('active');
    expect(body.id).toMatch(/^prj_[a-z0-9]+/);
    expect(body.site_id).toMatch(/^site_[a-z0-9]+/);
    expect(body.created_at).toBeDefined();

    createdProjectId = body.id;
    createdSiteId = body.site_id;
  });

  it('POST /api/v1/projects rejects invalid timezone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: 'Bad Timezone Project',
        timezone: 'Moon/Tycho_Crater',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Invalid IANA timezone');
  });

  it('POST /api/v1/projects rejects missing or empty project name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: '   ',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/v1/projects lists created projects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    const found = body.find((p: any) => p.id === createdProjectId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Meow Stream');
  });

  it('GET /api/v1/projects/:id returns single project details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${createdProjectId}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(createdProjectId);
    expect(body.site_id).toBe(createdSiteId);
    expect(body.name).toBe('Meow Stream');
  });

  it('GET /api/v1/projects/:id returns 404 for unknown project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/prj_non_existent',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('PATCH /api/v1/projects/:id updates project name and timezone', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${createdProjectId}`,
      headers: authHeaders,
      payload: {
        name: 'Meow Stream Premium',
        timezone: 'UTC',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Meow Stream Premium');
    expect(body.timezone).toBe('UTC');
  });

  it('DELETE /api/v1/projects/:id deletes project and prevents subsequent access', async () => {
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${createdProjectId}`,
      headers: authHeaders,
    });

    expect(delRes.statusCode).toBe(200);

    // Subsequent retrieval must return 404 NOT_FOUND
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${createdProjectId}`,
      headers: authHeaders,
    });

    expect(getRes.statusCode).toBe(404);
  });
});
