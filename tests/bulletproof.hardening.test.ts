import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, getDatabase, visitors, sessions, projects, hourlyAggregates, dailyAggregates } from '@meow-analytics/database';
import { eq } from 'drizzle-orm';
import { runRetentionCleanup } from '../apps/api/src/lib/cleanup.js';
import { analyticsCache, buildAnalyticsCacheKey } from '../apps/api/src/lib/cache.js';
import { runHourlyAggregation, runDailyAggregation } from '../apps/api/src/lib/aggregation.js';

describe('Meow Analytics — Bulletproof Hardening & Architectural Invariants', () => {
  let app: FastifyInstance;
  const adminSecret = 'bulletproof_test_admin_secret_12345';
  const meowSecret = '12345678901234567890123456789012';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let testProjectId: string;
  let testSiteId: string;
  let testApiKey: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = '*';
    process.env.RATE_LIMIT_ENABLED = 'true';

    await migrateDatabase('memory://');
    app = await buildApp();

    // Create a primary project for testing
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Bulletproof Hardening Project' },
    });
    const proj = JSON.parse(res.payload);
    testProjectId = proj.id;
    testSiteId = proj.site_id;
    testApiKey = proj.api_key;
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. DATA INTEGRITY: Visitor Retention & Session Preservation Invariant
  describe('1. Data Retention & Integrity (Sessions survive visitor cleanup)', () => {
    it('nullifies visitor_id on session and retains session when 24h visitor is pruned', async () => {
      const db = getDatabase();
      const past25Hours = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const visitorId = 'vis_expired_test_1';
      const sessionId = 'sess_survive_test_1';

      // Insert an expired visitor (older than 24h)
      const visitorInsert = await db
        .insert(visitors)
        .values({
          id: visitorId,
          site_id: testSiteId,
          anonymous_id: 'anon_expired_test_1',
          first_seen_at: past25Hours,
          last_seen_at: past25Hours,
          first_path: '/',
          last_path: '/',
        })
        .returning();
      const expiredVisitor = visitorInsert[0];
      expect(expiredVisitor).toBeDefined();

      // Insert a session attached to this visitor
      const sessionInsert = await db
        .insert(sessions)
        .values({
          id: sessionId,
          session_id: sessionId,
          site_id: testSiteId,
          visitor_id: expiredVisitor.id,
          started_at: past25Hours,
          last_seen_at: past25Hours,
          landing_page: '/',
          exit_page: '/',
          duration_seconds: 120,
          page_views: 3,
        })
        .returning();
      const createdSession = sessionInsert[0];
      expect(createdSession).toBeDefined();
      expect(createdSession.visitor_id).toBe(expiredVisitor.id);

      // Run retention cleanup
      const report = await runRetentionCleanup({ batchSize: 100 });
      expect(report.visitorsCleaned).toBeGreaterThanOrEqual(1);

      // Verify the visitor was deleted
      const foundVisitor = await db.select().from(visitors).where(eq(visitors.id, expiredVisitor.id));
      expect(foundVisitor.length).toBe(0);

      // Verify the session STILL EXISTS with visitor_id set to null
      const foundSession = await db.select().from(sessions).where(eq(sessions.id, createdSession.id));
      expect(foundSession.length).toBe(1);
      expect(foundSession[0].visitor_id).toBeNull();
      expect(foundSession[0].duration_seconds).toBe(120);
      expect(foundSession[0].page_views).toBe(3);
    });
  });

  // 2. RATE LIMITING: Per-Site Request Body Protection
  describe('2. Rate Limiting Hardening (preValidation body inspection)', () => {
    it('enforces rate limits on /api/v1/collect when siteId is in the parsed JSON body', async () => {
      const requests = [];
      const testIp = '198.51.100.99';

      // Send 35 requests in burst to exceed the 30/sec burst limit
      for (let i = 0; i < 35; i++) {
        requests.push(
          app.inject({
            method: 'POST',
            url: '/api/v1/collect',
            headers: {
              'x-forwarded-for': testIp,
              'content-type': 'application/json',
            },
            payload: {
              siteId: testSiteId,
              events: [
                {
                  eventId: `ev_body_rl_${i}`,
                  type: 'page_view',
                  timestamp: Date.now(),
                  path: '/test-rate-limit',
                  hostname: 'bulletproof.internal',
                },
              ],
            },
          })
        );
      }

      const results = await Promise.all(requests);
      const rateLimited = results.some((r) => r.statusCode === 429);
      expect(rateLimited).toBe(true);

      const limitedRes = results.find((r) => r.statusCode === 429)!;
      expect(limitedRes.headers['retry-after']).toBeDefined();
      const payload = JSON.parse(limitedRes.payload);
      expect(payload.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  // 3. CACHE HARDENING: Exact Key Isolation (No Substring Collisions)
  describe('3. Cache Hardening (Exact Site Invalidation)', () => {
    it('invalidates only exact site matches without substring pollution', () => {
      const siteA = 'site_target';
      const siteB = 'site_target_extended';

      const keyA = buildAnalyticsCacheKey('overview', siteA, { period: '7d' });
      const keyB = buildAnalyticsCacheKey('overview', siteB, { period: '7d' });

      analyticsCache.set(keyA, { test: 'a' }, 60000);
      analyticsCache.set(keyB, { test: 'b' }, 60000);

      expect(analyticsCache.get(keyA)).toEqual({ test: 'a' });
      expect(analyticsCache.get(keyB)).toEqual({ test: 'b' });

      // Invalidate siteA
      analyticsCache.invalidateSite(siteA);

      // siteA is cleared, but siteB MUST remain cached
      expect(analyticsCache.get(keyA)).toBeNull();
      expect(analyticsCache.get(keyB)).toEqual({ test: 'b' });

      // Cleanup
      analyticsCache.invalidateSite(siteB);
      expect(analyticsCache.get(keyB)).toBeNull();
    });
  });

  // 4. SECURITY BOUNDARIES: Project Existence and Auth Enforcement
  describe('4. Security Boundaries (Non-existent project handling)', () => {
    it('returns 404 when querying non-existent project instead of bypassing auth', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${nonExistentId}/pageviews`,
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(404);
      const payload = JSON.parse(res.payload);
      expect(payload.error.code).toBe('NOT_FOUND');
    });
  });

  // 5. INPUT BOUNDARIES: Pagination Clamping
  describe('5. Pagination Bounds Hardening', () => {
    it('safely handles limit and offset on project raw data endpoints', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${testProjectId}/pageviews?limit=5&offset=0`,
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const rows = JSON.parse(res.payload);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeLessThanOrEqual(5);
    });

    it('returns array of events without crashing when limit is omitted', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${testProjectId}/events`,
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const rows = JSON.parse(res.payload);
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  // 6. INPUT NORMALIZATION: Hostname Sanitization
  describe('6. Input Normalization (Hostname sanitization)', () => {
    it('normalizes uppercase, protocols, and port numbers from hostname', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId: testSiteId,
          events: [
            {
              eventId: 'ev_norm_host_1',
              type: 'page_view',
              timestamp: Date.now(),
              path: '/sanitization-test',
              hostname: 'https://TEST-App.EXAMPLE.com:8443/extra/path',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify stored pageview hostname
      const pageviewRes = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${testProjectId}/pageviews`,
        headers: authHeaders,
      });

      const pageviews = JSON.parse(pageviewRes.payload);
      const matching = pageviews.find((pv: any) => pv.path === '/sanitization-test');
      expect(matching).toBeDefined();
      expect(matching.hostname).toBe('test-app.example.com');
    });
  });

  // 7. AGGREGATION HARDENING: Idempotency & Rolling Window Upsert Safety
  describe('7. Aggregation Hardening (Idempotency & Re-entrancy)', () => {
    it('executing hourly aggregation multiple times produces stable, non-duplicated records', async () => {
      const db = getDatabase();

      // Run hourly aggregation first time
      const count1 = await runHourlyAggregation({ all: true });
      expect(count1).toBeGreaterThanOrEqual(0);

      const beforeRows = await db
        .select()
        .from(hourlyAggregates)
        .where(eq(hourlyAggregates.site_id, testSiteId));

      // Run hourly aggregation second time (simulating repeated scheduler execution)
      const count2 = await runHourlyAggregation({ all: true });
      expect(count2).toBeGreaterThanOrEqual(0);

      const afterRows = await db
        .select()
        .from(hourlyAggregates)
        .where(eq(hourlyAggregates.site_id, testSiteId));

      // Row count should be identical due to ON CONFLICT DO UPDATE upsert
      expect(afterRows.length).toBe(beforeRows.length);
    });

    it('executing daily aggregation multiple times does not produce duplicate daily buckets', async () => {
      const db = getDatabase();

      await runDailyAggregation({ all: true });
      const beforeDaily = await db
        .select()
        .from(dailyAggregates)
        .where(eq(dailyAggregates.site_id, testSiteId));

      await runDailyAggregation({ all: true });
      const afterDaily = await db
        .select()
        .from(dailyAggregates)
        .where(eq(dailyAggregates.site_id, testSiteId));

      expect(afterDaily.length).toBe(beforeDaily.length);
    });
  });
});

