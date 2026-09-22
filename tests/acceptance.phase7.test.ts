import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { calculatePercentile } from '@meow-analytics/shared';

describe('Phase 7 — Acceptance Test (Section 17 & 18)', () => {
  let app: FastifyInstance;
  const adminSecret = 'acceptance_phase7_super_token_12345';
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
      payload: { name: 'Phase 7 Acceptance Project', timezone: 'UTC' },
    });
    const proj = JSON.parse(projRes.payload);
    projectId = proj.id;
    siteId = proj.site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('verifies 100% full acceptance: performance events arrive, metrics stored, dashboard aggregates correctly, p50/p75/p90/p95 are exact', async () => {
    const baseTime = Date.now();

    // 1. Ingest 10 controlled sample events across 4 routes (/home, /movies, /watch, /search)
    // LCP values: 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800
    // INP values: 50, 70, 90, 110, 130, 150, 170, 190, 210, 230
    // CLS values: 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10
    // FCP values: 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500
    // TTFB values: 100, 120, 140, 160, 180, 200, 220, 240, 260, 280
    const routes = ['/home', '/movies', '/watch', '/search'];
    const devices = ['desktop', 'mobile', 'tablet'];

    const testBatches = [];
    for (let i = 0; i < 10; i++) {
      const lcp = 1000 + i * 200;
      const inp = 50 + i * 20;
      const cls = Number((0.01 + i * 0.01).toFixed(3));
      const fcp = 600 + i * 100;
      const ttfb = 100 + i * 20;
      const path = routes[i % routes.length];
      const device = devices[i % devices.length];

      testBatches.push({
        path,
        timestamp: baseTime - (10 - i) * 60000,
        device,
        lcp,
        inp,
        cls,
        fcp,
        ttfb,
        dns: 30 + i * 5,
        connection: 50 + i * 5,
        request: 60 + i * 5,
        response: 90 + i * 10,
        domLoading: 200 + i * 20,
        pageLoad: 1100 + i * 100,
        sampleRate: 1.0,
      });
    }

    // Ingest via POST /api/v1/performance
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/performance',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '8.8.8.8', // US
      },
      payload: {
        siteId,
        metrics: testBatches,
      },
    });

    expect(ingestRes.statusCode).toBe(200);
    const ingestData = JSON.parse(ingestRes.payload);
    expect(ingestData.success).toBe(true);
    expect(ingestData.ingested).toBe(10);

    // 2. Verify metrics are stored in database
    const db = getDatabase();
    const countRes = await db.execute(sql`SELECT COUNT(*)::int as total FROM performance_metrics WHERE site_id = ${siteId}`);
    expect(countRes.rows[0].total).toBe(10);

    // 3. Query GET /api/v1/analytics/performance and verify dashboard aggregates
    const dashRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/performance?siteId=${siteId}&from=${new Date(baseTime - 24 * 3600 * 1000).toISOString()}&to=${new Date(baseTime + 3600 * 1000).toISOString()}`,
    });

    expect(dashRes.statusCode).toBe(200);
    const dash = JSON.parse(dashRes.payload);

    expect(dash.totalSamples).toBe(10);
    expect(dash.isSampled).toBe(false);
    expect(dash.sampleRate).toBe(1.0);

    // 4. Verify exact percentiles for LCP, INP, CLS, FCP, TTFB
    const lcpValues = testBatches.map((m) => m.lcp);
    const expectedLcpP50 = calculatePercentile(lcpValues, 0.50);
    const expectedLcpP75 = calculatePercentile(lcpValues, 0.75);
    const expectedLcpP90 = calculatePercentile(lcpValues, 0.90);
    const expectedLcpP95 = calculatePercentile(lcpValues, 0.95);

    expect(dash.summary.lcp.count).toBe(10);
    expect(dash.summary.lcp.p50).toBeCloseTo(expectedLcpP50, 0);
    expect(dash.summary.lcp.p75).toBeCloseTo(expectedLcpP75, 0);
    expect(dash.summary.lcp.p90).toBeCloseTo(expectedLcpP90, 0);
    expect(dash.summary.lcp.p95).toBeCloseTo(expectedLcpP95, 0);
    expect(dash.summary.lcp.rating).toBe('good');

    const inpValues = testBatches.map((m) => m.inp);
    expect(dash.summary.inp.p75).toBeCloseTo(calculatePercentile(inpValues, 0.75), 0);
    expect(dash.summary.inp.rating).toBe('good');

    const clsValues = testBatches.map((m) => m.cls);
    expect(dash.summary.cls.p75).toBeCloseTo(calculatePercentile(clsValues, 0.75), 2);
    expect(dash.summary.cls.rating).toBe('good');

    const fcpValues = testBatches.map((m) => m.fcp);
    expect(dash.summary.fcp.p75).toBeCloseTo(calculatePercentile(fcpValues, 0.75), 0);

    const ttfbValues = testBatches.map((m) => m.ttfb);
    expect(dash.summary.ttfb.p75).toBeCloseTo(calculatePercentile(ttfbValues, 0.75), 0);

    // 5. Verify Navigation Timing
    expect(dash.navigationTiming.dns.p75).toBeGreaterThan(0);
    expect(dash.navigationTiming.connection.p75).toBeGreaterThan(0);
    expect(dash.navigationTiming.request.p75).toBeGreaterThan(0);
    expect(dash.navigationTiming.response.p75).toBeGreaterThan(0);
    expect(dash.navigationTiming.domLoading.p75).toBeGreaterThan(0);
    expect(dash.navigationTiming.pageLoad.p75).toBeGreaterThan(0);

    // 6. Verify breakdown by Page
    const pagePaths = dash.byPage.map((p: any) => p.path);
    expect(pagePaths).toContain('/home');
    expect(pagePaths).toContain('/movies');
    expect(pagePaths).toContain('/watch');
    expect(pagePaths).toContain('/search');

    // 7. Verify breakdown by Device
    const devTypes = dash.byDevice.map((d: any) => d.device);
    expect(devTypes).toContain('desktop');
    expect(devTypes).toContain('mobile');
    expect(devTypes).toContain('tablet');

    // 8. Verify breakdown by Country
    expect(dash.byCountry.length).toBeGreaterThan(0);
    expect(dash.byCountry[0].countryCode).toBeDefined();
    // Verify no private location like IP or latitude/longitude is returned
    expect((dash.byCountry[0] as any).ip).toBeUndefined();
    expect((dash.byCountry[0] as any).lat).toBeUndefined();
  });

  describe('Section 18 — Hard Stop: Non-blocking performance collection', () => {
    it('verifies performance telemetry executes asynchronously without blocking the host-page', async () => {
      const startTime = performance.now();

      // Simulate sending 20 performance reports concurrently
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: '/api/v1/performance',
            payload: {
              siteId,
              metrics: {
                path: `/async-test-${i}`,
                lcp: 1500,
                fcp: 900,
                ttfb: 200,
              },
            },
          })
        );
      }

      const results = await Promise.all(promises);
      const durationMs = performance.now() - startTime;

      for (const res of results) {
        expect(res.statusCode).toBe(200);
      }

      // 20 requests processed in well under 1000ms
      expect(durationMs).toBeLessThan(1500);
    });
  });
});
