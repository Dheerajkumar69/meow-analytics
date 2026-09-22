import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';

describe('Meow Analytics — Production Hardening & Advanced Analytics Integration Tests', () => {
  let app: FastifyInstance;
  const adminSecret = 'prod_test_admin_secret_998877';
  const meowSecret = '12345678901234567890123456789012';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let projectAId: string;
  let siteIdA: string;
  let projectBId: string;
  let siteIdB: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = '*';

    await migrateDatabase('memory://');
    app = await buildApp();

    // 1. Create Project A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Production Project A' },
    });
    const pA = JSON.parse(resA.payload);
    projectAId = pA.id;
    siteIdA = pA.site_id;

    // 2. Create Project B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Production Project B' },
    });
    const pB = JSON.parse(resB.payload);
    projectBId = pB.id;
    siteIdB = pB.site_id;

    // Ingest data into Project A:
    // Visitor 1: hits / -> /signup -> /dashboard
    const now = Date.now();
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId: siteIdA,
        events: [
          {
            eventId: 'ev_a1',
            type: 'page_view',
            timestamp: now - 10 * 60 * 1000,
            path: '/',
            hostname: 'app.example.com',
            referrer: 'https://google.com',
            visitorId: 'vis_user_1',
            sessionId: 'sess_1',
          },
          {
            eventId: 'ev_a2',
            type: 'page_view',
            timestamp: now - 8 * 60 * 1000,
            path: '/signup',
            hostname: 'app.example.com',
            referrer: '',
            visitorId: 'vis_user_1',
            sessionId: 'sess_1',
          },
          {
            eventId: 'ev_a3',
            type: 'page_view',
            timestamp: now - 5 * 60 * 1000,
            path: '/dashboard',
            hostname: 'app.example.com',
            referrer: '',
            visitorId: 'vis_user_1',
            sessionId: 'sess_1',
          },
          {
            eventId: 'ev_a4',
            type: 'custom_event',
            eventName: 'completed_onboarding',
            timestamp: now - 3 * 60 * 1000,
            path: '/dashboard',
            hostname: 'app.example.com',
            visitorId: 'vis_user_1',
            sessionId: 'sess_1',
          },
        ],
      },
    });

    // Visitor 2: hits / -> /signup (drops off before /dashboard)
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId: siteIdA,
        events: [
          {
            eventId: 'ev_b1',
            type: 'page_view',
            timestamp: now - 6 * 60 * 1000,
            path: '/',
            hostname: 'marketing.example.com',
            referrer: 'https://twitter.com',
            visitorId: 'vis_user_2',
            sessionId: 'sess_2',
          },
          {
            eventId: 'ev_b2',
            type: 'page_view',
            timestamp: now - 4 * 60 * 1000,
            path: '/signup',
            hostname: 'marketing.example.com',
            referrer: '',
            visitorId: 'vis_user_2',
            sessionId: 'sess_2',
          },
        ],
      },
    });

    // Ingest data into Project B (isolated):
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId: siteIdB,
        events: [
          {
            eventId: 'ev_b_only',
            type: 'page_view',
            timestamp: now - 2 * 60 * 1000,
            path: '/secret-b-route',
            hostname: 'isolated-b.com',
            visitorId: 'vis_b_only',
            sessionId: 'sess_b_only',
          },
        ],
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDatabaseConnection();
  });

  it('1. Live Realtime Endpoint (/analytics/live) returns active visitors, timeline, and recent events stream', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/live?siteId=${siteIdA}&windowMinutes=15`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.siteId).toBe(siteIdA);
    expect(data.liveVisitors).toBeGreaterThanOrEqual(1);
    expect(data.liveSessions).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.activePages)).toBe(true);

    // Timeline sparkline points
    expect(Array.isArray(data.timeline)).toBe(true);
    expect(data.timeline.length).toBeGreaterThan(0);
    expect(data.timeline[0]).toHaveProperty('minute');
    expect(data.timeline[0]).toHaveProperty('visitors');
    expect(data.timeline[0]).toHaveProperty('pageViews');

    // Recent events stream
    expect(Array.isArray(data.recentEvents)).toBe(true);
    expect(data.recentEvents.length).toBeGreaterThan(0);
    expect(data.recentEvents[0]).toHaveProperty('type');
    expect(data.recentEvents[0]).toHaveProperty('timestamp');
  });

  it('2. Content Endpoint (/analytics/pages) supports top, landing, exit, and hostnames', async () => {
    // Landing pages
    const landingRes = await app.inject({
      method: 'GET',
      url: `/analytics/pages?siteId=${siteIdA}&type=landing`,
    });
    expect(landingRes.statusCode).toBe(200);
    const landingData = JSON.parse(landingRes.payload);
    expect(landingData.pages.length).toBeGreaterThanOrEqual(1);
    expect(landingData.pages[0].path).toBe('/');

    // Hostnames
    const hostnamesRes = await app.inject({
      method: 'GET',
      url: `/analytics/pages?siteId=${siteIdA}&type=hostnames`,
    });
    expect(hostnamesRes.statusCode).toBe(200);
    const hostData = JSON.parse(hostnamesRes.payload);
    const hosts = hostData.pages.map((p: any) => p.path);
    expect(hosts).toContain('app.example.com');
    expect(hosts).toContain('marketing.example.com');
  });

  it('3. Funnels Endpoint (/analytics/funnels) accurately calculates multi-step progression & drop-off', async () => {
    const steps = [
      { name: 'Landing', type: 'pageview', target: '/' },
      { name: 'Signup', type: 'pageview', target: '/signup' },
      { name: 'Dashboard', type: 'pageview', target: '/dashboard' },
    ];

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/funnels?siteId=${siteIdA}&steps=${encodeURIComponent(JSON.stringify(steps))}`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.siteId).toBe(siteIdA);
    expect(data.steps.length).toBe(3);

    // Step 1: 2 visitors started
    expect(data.steps[0].visitors).toBe(2);
    expect(data.steps[0].conversionRate).toBe(100);

    // Step 2: 2 visitors reached signup
    expect(data.steps[1].visitors).toBe(2);
    expect(data.steps[1].conversionRate).toBe(100);

    // Step 3: only 1 visitor reached dashboard (1 dropped off)
    expect(data.steps[2].visitors).toBe(1);
    expect(data.steps[2].conversionRate).toBe(50);
    expect(data.steps[2].dropOffCount).toBe(1);
    expect(data.steps[2].dropOffRate).toBe(50);

    // Overall conversion rate = 1 / 2 = 50%
    expect(data.overallConversionRate).toBe(50);
    expect(data.totalStarted).toBe(2);
    expect(data.totalCompleted).toBe(1);
  });

  it('4. Retention Endpoint (/analytics/retention) calculates cohorts properly', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/retention?siteId=${siteIdA}&cohortType=day`,
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.payload);

    expect(data.siteId).toBe(siteIdA);
    expect(data.cohortType).toBe('day');
    expect(Array.isArray(data.cohorts)).toBe(true);
    expect(data.cohorts.length).toBeGreaterThanOrEqual(1);

    const activeCohort = data.cohorts.find((c: any) => c.cohortSize > 0) || data.cohorts[data.cohorts.length - 1];
    expect(activeCohort.cohortSize).toBeGreaterThanOrEqual(1);
    expect(activeCohort.retention[0].periodIndex).toBe(0);
    expect(activeCohort.retention[0].percentage).toBe(100);
  });

  it('5. Filtered Export (/api/v1/projects/:id/export) strictly respects active dimension filters', async () => {
    // Export with filter for hostname = 'app.example.com' only
    const filters = [{ field: 'referrer', operator: 'equals', value: 'https://google.com' }];

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectAId}/export?format=csv&type=page_views&filters=${encodeURIComponent(JSON.stringify(filters))}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const csvLines = res.payload.trim().split('\n');

    // Header + data rows
    expect(csvLines.length).toBeGreaterThanOrEqual(2);
    // Should NOT contain twitter referrer
    expect(res.payload).not.toContain('https://twitter.com');
  });

  it('6. Strict Cross-Project Data Isolation: Project A and Project B never leak data', async () => {
    // Query Project B's pages
    const resB = await app.inject({
      method: 'GET',
      url: `/analytics/pages?siteId=${siteIdB}`,
    });

    const dataB = JSON.parse(resB.payload);
    const pathsB = dataB.pages.map((p: any) => p.path);

    // Project B must only see /secret-b-route
    expect(pathsB).toContain('/secret-b-route');
    // Must NOT contain Project A's paths
    expect(pathsB).not.toContain('/signup');
    expect(pathsB).not.toContain('/dashboard');

    // Export Project B: Must not contain Project A's event IDs or paths
    const exportB = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectBId}/export?format=json&type=page_views`,
      headers: authHeaders,
    });
    const exportDataB = JSON.parse(exportB.payload);
    const allPathsInB = (exportDataB.pageViews || exportDataB.data || []).map((item: any) => item.path);
    expect(allPathsInB).not.toContain('/signup');
    expect(allPathsInB).not.toContain('/dashboard');
  });
});
