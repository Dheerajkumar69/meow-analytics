import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Phase 6 — Acceptance Test (Section 16)', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_p6_acceptance';
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

    // Create target test project
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Phase 6 Acceptance Project', timezone: 'UTC' },
    });
    const projData = JSON.parse(projRes.payload);
    projectId = projData.id;
    siteId = projData.site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('verifies 100% full acceptance: Signup, Play Movie, Download, Outbound Click, and Frontend Error all appear in dashboard endpoints', async () => {
    const timestamp = Date.now();

    // 1. Ingest all 4 required event types + frontend error
    const ingestionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      },
      payload: {
        siteId,
        events: [
          // Event 1: Signup
          {
            eventId: 'evt_acc_signup_01',
            type: 'custom',
            eventName: 'Signup',
            timestamp: timestamp - 4000,
            path: '/signup',
            hostname: 'example.com',
          },
          // Event 2: Play Movie
          {
            eventId: 'evt_acc_play_01',
            type: 'custom',
            eventName: 'Play Movie',
            timestamp: timestamp - 3000,
            path: '/movies/interstellar',
            hostname: 'example.com',
            properties: {
              movieId: '123',
              category: 'action',
            },
          },
          // Event 3: Download
          {
            eventId: 'evt_acc_download_01',
            type: 'download',
            eventName: 'download',
            timestamp: timestamp - 2000,
            path: '/resources',
            hostname: 'example.com',
            properties: {
              filename: 'whitepaper.pdf',
              extension: 'pdf',
              url: 'https://example.com/downloads/whitepaper.pdf',
            },
          },
          // Event 4: Outbound Click
          {
            eventId: 'evt_acc_outbound_01',
            type: 'outbound_click',
            eventName: 'outbound_click',
            timestamp: timestamp - 1000,
            path: '/partners',
            hostname: 'example.com',
            properties: {
              destination: 'partner.org',
              url: 'https://partner.org/integration',
            },
          },
          // Event 5: Frontend Error
          {
            eventId: 'evt_acc_error_01',
            type: 'error',
            eventName: 'error',
            timestamp: timestamp,
            path: '/player',
            hostname: 'example.com',
            properties: {
              errorType: 'TypeError',
              message: "Cannot read properties of undefined (reading 'play')",
            },
          },
        ],
      },
    });

    expect(ingestionRes.statusCode).toBe(200);
    const ingestResult = JSON.parse(ingestionRes.payload);
    expect(ingestResult.status).toBe('ok');
    expect(ingestResult.ingested).toBe(5);

    // 2. Query Events Dashboard endpoint
    const eventsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events`,
      headers: authHeaders,
    });
    expect(eventsRes.statusCode).toBe(200);
    const eventsList = JSON.parse(eventsRes.payload).events;

    // Verify all 4 event names appear
    const eventNames = eventsList.map((e: any) => e.eventName);
    expect(eventNames).toContain('Signup');
    expect(eventNames).toContain('Play Movie');
    expect(eventNames).toContain('download');
    expect(eventNames).toContain('outbound_click');

    // Verify properties and structure of each event row
    const signupItem = eventsList.find((e: any) => e.eventName === 'Signup');
    expect(signupItem.count).toBe(1);
    expect(signupItem.uniqueVisitors).toBe(1);
    expect(signupItem.sessions).toBe(1);

    const playItem = eventsList.find((e: any) => e.eventName === 'Play Movie');
    expect(playItem.count).toBe(1);
    expect(playItem.uniqueVisitors).toBe(1);

    const dlItem = eventsList.find((e: any) => e.eventName === 'download');
    expect(dlItem.count).toBe(1);

    const outItem = eventsList.find((e: any) => e.eventName === 'outbound_click');
    expect(outItem.count).toBe(1);

    // 3. Query Event Detail and Property Analytics for "Play Movie"
    const playDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events/detail?eventName=Play Movie`,
      headers: authHeaders,
    });
    expect(playDetailRes.statusCode).toBe(200);
    const playDetail = JSON.parse(playDetailRes.payload);
    expect(playDetail.eventName).toBe('Play Movie');
    expect(playDetail.occurrences).toBe(1);
    expect(playDetail.paths).toEqual([{ path: '/movies/interstellar', count: 1, percentage: 100 }]);

    const propAnalyticsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events/properties?eventName=Play Movie&property=category`,
      headers: authHeaders,
    });
    expect(propAnalyticsRes.statusCode).toBe(200);
    const propAnalytics = JSON.parse(propAnalyticsRes.payload);
    expect(propAnalytics.property).toBe('category');
    expect(propAnalytics.values).toEqual([{ value: 'action', count: 1, percentage: 100 }]);

    // 4. Query Errors Dashboard endpoint
    const errorsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/errors`,
      headers: authHeaders,
    });
    expect(errorsRes.statusCode).toBe(200);
    const errorsList = JSON.parse(errorsRes.payload).errors;
    expect(errorsList.length).toBeGreaterThanOrEqual(1);

    const reportedError = errorsList.find((e: any) => e.errorType === 'TypeError');
    expect(reportedError).toBeDefined();
    expect(reportedError.message).toContain("Cannot read properties of undefined (reading 'play')");
    expect(reportedError.occurrences).toBe(1);
    expect(reportedError.affectedVisitors).toBe(1);
    expect(reportedError.firstSeen).toBeDefined();
    expect(reportedError.lastSeen).toBeDefined();

    // 5. Query Error Detail for path and browser breakdown
    const errorDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/errors/detail?errorGroup=${reportedError.errorGroup}`,
      headers: authHeaders,
    });
    expect(errorDetailRes.statusCode).toBe(200);
    const errorDetail = JSON.parse(errorDetailRes.payload);
    expect(errorDetail.errorGroup).toBe(reportedError.errorGroup);
    expect(errorDetail.paths).toEqual([{ path: '/player', count: 1 }]);
    expect(errorDetail.browsers.length).toBeGreaterThan(0);
    expect(errorDetail.os.length).toBeGreaterThan(0);
  });
});
