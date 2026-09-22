import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';

describe('Phase 6 — Custom Events, Event Properties, Downloads & Outbound Clicks', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_phase6';
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
      payload: { name: 'Phase 6 Events Site', timezone: 'UTC' },
    });
    const projData = JSON.parse(projRes.payload);
    projectId = projData.id;
    siteId = projData.site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  // 1. Custom Events & Event Properties
  it('ingests custom event "Signup" without properties', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_signup_01',
            type: 'custom',
            eventName: 'Signup',
            timestamp: Date.now() - 5000,
            path: '/register',
            hostname: 'example.com',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.ingested).toBe(1);
  });

  it('ingests custom event "Play Movie" with properties', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_play_01',
            type: 'custom',
            eventName: 'Play Movie',
            timestamp: Date.now() - 4000,
            path: '/watch/123',
            hostname: 'example.com',
            properties: {
              movieId: '123',
              category: 'action',
            },
          },
          {
            eventId: 'evt_p6_play_02',
            type: 'custom',
            eventName: 'Play Movie',
            timestamp: Date.now() - 3000,
            path: '/watch/456',
            hostname: 'example.com',
            properties: {
              movieId: '456',
              category: 'comedy',
            },
          },
          {
            eventId: 'evt_p6_play_03',
            type: 'custom',
            eventName: 'Play Movie',
            timestamp: Date.now() - 2000,
            path: '/watch/789',
            hostname: 'example.com',
            properties: {
              movieId: '789',
              category: 'action',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ingested).toBe(3);
  });

  // 2. Sensitive Data Filtering
  it('filters sensitive properties (passwords, tokens, cookies, secrets)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_sensitive_01',
            type: 'custom',
            eventName: 'Form Submission',
            timestamp: Date.now() - 1000,
            path: '/login',
            hostname: 'example.com',
            properties: {
              username: 'alice',
              password: 'superSecretPassword123!',
              token: 'ghp_xxxx1234567890',
              user_secret: 'confidential_data',
              auth_cookie: 'session=xyz987',
              allowed_field: 'valid_data',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);

    // Verify detail endpoint reveals sensitive keys were stripped
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events/detail?eventName=Form Submission`,
      headers: authHeaders,
    });

    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.payload);
    const propertyKeys = Object.keys(detail.properties || {});
    expect(propertyKeys).toContain('allowed_field');
    expect(propertyKeys).not.toContain('password');
    expect(propertyKeys).not.toContain('token');
    expect(propertyKeys).not.toContain('user_secret');
    expect(propertyKeys).not.toContain('auth_cookie');
  });

  // 3. Property Limits: Max Payload Size, String Length, Nesting Depth
  it('rejects oversized properties (> 16 KB payload limit)', async () => {
    const hugeString = 'x'.repeat(17000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_huge_01',
            type: 'custom',
            eventName: 'Huge Event',
            timestamp: Date.now(),
            path: '/test',
            hostname: 'example.com',
            properties: {
              data: hugeString,
            },
          },
        ],
      },
    });

    // Body validation rejects oversized JSON payload
    expect(res.statusCode).toBe(400);
  });

  it('rejects event name longer than 128 characters', async () => {
    const longName = 'A'.repeat(130);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_long_name',
            type: 'custom',
            eventName: longName,
            timestamp: Date.now(),
            path: '/test',
            hostname: 'example.com',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('sanitizes nested properties exceeding maximum nesting depth (depth > 2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_nested_01',
            type: 'custom',
            eventName: 'Nested Test',
            timestamp: Date.now(),
            path: '/nested',
            hostname: 'example.com',
            properties: {
              level1: {
                level2: {
                  level3: 'too deep',
                },
              },
              topKey: 'shallow',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events/detail?eventName=Nested Test`,
      headers: authHeaders,
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.payload);
    expect(Object.keys(detail.properties || {})).toContain('topKey');
  });

  it('handles malformed properties safely and sanitizes corrupt payloads (Section 15)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_malformed_01',
            type: 'custom',
            eventName: 'Malformed Properties Test',
            timestamp: Date.now(),
            path: '/malformed',
            hostname: 'example.com',
            properties: {
              '   paddedKey   ': 'trimmed value',
              numericVal: 42.5,
              booleanVal: true,
              nullVal: null,
              arrayVal: ['safe', 'items'],
              veryLongValue: 'z'.repeat(700), // Should be capped at MAX_VALUE_LENGTH (512)
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ingested).toBe(1);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events/detail?eventName=Malformed Properties Test`,
      headers: authHeaders,
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.payload);
    const props = detail.properties || {};
    expect(props).toHaveProperty('paddedKey');
    expect(props).toHaveProperty('numericVal');
    expect(props).toHaveProperty('booleanVal');
    expect(props).toHaveProperty('veryLongValue');
  });

  it('ingests and tracks automatic session_start event (Section 8)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_session_start_01',
            type: 'session_start',
            eventName: 'session_start',
            timestamp: Date.now(),
            path: '/landing',
            hostname: 'example.com',
            properties: {
              source: 'direct',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ingested).toBe(1);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events`,
      headers: authHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const eventsList = JSON.parse(listRes.payload).events;
    const sessionStart = eventsList.find((e: any) => e.eventName === 'session_start');
    expect(sessionStart).toBeDefined();
    expect(sessionStart.count).toBeGreaterThanOrEqual(1);
  });

  // 4. Deduplication
  it('deduplicates duplicate eventId ingestion gracefully', async () => {
    const duplicateEventId = 'evt_p6_dup_test_01';
    const payload = {
      siteId,
      events: [
        {
          eventId: duplicateEventId,
          type: 'custom',
          eventName: 'Dedup Check',
          timestamp: Date.now() - 100,
          path: '/dedup',
          hostname: 'example.com',
        },
      ],
    };

    // First ingestion
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
      payload,
    });
    expect(res1.statusCode).toBe(200);

    // Second ingestion with duplicate eventId
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
      payload,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.duplicates).toBe(1);

    // Verify count in events list is only 1
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events`,
      headers: authHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const eventsList = JSON.parse(listRes.payload).events;
    const dedupEntry = eventsList.find((e: any) => e.eventName === 'Dedup Check');
    expect(dedupEntry).toBeDefined();
    expect(dedupEntry.count).toBe(1);
  });

  // 5. Automatic Events: Downloads and Outbound Clicks
  it('tracks downloads with filename, extension, and path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_dl_01',
            type: 'download',
            eventName: 'download',
            timestamp: Date.now(),
            path: '/downloads',
            hostname: 'example.com',
            properties: {
              filename: 'report-2026.pdf',
              extension: 'pdf',
              url: 'https://example.com/files/report-2026.pdf',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events`,
      headers: authHeaders,
    });
    const list = JSON.parse(listRes.payload).events;
    const dlEvent = list.find((e: any) => e.eventName === 'download');
    expect(dlEvent).toBeDefined();
    expect(dlEvent.count).toBeGreaterThanOrEqual(1);
  });

  it('tracks outbound clicks with destination hostname and path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'evt_p6_out_01',
            type: 'outbound_click',
            eventName: 'outbound_click',
            timestamp: Date.now(),
            path: '/links',
            hostname: 'example.com',
            properties: {
              destination: 'github.com',
              url: 'https://github.com/my-org/repo',
            },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events`,
      headers: authHeaders,
    });
    const list = JSON.parse(listRes.payload).events;
    const outEvent = list.find((e: any) => e.eventName === 'outbound_click');
    expect(outEvent).toBeDefined();
    expect(outEvent.count).toBeGreaterThanOrEqual(1);
  });

  // 6. Event Dashboard & Property Analytics
  it('returns aggregated event dashboard with count, unique visitors, and sessions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const events = JSON.parse(res.payload).events;
    expect(Array.isArray(events)).toBe(true);

    const playMovie = events.find((e: any) => e.eventName === 'Play Movie');
    expect(playMovie).toBeDefined();
    expect(playMovie.count).toBe(3);
    expect(playMovie.uniqueVisitors).toBeGreaterThanOrEqual(1);
    expect(playMovie.sessions).toBeGreaterThanOrEqual(1);
  });

  it('returns event detail with occurrences, visitors, sessions, paths, and timeseries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events/detail?eventName=Play Movie`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const detail = JSON.parse(res.payload);
    expect(detail.eventName).toBe('Play Movie');
    expect(detail.occurrences).toBe(3);
    expect(detail.visitors).toBeGreaterThanOrEqual(1);
    expect(detail.sessions).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(detail.paths)).toBe(true);
    expect(detail.paths.length).toBeGreaterThan(0);
    expect(Array.isArray(detail.timeseries)).toBe(true);
    expect(typeof detail.properties).toBe('object');
  });

  it('groups event properties (e.g. Play Movie category: action, comedy)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/analytics/events/properties?eventName=Play Movie&property=category`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.eventName).toBe('Play Movie');
    expect(data.property).toBe('category');
    expect(data.totalValues).toBe(3);

    const action = data.values.find((v: any) => v.value === 'action');
    const comedy = data.values.find((v: any) => v.value === 'comedy');
    expect(action).toBeDefined();
    expect(action.count).toBe(2);
    expect(comedy).toBeDefined();
    expect(comedy.count).toBe(1);
  });
});
