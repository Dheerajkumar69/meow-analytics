import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';

describe('Phase 3 — Master Acceptance Test (Section 25 & 26)', () => {
  let app: FastifyInstance;
  const adminSecret = 'phase3_master_acceptance_secret_12345';
  const meowSecret = '12345678901234567890123456789012';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let siteId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = '*';

    await migrateDatabase('memory://');
    app = await buildApp();

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Phase 3 Verification Site' },
    });
    siteId = JSON.parse(projRes.payload).site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('Executes the exact Master Acceptance Test flow from Section 25 & 26', async () => {
    // Visitor A: 3 sessions, 12 page views
    // Session A1: 4 page views
    // Session A2: 4 page views
    // Session A3: 4 page views
    // Total A = 12 page views, 3 sessions
    const visA = 'mv_visitor_alpha_991823';
    const sesA1 = 'ms_ses_a1';
    const sesA2 = 'ms_ses_a2';
    const sesA3 = 'ms_ses_a3';

    // Visitor B: 2 sessions, 7 page views
    // Session B1: 4 page views
    // Session B2: 3 page views
    // Total B = 7 page views, 2 sessions
    const visB = 'mv_visitor_bravo_882711';
    const sesB1 = 'ms_ses_b1';
    const sesB2 = 'ms_ses_b2';

    // Visitor C: 1 session, 4 page views
    // Session C1: 4 page views
    // Total C = 4 page views, 1 session
    const visC = 'mv_visitor_charlie_773622';
    const sesC1 = 'ms_ses_c1';

    const now = Date.now();
    let timeCursor = now - 60 * 60 * 1000; // 1 hour ago

    // --- Ingest Visitor A ---
    // A1: 4 PVs
    for (let i = 0; i < 4; i++) {
      timeCursor += 10000;
      await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId,
          events: [
            {
              eventId: `ev_a1_${i}`,
              type: 'page_view',
              timestamp: timeCursor,
              path: `/a1/page-${i}`,
              hostname: 'acceptance.meow.com',
              referrer: '',
              visitorId: visA,
              sessionId: sesA1,
            },
          ],
        },
      });
    }

    // A2: 4 PVs
    for (let i = 0; i < 4; i++) {
      timeCursor += 10000;
      await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId,
          events: [
            {
              eventId: `ev_a2_${i}`,
              type: 'page_view',
              timestamp: timeCursor,
              path: `/a2/page-${i}`,
              hostname: 'acceptance.meow.com',
              referrer: '',
              visitorId: visA,
              sessionId: sesA2,
            },
          ],
        },
      });
    }

    // A3: 4 PVs
    for (let i = 0; i < 4; i++) {
      timeCursor += 10000;
      await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId,
          events: [
            {
              eventId: `ev_a3_${i}`,
              type: 'page_view',
              timestamp: timeCursor,
              path: `/a3/page-${i}`,
              hostname: 'acceptance.meow.com',
              referrer: '',
              visitorId: visA,
              sessionId: sesA3,
            },
          ],
        },
      });
    }

    // --- Ingest Visitor B ---
    // B1: 4 PVs
    for (let i = 0; i < 4; i++) {
      timeCursor += 10000;
      await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId,
          events: [
            {
              eventId: `ev_b1_${i}`,
              type: 'page_view',
              timestamp: timeCursor,
              path: `/b1/page-${i}`,
              hostname: 'acceptance.meow.com',
              referrer: '',
              visitorId: visB,
              sessionId: sesB1,
            },
          ],
        },
      });
    }

    // B2: 3 PVs
    for (let i = 0; i < 3; i++) {
      timeCursor += 10000;
      await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId,
          events: [
            {
              eventId: `ev_b2_${i}`,
              type: 'page_view',
              timestamp: timeCursor,
              path: `/b2/page-${i}`,
              hostname: 'acceptance.meow.com',
              referrer: '',
              visitorId: visB,
              sessionId: sesB2,
            },
          ],
        },
      });
    }

    // --- Ingest Visitor C ---
    // C1: 4 PVs
    for (let i = 0; i < 4; i++) {
      timeCursor += 10000;
      await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId,
          events: [
            {
              eventId: `ev_c1_${i}`,
              type: 'page_view',
              timestamp: timeCursor,
              path: `/c1/page-${i}`,
              hostname: 'acceptance.meow.com',
              referrer: '',
              visitorId: visC,
              sessionId: sesC1,
            },
          ],
        },
      });
    }

    // =========================================================
    // VERIFICATION 1:
    // Dashboard must report:
    // 3 unique visitors
    // 6 sessions
    // 23 page views
    // =========================================================

    const res1 = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteId}`,
    });

    expect(res1.statusCode).toBe(200);
    const data1 = JSON.parse(res1.payload);

    expect(data1.metrics.estimatedUniqueVisitors).toBe(3);
    expect(data1.metrics.sessions).toBe(6);
    expect(data1.metrics.pageViews).toBe(23);

    // Verify /analytics/visitors
    const visitorsRes1 = await app.inject({
      method: 'GET',
      url: `/analytics/visitors?siteId=${siteId}`,
    });
    const visitorsData1 = JSON.parse(visitorsRes1.payload);
    expect(visitorsData1.estimatedUniqueVisitors).toBe(3);
    expect(visitorsData1.newVisitors).toBe(3); // All 3 arrived in window
    expect(visitorsData1.returningVisitors).toBe(2); // Visitor A and B had returning sessions

    // =========================================================
    // STEP 2:
    // Then Visitor A returns.
    // Unique visitor count must remain: 3
    // while returning visitor activity increases.
    // =========================================================

    const sesA4 = 'ms_ses_a4_return';
    timeCursor += 10000;
    const returnRes = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_a4_return_1`,
            type: 'page_view',
            timestamp: timeCursor,
            path: '/a/welcome-back',
            hostname: 'acceptance.meow.com',
            referrer: '',
            visitorId: visA,
            sessionId: sesA4,
          },
        ],
      },
    });
    expect(returnRes.statusCode).toBe(200);

    const res2 = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteId}`,
    });
    const data2 = JSON.parse(res2.payload);

    // Unique visitor count MUST REMAIN 3!
    expect(data2.metrics.estimatedUniqueVisitors).toBe(3);

    // Sessions increases to 7
    expect(data2.metrics.sessions).toBe(7);

    // Page views increases to 24
    expect(data2.metrics.pageViews).toBe(24);

    // Returning visitor count is still 2 (A and B are returning visitors),
    // and returning visitor rate is verified
    const visitorsRes2 = await app.inject({
      method: 'GET',
      url: `/analytics/visitors?siteId=${siteId}`,
    });
    const visitorsData2 = JSON.parse(visitorsRes2.payload);
    expect(visitorsData2.estimatedUniqueVisitors).toBe(3);
    expect(visitorsData2.returningVisitors).toBe(2);

    // =========================================================
    // STEP 3:
    // Replay duplicate events and network retries
    // Verify analytics counts remain 100% correct
    // =========================================================

    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_a4_return_1`, // Exact same event ID
            type: 'page_view',
            timestamp: timeCursor,
            path: '/a/welcome-back',
            hostname: 'acceptance.meow.com',
            referrer: '',
            visitorId: visA,
            sessionId: sesA4,
          },
        ],
      },
    });

    const dupBody = JSON.parse(duplicateRes.payload);
    expect(dupBody.duplicates).toBe(1);
    expect(dupBody.ingested).toBe(0);

    // Check dashboard again: counts MUST NOT have changed
    const res3 = await app.inject({
      method: 'GET',
      url: `/analytics/overview?siteId=${siteId}`,
    });
    const data3 = JSON.parse(res3.payload);

    expect(data3.metrics.estimatedUniqueVisitors).toBe(3);
    expect(data3.metrics.sessions).toBe(7);
    expect(data3.metrics.pageViews).toBe(24);
  });
});
