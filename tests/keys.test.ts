import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase, apiKeys } from '@meow-analytics/database';
import { hashApiKey, verifyApiKey } from '@meow-analytics/shared';
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

describe('API Key Foundation & Hashing', () => {
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

    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Key Test Project A' },
    });
    projectAId = JSON.parse(resA.payload).id;

    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Key Test Project B' },
    });
    projectBId = JSON.parse(resB.payload).id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  let rawCreatedKey: string;
  let createdKeyId: string;
  let createdKeyPrefix: string;

  it('POST /api/v1/projects/:id/keys returns the raw secret key exactly once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectAId}/keys`,
      headers: authHeaders,
      payload: {
        name: 'Collector Key',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);

    expect(body.id).toMatch(/^key_[a-z0-9]+/);
    expect(body.name).toBe('Collector Key');
    expect(body.key).toMatch(/^mk_live_[a-f0-9]{48}/);
    expect(body.key_prefix).toBe(body.key.slice(0, 16));

    rawCreatedKey = body.key;
    createdKeyId = body.id;
    createdKeyPrefix = body.key_prefix;
  });

  it('verifies the database stores ONLY the hash and prefix, NOT the plaintext key', async () => {
    const db = getDatabase('memory://');
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, createdKeyId));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    // Raw key should NOT match stored hash
    expect(row.key_hash).not.toBe(rawCreatedKey);
    // Stored hash must match computed SHA-256
    expect(row.key_hash).toBe(hashApiKey(rawCreatedKey));
    expect(verifyApiKey(rawCreatedKey, row.key_hash)).toBe(true);
    expect(row.key_prefix).toBe(createdKeyPrefix);
  });

  it('GET /api/v1/projects/:id/keys NEVER returns the secret or the hash', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectAId}/keys`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    const keyInfo = body[0];
    expect(keyInfo.id).toBe(createdKeyId);
    expect(keyInfo.key_prefix).toBe(createdKeyPrefix);
    expect(keyInfo.name).toBe('Collector Key');

    // Crucial security checks:
    expect(keyInfo.key).toBeUndefined();
    expect(keyInfo.key_hash).toBeUndefined();
  });

  it('prevents cross-project key revocation (Project B cannot revoke Project A key)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectBId}/keys/${createdKeyId}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/v1/projects/:id/keys/:keyId revokes the key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectAId}/keys/${createdKeyId}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectAId}/keys`,
      headers: authHeaders,
    });

    const list = JSON.parse(listRes.payload);
    expect(list[0]?.revoked_at).not.toBeNull();
  });
});
