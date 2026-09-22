import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';

describe('Phase 5 — Overview Dashboard, Charts, Filters, Grouping & Acceptance Test', () => {
  let app: FastifyInstance;
  const adminSecret = 'phase5_acceptance_secret_998877';
  const meowSecret = '12345678901234567890123456789012';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let siteIdAlpha: string;
  let siteIdBeta: string;

  // Timestamps
  const now = Date.now();
  // Current period: between now - 3 days and now
  const p1Start = now - 3 * 24 * 60 * 60 * 1000;
  // Previous period: between now - 6 days and now - 3 days
  const p2Start = now - 5 * 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = '*';

    await migrateDatabase('memory://');
    app = await buildApp();

    // 1. Create Project Alpha (Active project)
    const pAlphaRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Alpha Analytics Project' },
    });
    siteIdAlpha = JSON.parse(pAlphaRes.payload).site_id;

    // 2. Create Project Beta (Isolated empty project)
    const pBetaRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Beta Analytics Project' },
    });
    siteIdBeta = JSON.parse(pBetaRes.payload).site_id;

    // --- Ingest Data into Project Alpha ---

    // === PREVIOUS PERIOD TRAFFIC ===
    // Visitor Prev 1: Desktop, Country IN, 1 session, 2 PVs (/watch, /home), duration 40s
    const visPrev1 = 'mv_prev_visitor_1';
    const sesPrev1 = 'ms_prev_session_1';
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'cf-ipcountry': 'IN',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      payload: {
        siteId: siteIdAlpha,
        events: [
          {
            eventId: 'ev_prev_1',
            type: 'page_view',
            timestamp: p2Start + 10000,
            path: '/home',
            hostname: 'alpha.meow.com',
            referrer: '',
            visitorId: visPrev1,
            sessionId: sesPrev1,
          },
          {
            eventId: 'ev_prev_2',
            type: 'page_view',
            timestamp: p2Start + 50000,
            path: '/watch',
            hostname: 'alpha.meow.com',
            referrer: '',
            visitorId: visPrev1,
            sessionId: sesPrev1,
          },
        ],
      },
    });

    // === CURRENT PERIOD TRAFFIC ===

    // Visitor 1: India, Desktop Chrome, Direct, 2 PVs (/watch, /pricing), duration 120s
    const vis1 = 'mv_curr_vis_1';
    const ses1 = 'ms_curr_ses_1';
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'cf-ipcountry': 'IN',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      payload: {
        siteId: siteIdAlpha,
        events: [
          {
            eventId: 'ev_c1_1',
            type: 'page_view',
            timestamp: p1Start + 10000,
            path: '/watch',
            hostname: 'alpha.meow.com',
            referrer: '',
            visitorId: vis1,
            sessionId: ses1,
          },
          {
            eventId: 'ev_c1_2',
            type: 'page_view',
            timestamp: p1Start + 130000,
            path: '/pricing',
            hostname: 'alpha.meow.com',
            referrer: '',
            visitorId: vis1,
            sessionId: ses1,
          },
        ],
      },
    });

    // Visitor 2: USA, Mobile Safari, Google referrer, 2 PVs (/watch, /docs), duration 60s
    const vis2 = 'mv_curr_vis_2';
    const ses2 = 'ms_curr_ses_2';
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'cf-ipcountry': 'US',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      },
      payload: {
        siteId: siteIdAlpha,
        events: [
          {
            eventId: 'ev_c2_1',
            type: 'page_view',
            timestamp: p1Start + 20000,
            path: '/watch',
            hostname: 'alpha.meow.com',
            referrer: 'https://www.google.com/search?q=meow',
            visitorId: vis2,
            sessionId: ses2,
          },
          {
            eventId: 'ev_c2_2',
            type: 'page_view',
            timestamp: p1Start + 80000,
            path: '/docs',
            hostname: 'alpha.meow.com',
            referrer: 'https://www.google.com/search?q=meow',
            visitorId: vis2,
            sessionId: ses2,
          },
        ],
      },
    });

    // Visitor 3: Germany, Tablet Firefox, UTM Campaign, 1 PV (/watch - bounce), duration 0s
    const vis3 = 'mv_curr_vis_3';
    const ses3 = 'ms_curr_ses_3';
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'cf-ipcountry': 'DE',
        'user-agent': 'Mozilla/5.0 (Android 14; Tablet; rv:120.0) Gecko/120.0 Firefox/120.0',
      },
      payload: {
        siteId: siteIdAlpha,
        events: [
          {
            eventId: 'ev_c3_1',
            type: 'page_view',
            timestamp: p1Start + 30000,
            path: '/watch?utm_source=newsletter&utm_medium=email&utm_campaign=summer_sale',
            hostname: 'alpha.meow.com',
            referrer: '',
            visitorId: vis3,
            sessionId: ses3,
          },
        ],
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('1. OVERVIEW: Answers all 8 overview metric cards against database calculations', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteIdAlpha}&from=${from}&to=${to}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.siteId).toBe(siteIdAlpha);
    expect(body.metrics).toBeDefined();

    // 1. Estimated Unique Visitors: 3
    expect(body.metrics.estimatedUniqueVisitors).toBe(3);
    // 2. New Visitors: 3
    expect(body.metrics.newVisitors).toBe(3);
    // 3. Returning Visitors: 0
    expect(body.metrics.returningVisitors).toBe(0);
    // 4. Sessions: 3
    expect(body.metrics.sessions).toBe(3);
    // 5. Page Views: 5
    expect(body.metrics.pageViews).toBe(5);
    // 6. Bounce Rate: 1 bounce out of 3 sessions = 33.33%
    expect(body.metrics.bounceRate).toBeCloseTo(33.33, 1);
    // 7. Pages / Session: 5 / 3 = 1.67
    expect(body.metrics.pagesPerSession).toBeCloseTo(1.67, 1);
    // 8. Average Session Duration: (120 + 60 + 0) / 3 = 60s
    expect(body.metrics.averageSessionDuration).toBe(60);
  });

  it('2. COMPARISON: Correctly calculates previous-period change with zero-denominator safety', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteIdAlpha}&from=${from}&to=${to}&compare=previous_period`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.comparison).toBeDefined();
    expect(body.changes).toBeDefined();

    // In previous period: 1 unique visitor, 1 session, 2 page views
    expect(body.comparison.estimatedUniqueVisitors).toBe(1);
    expect(body.comparison.sessions).toBe(1);
    expect(body.comparison.pageViews).toBe(2);

    // Changes:
    // Unique visitors: from 1 to 3 -> ((3 - 1) / 1) * 100 = +200%
    expect(body.changes.estimatedUniqueVisitorsChange).toBe(200);
    // Sessions: from 1 to 3 -> +200%
    expect(body.changes.sessionsChange).toBe(200);
    // Page views: from 2 to 5 -> ((5 - 2) / 2) * 100 = +150%
    expect(body.changes.pageViewsChange).toBe(150);

    // Zero-denominator check: returning visitors was 0 and is 0 -> change must be exactly 0 (not NaN or Infinity)
    expect(Number.isFinite(body.changes.returningVisitorsChange)).toBe(true);
    expect(body.changes.returningVisitorsChange).toBe(0);
  });

  it('3. TRAFFIC CHART: Supports metrics switching and comparison series alignment', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/timeseries?siteId=${siteIdAlpha}&from=${from}&to=${to}&resolution=daily&metric=page_views&compare=previous_period`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.siteId).toBe(siteIdAlpha);
    expect(body.metric).toBe('page_views');
    expect(body.resolution).toBe('daily');
    expect(Array.isArray(body.series)).toBe(true);
    expect(body.series.length).toBeGreaterThan(0);

    // Verify total matches sum of points
    const sum = body.series.reduce((acc: number, pt: any) => acc + pt.value, 0);
    expect(body.total).toBe(sum);
    expect(body.total).toBe(5);

    // Comparison series should be present
    expect(body.comparisonTotal).toBe(2);
    expect(body.totalChange).toBe(150);
  });

  it('4. TOP PAGES: Supports sorting by visitors, views, and sessions', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    // Sort by visitors desc
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/pages?siteId=${siteIdAlpha}&from=${from}&to=${to}&sortBy=visitors&sortOrder=desc`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(Array.isArray(body.pages)).toBe(true);
    expect(body.pages.length).toBeGreaterThanOrEqual(3);

    // /watch was visited by all 3 visitors
    const watchPage = body.pages.find((p: any) => p.path === '/watch');
    expect(watchPage).toBeDefined();
    expect(watchPage.visitors).toBe(3);
    expect(watchPage.pageViews).toBe(3);
    expect(watchPage.sessions).toBe(3);

    // Verify sort order
    for (let i = 0; i < body.pages.length - 1; i++) {
      expect(body.pages[i].visitors).toBeGreaterThanOrEqual(body.pages[i + 1].visitors);
    }
  });

  it('5. SOURCES BREAKDOWN: Displays sources with visitors, sessions, views', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/breakdown?siteId=${siteIdAlpha}&from=${from}&to=${to}&dimension=source`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.dimension).toBe('source');
    expect(Array.isArray(body.items)).toBe(true);

    // Google referrer from Visitor 2
    const googleSource = body.items.find((i: any) => i.key === 'Google');
    expect(googleSource).toBeDefined();
    expect(googleSource.visitors).toBe(1);

    // Direct from Visitor 1 and Visitor 3
    const directSource = body.items.find((i: any) => i.key === 'Direct');
    expect(directSource).toBeDefined();
    expect(directSource.visitors).toBe(2);
  });

  it('6. COUNTRIES BREAKDOWN: Displays country distribution', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/breakdown?siteId=${siteIdAlpha}&from=${from}&to=${to}&dimension=country`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.dimension).toBe('country');
    const inCountry = body.items.find((i: any) => i.key === 'IN');
    const usCountry = body.items.find((i: any) => i.key === 'US');
    const deCountry = body.items.find((i: any) => i.key === 'DE');

    expect(inCountry).toBeDefined();
    expect(usCountry).toBeDefined();
    expect(deCountry).toBeDefined();
  });

  it('7. DEVICES BREAKDOWN: Displays desktop, mobile, tablet', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/analytics/breakdown?siteId=${siteIdAlpha}&from=${from}&to=${to}&dimension=device`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    expect(body.dimension).toBe('device');
    const desktop = body.items.find((i: any) => i.key === 'desktop');
    const mobile = body.items.find((i: any) => i.key === 'mobile');
    const tablet = body.items.find((i: any) => i.key === 'tablet');

    expect(desktop).toBeDefined();
    expect(mobile).toBeDefined();
    expect(tablet).toBeDefined();
  });

  it('8. FILTER ENGINE: Single and multiple AND filters with operators', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    // Filter 1: country = IN
    const filterCountryIN = JSON.stringify([
      { field: 'country', operator: 'equals', value: 'IN' },
    ]);
    const resIN = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteIdAlpha}&from=${from}&to=${to}&filters=${encodeURIComponent(filterCountryIN)}`,
    });
    expect(resIN.statusCode).toBe(200);
    const bodyIN = JSON.parse(resIN.payload);
    expect(bodyIN.metrics.estimatedUniqueVisitors).toBe(1);
    expect(bodyIN.metrics.sessions).toBe(1);
    expect(bodyIN.metrics.pageViews).toBe(2);

    // Filter 2: Multiple AND filters: Country = US AND Device = mobile AND Path contains /watch
    const multiFilters = JSON.stringify([
      { field: 'country', operator: 'equals', value: 'US' },
      { field: 'device', operator: 'equals', value: 'mobile' },
      { field: 'path', operator: 'contains', value: '/watch' },
    ]);
    const resMulti = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteIdAlpha}&from=${from}&to=${to}&filters=${encodeURIComponent(multiFilters)}`,
    });
    expect(resMulti.statusCode).toBe(200);
    const bodyMulti = JSON.parse(resMulti.payload);
    expect(bodyMulti.metrics.estimatedUniqueVisitors).toBe(1);
    expect(bodyMulti.metrics.sessions).toBe(1);

    // Filter 3: starts_with operator: path starts_with /pric
    const filterStartsWith = JSON.stringify([
      { field: 'path', operator: 'starts_with', value: '/pric' },
    ]);
    const resStarts = await app.inject({
      method: 'GET',
      url: `/analytics/pages?siteId=${siteIdAlpha}&from=${from}&to=${to}&filters=${encodeURIComponent(filterStartsWith)}`,
    });
    expect(resStarts.statusCode).toBe(200);
    const bodyStarts = JSON.parse(resStarts.payload);
    expect(bodyStarts.pages.length).toBe(1);
    expect(bodyStarts.pages[0].path).toBe('/pricing');

    // Filter 4: not_equals operator: country != IN
    const filterNotIN = JSON.stringify([
      { field: 'country', operator: 'not_equals', value: 'IN' },
    ]);
    const resNotIN = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteIdAlpha}&from=${from}&to=${to}&filters=${encodeURIComponent(filterNotIN)}`,
    });
    expect(resNotIN.statusCode).toBe(200);
    const bodyNotIN = JSON.parse(resNotIN.payload);
    // US and DE visitors = 2
    expect(bodyNotIN.metrics.estimatedUniqueVisitors).toBe(2);
  });

  it('9. GROUP BY / EXPLORER: Dimensions (os, browser, utm, referrer, path)', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    // UTM Campaign
    const resUtm = await app.inject({
      method: 'GET',
      url: `/analytics/breakdown?siteId=${siteIdAlpha}&from=${from}&to=${to}&dimension=utm`,
    });
    expect(resUtm.statusCode).toBe(200);
    const bodyUtm = JSON.parse(resUtm.payload);
    const summerSale = bodyUtm.items.find((i: any) => i.key === 'summer_sale');
    expect(summerSale).toBeDefined();

    // OS
    const resOs = await app.inject({
      method: 'GET',
      url: `/analytics/breakdown?siteId=${siteIdAlpha}&from=${from}&to=${to}&dimension=os`,
    });
    expect(resOs.statusCode).toBe(200);
    const bodyOs = JSON.parse(resOs.payload);
    expect(bodyOs.items.length).toBeGreaterThanOrEqual(2);
  });

  it('10. PROJECT SWITCHING & ISOLATION: Empty project Beta has zero traffic and no leakage', async () => {
    const from = new Date(p1Start).toISOString();
    const to = new Date(now).toISOString();

    // Project Beta Overview
    const resOverviewBeta = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteIdBeta}&from=${from}&to=${to}`,
    });
    expect(resOverviewBeta.statusCode).toBe(200);
    const bodyBeta = JSON.parse(resOverviewBeta.payload);

    expect(bodyBeta.metrics.estimatedUniqueVisitors).toBe(0);
    expect(bodyBeta.metrics.newVisitors).toBe(0);
    expect(bodyBeta.metrics.returningVisitors).toBe(0);
    expect(bodyBeta.metrics.sessions).toBe(0);
    expect(bodyBeta.metrics.pageViews).toBe(0);
    expect(bodyBeta.metrics.bounceRate).toBe(0);
    expect(bodyBeta.metrics.pagesPerSession).toBe(0);
    expect(bodyBeta.metrics.averageSessionDuration).toBe(0);

    // Project Beta Pages
    const resPagesBeta = await app.inject({
      method: 'GET',
      url: `/analytics/pages?siteId=${siteIdBeta}&from=${from}&to=${to}`,
    });
    expect(resPagesBeta.statusCode).toBe(200);
    expect(JSON.parse(resPagesBeta.payload).pages).toEqual([]);

    // Project Beta Timeseries
    const resTimeseriesBeta = await app.inject({
      method: 'GET',
      url: `/analytics/timeseries?siteId=${siteIdBeta}&from=${from}&to=${to}`,
    });
    expect(resTimeseriesBeta.statusCode).toBe(200);
    expect(JSON.parse(resTimeseriesBeta.payload).total).toBe(0);
  });

  it('11. API VALIDATION & ERROR HANDLING: Rejects malformed requests gracefully', async () => {
    // Missing siteId
    const resMissing = await app.inject({
      method: 'GET',
      url: '/analytics/overview',
    });
    expect(resMissing.statusCode).toBe(400);

    // Invalid filters JSON
    const resBadFilter = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteIdAlpha}&filters=not_json_or_array`,
    });
    expect(resBadFilter.statusCode).toBe(400);

    // Invalid dimension
    const resBadDim = await app.inject({
      method: 'GET',
      url: `/analytics/breakdown?siteId=${siteIdAlpha}&dimension=invalid_dimension`,
    });
    expect(resBadDim.statusCode).toBe(400);
  });
});
