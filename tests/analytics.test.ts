import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';

describe('Phase 3 — Analytics Dashboard Endpoints (/analytics/*)', () => {
  let app: FastifyInstance;
  const adminSecret = 'analytics_test_secret_12345';
  const meowSecret = '12345678901234567890123456789012';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let siteId: string;
  let emptySiteId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = '*';

    await migrateDatabase('memory://');
    app = await buildApp();

    // 1. Create project with traffic
    const p1 = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Analytics Active Project' },
    });
    siteId = JSON.parse(p1.payload).site_id;

    // 2. Create empty project
    const p2 = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Analytics Empty Project' },
    });
    emptySiteId = JSON.parse(p2.payload).site_id;

    // Ingest controlled data into active project:
    // Visitor 1: Session 1 (new visitor) -> 2 page views (/home, /docs) in 60s
    const v1 = 'mv_user_analytics_1';
    const s1 = 'ms_session_analytics_1';
    const now = Date.now();
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: 'ev_a1',
            type: 'page_view',
            timestamp: now - 3 * 60 * 1000,
            path: '/home',
            hostname: 'example.com',
            referrer: '',
            visitorId: v1,
            sessionId: s1,
          },
          {
            eventId: 'ev_a2',
            type: 'page_view',
            timestamp: now - 2 * 60 * 1000,
            path: '/docs',
            hostname: 'example.com',
            referrer: '',
            visitorId: v1,
            sessionId: s1,
          },
        ],
      },
    });

    // Visitor 1: Session 2 (returning visitor) -> 1 page view (/blog) - bounce
    const s2 = 'ms_session_analytics_2';
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: 'ev_a3',
            type: 'page_view',
            timestamp: now - 1 * 60 * 1000,
            path: '/blog',
            hostname: 'example.com',
            referrer: '',
            visitorId: v1,
            sessionId: s2,
          },
        ],
      },
    });

    // Visitor 2: Session 3 (new visitor) -> 1 page view (/pricing) - bounce
    const v2 = 'mv_user_analytics_2';
    const s3 = 'ms_session_analytics_3';
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: 'ev_a4',
            type: 'page_view',
            timestamp: now - 30 * 1000,
            path: '/pricing',
            hostname: 'example.com',
            referrer: '',
            visitorId: v2,
            sessionId: s3,
          },
        ],
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('1. GET /analytics/visitors returns Estimated Unique Visitors, new visitors, and returning visitors', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/visitors?siteId=${siteId}`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.siteId).toBe(siteId);
    expect(data.uniqueVisitors).toBe(2);
    expect(data.estimatedUniqueVisitors).toBe(2);
    expect(data.newVisitors).toBe(2); // v1 and v2 both had their first session in period
    expect(data.returningVisitors).toBe(1); // v1 also had a returning session in period
    expect(data.returningVisitorRate).toBe(50); // 1 / 2 = 50%
    expect(data.limitationNote).toBeDefined();
    expect(data.limitationNote).toContain('Estimated Unique Visitors');
  });

  it('2. GET /api/v1/analytics/visitors alias works identically', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/visitors?siteId=${siteId}`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);
    expect(data.estimatedUniqueVisitors).toBe(2);
  });

  it('3. GET /analytics/sessions returns sessions, pageViews, bounceRate, avgDuration, pagesPerSession', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/sessions?siteId=${siteId}`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.sessions).toBe(3); // s1, s2, s3
    expect(data.pageViews).toBe(4); // 2 in s1 + 1 in s2 + 1 in s3
    expect(data.bounceRateDefinition).toBeDefined();
    expect(data.bounceRateDefinition).toContain('Sessions containing exactly one qualifying page view');

    // 2 bounces out of 3 sessions = 66.67%
    expect(data.bounceRate).toBeCloseTo(66.67, 1);

    // 4 page views / 3 sessions = 1.33
    expect(data.pagesPerSession).toBeCloseTo(1.33, 1);

    // Duration: s1 duration = 60s, s2 duration = 0, s3 duration = 0 -> average = 20s
    expect(data.averageSessionDuration).toBeCloseTo(20, 1);
  });

  it('4. GET /analytics/live returns real-time active visitors within 5 minutes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/live?siteId=${siteId}&windowMinutes=5`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.siteId).toBe(siteId);
    expect(data.liveVisitors).toBe(2); // both v1 and v2 had activity within last 5 minutes
    expect(data.liveSessions).toBe(3);
    expect(data.windowMinutes).toBe(5);
    expect(Array.isArray(data.activePages)).toBe(true);
    expect(data.activePages.length).toBeGreaterThan(0);
  });

  it('5. GET /analytics/overview combines all core metrics in a single payload', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteId}`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.metrics.estimatedUniqueVisitors).toBe(2);
    expect(data.metrics.sessions).toBe(3);
    expect(data.metrics.pageViews).toBe(4);
    expect(data.metrics.liveVisitors).toBe(2);
    expect(data.limitationNote).toBeDefined();
  });

  it('6. Avoids division by zero when a project has 0 sessions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/sessions?siteId=${emptySiteId}`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.sessions).toBe(0);
    expect(data.pageViews).toBe(0);
    expect(data.bounceRate).toBe(0);
    expect(data.averageSessionDuration).toBe(0);
    expect(data.pagesPerSession).toBe(0);
  });
});
