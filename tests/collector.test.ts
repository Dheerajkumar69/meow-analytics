import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase, projects, projectDomains, events, pageViews } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

describe('Collector API & Reliable Ingestion', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_12345';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let testProjectId: string;
  let testSiteId: string;
  let restrictedProjectId: string;
  let restrictedSiteId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = '12345678901234567890123456789012';
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = 'http://localhost:5173,http://localhost:3000';

    await migrateDatabase('memory://');
    app = await buildApp();

    // 1. Create open project (no domain restrictions)
    const p1 = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Open Site', timezone: 'UTC' },
    });
    const p1Data = JSON.parse(p1.payload);
    testProjectId = p1Data.id;
    testSiteId = p1Data.site_id;

    // 2. Create restricted project (with allowed domain)
    const p2 = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Restricted Site', timezone: 'UTC' },
    });
    const p2Data = JSON.parse(p2.payload);
    restrictedProjectId = p2Data.id;
    restrictedSiteId = p2Data.site_id;

    // Add domain to restricted project
    await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${restrictedProjectId}/domains`,
      headers: authHeaders,
      payload: { domain: 'https://allowed.example.com' },
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('GET /meow.js serves the compiled SDK script', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/meow.js',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.payload).toContain('MeowAnalytics');
  });

  it('POST /api/v1/collect successfully ingests batched page view events', async () => {
    const event1Id = 'evt_test_batch_001';
    const event2Id = 'evt_test_batch_002';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        origin: 'https://mysite.com',
      },
      payload: {
        siteId: testSiteId,
        events: [
          {
            eventId: event1Id,
            type: 'page_view',
            timestamp: Date.now() - 1000,
            path: '/home?ref=twitter#section',
            hostname: 'mysite.com',
            referrer: 'https://twitter.com',
          },
          {
            eventId: event2Id,
            type: 'page_view',
            timestamp: Date.now() - 500,
            path: '/movies',
            hostname: 'mysite.com',
            referrer: 'https://mysite.com/home',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.ingested).toBe(2);
    expect(body.duplicates).toBe(0);

    // Verify in database: events table
    const db = getDatabase();
    const eventRows = await db
      .select()
      .from(events)
      .where(eq(events.site_id, testSiteId));

    expect(eventRows.length).toBe(2);
    const found1 = eventRows.find((e) => e.event_id === event1Id);
    expect(found1).toBeDefined();
    // Verify query parameters were stripped from path
    expect(found1?.path).toBe('/home');
    expect(found1?.hostname).toBe('mysite.com');
    expect(found1?.referrer).toBe('https://twitter.com');
    expect(found1?.origin).toBe('https://mysite.com');
    expect(found1?.user_agent).toContain('Mozilla/5.0');

    // Verify in database: page_views table
    const pvRows = await db
      .select()
      .from(pageViews)
      .where(eq(pageViews.site_id, testSiteId));

    expect(pvRows.length).toBe(2);
    const pv1 = pvRows.find((p) => p.event_id === event1Id);
    expect(pv1).toBeDefined();
    expect(pv1?.path).toBe('/home');
  });

  it('POST /api/v1/collect accepts text/plain JSON payload from sendBeacon', async () => {
    const eventId = 'evt_test_beacon_001';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        origin: 'https://mysite.com',
      },
      payload: JSON.stringify({
        siteId: testSiteId,
        events: [
          {
            eventId,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/watch',
            hostname: 'mysite.com',
            referrer: '',
          },
        ],
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.ingested).toBe(1);
  });

  it('POST /api/v1/collect rejects unknown or non-existent siteId with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'content-type': 'application/json' },
      payload: {
        siteId: 'site_does_not_exist',
        events: [
          {
            eventId: 'evt_fail_site',
            type: 'page_view',
            timestamp: Date.now(),
            path: '/',
            hostname: 'example.com',
            referrer: '',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_SITE_ID');
  });

  it('POST /api/v1/collect rejects invalid event types', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'content-type': 'application/json' },
      payload: {
        siteId: testSiteId,
        events: [
          {
            eventId: 'evt_invalid_type',
            type: 'bad type with spaces & symbols!',
            timestamp: Date.now(),
            path: '/',
            hostname: 'example.com',
            referrer: '',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/collect rejects unrealistic timestamps', async () => {
    // 60 days in the past
    const distantPast = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'content-type': 'application/json' },
      payload: {
        siteId: testSiteId,
        events: [
          {
            eventId: 'evt_old_time',
            type: 'page_view',
            timestamp: distantPast,
            path: '/',
            hostname: 'example.com',
            referrer: '',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Timestamp is invalid or out of acceptable range');
  });

  it('POST /api/v1/collect enforces domain validation when domains configured', async () => {
    // 1. Valid request matching configured domain
    const validRes = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        origin: 'https://allowed.example.com',
      },
      payload: {
        siteId: restrictedSiteId,
        events: [
          {
            eventId: 'evt_domain_valid',
            type: 'page_view',
            timestamp: Date.now(),
            path: '/welcome',
            hostname: 'allowed.example.com',
            referrer: '',
          },
        ],
      },
    });

    expect(validRes.statusCode).toBe(200);
    expect(JSON.parse(validRes.payload).ingested).toBe(1);

    // 2. Invalid origin
    const invalidOriginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil-unauthorized.com',
      },
      payload: {
        siteId: restrictedSiteId,
        events: [
          {
            eventId: 'evt_domain_invalid_orig',
            type: 'page_view',
            timestamp: Date.now(),
            path: '/welcome',
            hostname: 'allowed.example.com',
            referrer: '',
          },
        ],
      },
    });

    expect(invalidOriginRes.statusCode).toBe(403);
    expect(JSON.parse(invalidOriginRes.payload).error.code).toBe('DOMAIN_NOT_ALLOWED');

    // 3. Invalid hostname in event
    const invalidHostRes = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        origin: 'https://allowed.example.com',
      },
      payload: {
        siteId: restrictedSiteId,
        events: [
          {
            eventId: 'evt_domain_invalid_host',
            type: 'page_view',
            timestamp: Date.now(),
            path: '/welcome',
            hostname: 'phishing-site.com',
            referrer: '',
          },
        ],
      },
    });

    expect(invalidHostRes.statusCode).toBe(403);
    expect(JSON.parse(invalidHostRes.payload).error.code).toBe('DOMAIN_NOT_ALLOWED');
  });

  it('Deduplication: replaying the same eventId does NOT duplicate records', async () => {
    const replayEventId = 'evt_dedup_unique_123';

    // First attempt
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'content-type': 'application/json' },
      payload: {
        siteId: testSiteId,
        events: [
          {
            eventId: replayEventId,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/dedup-test',
            hostname: 'mysite.com',
            referrer: '',
          },
        ],
      },
    });

    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.payload);
    expect(body1.ingested).toBe(1);
    expect(body1.duplicates).toBe(0);

    // Replay attempt with same eventId
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'content-type': 'application/json' },
      payload: {
        siteId: testSiteId,
        events: [
          {
            eventId: replayEventId,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/dedup-test',
            hostname: 'mysite.com',
            referrer: '',
          },
        ],
      },
    });

    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.ingested).toBe(0);
    expect(body2.duplicates).toBe(1);

    // Verify DB has only 1 record
    const db = getDatabase();
    const rows = await db
      .select()
      .from(pageViews)
      .where(eq(pageViews.event_id, replayEventId));

    expect(rows.length).toBe(1);
  });

  it('GET /api/v1/projects/:id/pageviews lists ingested page views', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${testProjectId}/pageviews`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(3);
    expect(body[0]).toHaveProperty('event_id');
    expect(body[0]).toHaveProperty('path');
    expect(body[0]).toHaveProperty('timestamp');
  });
});
