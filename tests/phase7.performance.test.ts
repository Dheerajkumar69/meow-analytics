import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase } from '@meow-analytics/database';
import { FastifyInstance } from 'fastify';
import { classifyMetric, WEB_VITALS_THRESHOLDS, calculatePercentile } from '@meow-analytics/shared';
import { createPerformanceObserverController } from '@meow-analytics/sdk';
import { sql } from 'drizzle-orm';

describe('Phase 7 — Web Performance / Speed Insights Tests (Section 1-16)', () => {
  let app: FastifyInstance;
  const adminSecret = 'phase7_test_admin_secret_token_12345';
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

    // Create target project
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Phase 7 Performance Project', timezone: 'UTC' },
    });
    const proj = JSON.parse(projRes.payload);
    projectId = proj.id;
    siteId = proj.site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  describe('1. Documented Web Vitals Thresholds & Classification', () => {
    it('uses standard Google Web Vitals thresholds without undocumented arbitrary limits', () => {
      expect(WEB_VITALS_THRESHOLDS.lcp.good).toBe(2500);
      expect(WEB_VITALS_THRESHOLDS.lcp.poor).toBe(4000);
      expect(WEB_VITALS_THRESHOLDS.inp.good).toBe(200);
      expect(WEB_VITALS_THRESHOLDS.inp.poor).toBe(500);
      expect(WEB_VITALS_THRESHOLDS.cls.good).toBe(0.1);
      expect(WEB_VITALS_THRESHOLDS.cls.poor).toBe(0.25);
      expect(WEB_VITALS_THRESHOLDS.fcp.good).toBe(1800);
      expect(WEB_VITALS_THRESHOLDS.fcp.poor).toBe(3000);
      expect(WEB_VITALS_THRESHOLDS.ttfb.good).toBe(800);
      expect(WEB_VITALS_THRESHOLDS.ttfb.poor).toBe(1800);
    });

    it('correctly classifies metric values into good, needs-improvement, and poor', () => {
      expect(classifyMetric('lcp', 1800)).toBe('good');
      expect(classifyMetric('lcp', 3200)).toBe('needs-improvement');
      expect(classifyMetric('lcp', 4500)).toBe('poor');

      expect(classifyMetric('inp', 120)).toBe('good');
      expect(classifyMetric('inp', 350)).toBe('needs-improvement');
      expect(classifyMetric('inp', 600)).toBe('poor');

      expect(classifyMetric('cls', 0.04)).toBe('good');
      expect(classifyMetric('cls', 0.18)).toBe('needs-improvement');
      expect(classifyMetric('cls', 0.35)).toBe('poor');

      expect(classifyMetric('fcp', 1100)).toBe('good');
      expect(classifyMetric('fcp', 2200)).toBe('needs-improvement');
      expect(classifyMetric('fcp', 3500)).toBe('poor');

      expect(classifyMetric('ttfb', 400)).toBe('good');
      expect(classifyMetric('ttfb', 1200)).toBe('needs-improvement');
      expect(classifyMetric('ttfb', 2100)).toBe('poor');

      expect(classifyMetric('lcp', null)).toBeNull();
    });
  });

  describe('2. SDK Performance Observer Non-blocking & Fallbacks', () => {
    it('handles unsupported browser environments gracefully without throwing', () => {
      // In Node environment, window and PerformanceObserver are not defined
      const reports: any[] = [];
      const controller = createPerformanceObserverController({
        sampleRate: 1.0,
        onReport: (data) => reports.push(data),
      });

      expect(controller).toBeDefined();
      expect(typeof controller.destroy).toBe('function');
      expect(typeof controller.flush).toBe('function');
      expect(typeof controller.getData).toBe('function');

      const snapshot = controller.getData();
      expect(snapshot).toBeDefined();
      expect(snapshot.sampleRate).toBe(1.0);

      // Verify destroy executes cleanly
      expect(() => controller.destroy()).not.toThrow();
    });

    it('respects sampling rate: disables tracking if not sampled', () => {
      const reports: any[] = [];
      // Force sampleRate to 0.0 -> never sampled
      const controller = createPerformanceObserverController({
        sampleRate: 0.0,
        onReport: (data) => reports.push(data),
      });

      controller.flush();
      expect(reports.length).toBe(0);
      expect(controller.getData().sampleRate).toBe(0);
      controller.destroy();
    });
  });

  describe('3. Ingestion: Dedicated POST /api/v1/performance and Batch POST /api/v1/collect', () => {
    it('ingests performance metrics via dedicated POST /api/v1/performance', async () => {
      const now = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/performance',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        },
        payload: {
          siteId,
          metrics: [
            {
              path: '/home',
              timestamp: now,
              device: 'desktop',
              lcp: 1950,
              inp: 95,
              cls: 0.025,
              fcp: 1100,
              ttfb: 250,
              dns: 40,
              connection: 60,
              request: 80,
              response: 120,
              domLoading: 300,
              pageLoad: 1600,
              sampleRate: 1.0,
            },
            {
              path: '/movies',
              timestamp: now,
              device: 'mobile',
              lcp: 2400,
              inp: 180,
              cls: 0.06,
              fcp: 1400,
              ttfb: 320,
              dns: 65,
              connection: 90,
              request: 110,
              response: 160,
              domLoading: 450,
              pageLoad: 2200,
              sampleRate: 1.0,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.ingested).toBe(2);
    });

    it('ingests performance metrics via batch POST /api/v1/collect', async () => {
      const now = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        },
        payload: {
          siteId,
          events: [
            {
              eventId: 'evt_perf_watch_01',
              type: 'performance',
              eventName: 'performance',
              timestamp: now,
              path: '/watch',
              hostname: 'example.com',
              properties: {
                path: '/watch',
                device: 'mobile',
                lcp: 2800,
                inp: 210,
                cls: 0.09,
                fcp: 1600,
                ttfb: 410,
                dns: 80,
                connection: 110,
                request: 130,
                response: 190,
                domLoading: 520,
                pageLoad: 2600,
                sampleRate: 1.0,
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.ingested).toBe(1);

      // Verify row in database
      const db = getDatabase();
      const rows = await db.execute(sql`SELECT * FROM performance_metrics WHERE path = '/watch'`);
      expect(rows.rows.length).toBeGreaterThan(0);
      const r = rows.rows[0] as any;
      expect(Number(r.lcp)).toBe(2800);
      expect(Number(r.inp)).toBe(210);
      expect(r.rating_lcp).toBe('needs-improvement');
    });
  });

  describe('4. Multiple Routes (/home, /movies, /watch, /search) & Device Breakdown', () => {
    it('correctly filters and compares performance per route and device', async () => {
      const now = Date.now();
      // Insert specific data for /search
      await app.inject({
        method: 'POST',
        url: '/api/v1/performance',
        payload: {
          siteId,
          metrics: {
            path: '/search',
            timestamp: now,
            device: 'desktop',
            lcp: 1400,
            inp: 70,
            cls: 0.01,
            fcp: 800,
            ttfb: 190,
          },
        },
      });

      // Query performance for /search
      const searchRes = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/performance?siteId=${siteId}&path=/search`,
      });
      expect(searchRes.statusCode).toBe(200);
      const searchData = JSON.parse(searchRes.payload);

      expect(searchData.summary.lcp.p75).toBe(1400);
      expect(searchData.summary.lcp.rating).toBe('good');

      // Query performance by device = desktop
      const desktopRes = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/performance?siteId=${siteId}&device=desktop`,
      });
      expect(desktopRes.statusCode).toBe(200);
      const desktopData = JSON.parse(desktopRes.payload);
      expect(desktopData.byDevice.some((d: any) => d.device === 'desktop')).toBe(true);

      // Verify all routes appear in byPage
      const allRes = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/performance?siteId=${siteId}`,
      });
      const allData = JSON.parse(allRes.payload);
      const paths = allData.byPage.map((p: any) => p.path);
      expect(paths).toContain('/home');
      expect(paths).toContain('/movies');
      expect(paths).toContain('/watch');
      expect(paths).toContain('/search');
    });
  });

  describe('5. Sampling Rate and Sampled Indicator', () => {
    it('sets isSampled flag and reports sampleRate when sampling is configured', async () => {
      const sampleProjRes = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: authHeaders,
        payload: { name: 'Sampled Project', timezone: 'UTC' },
      });
      const sampleSiteId = JSON.parse(sampleProjRes.payload).site_id;

      // Ingest sampled event with sampleRate: 0.25 (25%)
      await app.inject({
        method: 'POST',
        url: '/api/v1/performance',
        payload: {
          siteId: sampleSiteId,
          metrics: {
            path: '/home',
            timestamp: Date.now(),
            lcp: 1500,
            fcp: 900,
            sampleRate: 0.25,
          },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/performance?siteId=${sampleSiteId}`,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.isSampled).toBe(true);
      expect(data.sampleRate).toBe(0.25);
    });
  });
});
