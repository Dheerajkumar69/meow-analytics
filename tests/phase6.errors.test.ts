import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Phase 6 — Frontend Errors, Rejections, Sanitization & Error Grouping', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_errors';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let projectId: string;
  let siteId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = '12345678901234567890123456789012';
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = 'http://localhost:5173,http://localhost:3000';

    await migrateDatabase('memory://');
    app = await buildApp();

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Phase 6 Errors Site', timezone: 'UTC' },
    });
    const projData = JSON.parse(projRes.payload);
    projectId = projData.id;
    siteId = projData.site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  // 1. Uncaught JS Exceptions & Ingestion
  it('ingests uncaught exceptions and populates error_events', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_err_01',
            type: 'error',
            eventName: 'error',
            timestamp: Date.now() - 10000,
            path: '/checkout',
            hostname: 'example.com',
            properties: {
              errorType: 'TypeError',
              message: "Cannot read properties of undefined (reading 'calculateTotal')",
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ingested).toBe(1);
  });

  // 2. Unhandled Promise Rejections
  it('ingests unhandled promise rejections', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_err_rej_01',
            type: 'error',
            eventName: 'error',
            timestamp: Date.now() - 8000,
            path: '/api/v1/data',
            hostname: 'example.com',
            properties: {
              errorType: 'UnhandledRejection',
              message: 'NetworkError: Failed to fetch user profile',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
  });

  // 3. Error Normalization & Grouping
  it('groups similar errors with varying tokens, query parameters, line numbers, or IDs into a single error group', async () => {
    // Ingest 3 similar errors that differ only in dynamic parameters/tokens
    const baseTime = Date.now();
    const errors = [
      {
        eventId: 'evt_group_01',
        type: 'error',
        eventName: 'error',
        timestamp: baseTime - 6000,
        path: '/products/item-123',
        hostname: 'example.com',
        properties: {
          errorType: 'TypeError',
          message: "Cannot read properties of null (reading 'price') at /assets/app-a1b2c3d4.js?token=xyz123:42:15",
        },
      },
      {
        eventId: 'evt_group_02',
        type: 'error',
        eventName: 'error',
        timestamp: baseTime - 4000,
        path: '/products/item-456',
        hostname: 'example.com',
        properties: {
          errorType: 'TypeError',
          message: "Cannot read properties of null (reading 'price') at /assets/app-e5f6g7h8.js?token=abc987:108:22",
        },
      },
      {
        eventId: 'evt_group_03',
        type: 'error',
        eventName: 'error',
        timestamp: baseTime - 2000,
        path: '/products/item-789',
        hostname: 'example.com',
        properties: {
          errorType: 'TypeError',
          message: "Cannot read properties of null (reading 'price') at /assets/app-99887766.js:14:5",
        },
      },
    ];

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      },
      payload: {
        siteId,
        events: errors,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ingested).toBe(3);

    // Verify error list groups these 3 into a single row
    const errorsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/errors`,
      headers: authHeaders,
    });

    expect(errorsRes.statusCode).toBe(200);
    const errorList = JSON.parse(errorsRes.payload).errors;

    // Look for the grouped null price error
    const grouped = errorList.find((e: any) =>
      e.message.includes("Cannot read properties of null (reading 'price')")
    );

    expect(grouped).toBeDefined();
    expect(grouped.occurrences).toBe(3);
    expect(grouped.firstSeen).toBeDefined();
    expect(grouped.lastSeen).toBeDefined();
    expect(new Date(grouped.lastSeen).getTime()).toBeGreaterThanOrEqual(new Date(grouped.firstSeen).getTime());
  });

  // 4. Error Detail View
  it('returns breakdown of paths, browsers, and operating systems for a grouped error', async () => {
    // Query errors to find the errorGroup hash
    const errorsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/errors`,
      headers: authHeaders,
    });
    const errorList = JSON.parse(errorsRes.payload).errors;
    const targetError = errorList[0];
    expect(targetError).toBeDefined();

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/errors/detail?errorGroup=${targetError.errorGroup}`,
      headers: authHeaders,
    });

    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.payload);

    expect(detail.errorGroup).toBe(targetError.errorGroup);
    expect(detail.occurrences).toBe(targetError.occurrences);
    expect(Array.isArray(detail.paths)).toBe(true);
    expect(detail.paths.length).toBeGreaterThan(0);
    expect(Array.isArray(detail.browsers)).toBe(true);
    expect(Array.isArray(detail.os)).toBe(true);
  });
});
