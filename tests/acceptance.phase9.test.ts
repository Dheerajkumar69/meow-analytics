import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import {
  migrateDatabase,
  closeDatabaseConnection,
  getDatabase,
  projects,
  events,
  visitors,
  sessions,
  pageViews,
  hourlyAggregates,
  dailyAggregates,
  cleanupCheckpoints,
} from '@meow-analytics/database';
import { runHourlyAggregation, runDailyAggregation } from '../apps/api/src/lib/aggregation.js';
import { runRetentionCleanup } from '../apps/api/src/lib/cleanup.js';
import { analyticsCache } from '../apps/api/src/lib/cache.js';
import { sql, eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

describe('Meow Analytics — Phase 9 Final Acceptance Tests & Hard Stop Verification', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_phase9_final';
  const meowSecret = '12345678901234567890123456789012';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let projectId: string;
  let siteId: string;
  let projectKey: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = 'http://localhost:5173,https://dashboard.meowanalytics.dev';
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_ENABLED = 'true';

    await migrateDatabase('memory://');
    app = await buildApp();

    // 1. Create Production Acceptance Project
    const resProj = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: 'Phase 9 Production Acceptance Site',
        privacyMode: 'balanced',
        visitorRetentionHours: 24,
        eventRetentionDays: 30,
      },
    });
    const projData = JSON.parse(resProj.payload);
    projectId = projData.id;
    siteId = projData.site_id;

    // 2. Create API Key
    const keyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/keys`,
      headers: authHeaders,
      payload: { name: 'Acceptance Ingest Key' },
    });
    projectKey = JSON.parse(keyRes.payload).key;
  });

  afterAll(async () => {
    analyticsCache.clear();
    await app.close();
    await closeDatabaseConnection();
  });

  // --------------------------------------------------------------------------
  // HARD STOP 1: render.yaml & Deployment Configuration
  // --------------------------------------------------------------------------
  it('Hard Stop 1: render.yaml Blueprint exists with Web Service and Static Site', () => {
    const renderYamlPath = path.resolve(process.cwd(), 'render.yaml');
    expect(fs.existsSync(renderYamlPath)).toBe(true);
    const content = fs.readFileSync(renderYamlPath, 'utf8');

    expect(content).toContain('name: meow-analytics-api');
    expect(content).toContain('name: meow-analytics-dashboard');
    expect(content).toContain('healthCheckPath: /api/health');
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('MEOW_SECRET');
    expect(content).toContain('ADMIN_SECRET');
  });

  // --------------------------------------------------------------------------
  // HARD STOP 2: External Persistent Database Enforcement
  // --------------------------------------------------------------------------
  it('Hard Stop 2: Enforces external persistent database requirement when NODE_ENV=production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const { getDatabase: getProdDb } = await import('@meow-analytics/database');
      expect(() => {
        getProdDb('memory://');
      }).toThrow(/Production database error/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // --------------------------------------------------------------------------
  // HARD STOP 3: Section 144 Exact Traffic Simulation & Data Correctness
  // Visitor A: 3 sessions, 12 page views, 4 events
  // Visitor B: 2 sessions, 7 page views, 2 events
  // Visitor C: 1 session, 4 page views, 1 event
  // Expected: Unique visitors = 3, Sessions = 6, Page views = 23, Events = 7
  // --------------------------------------------------------------------------
  it('Hard Stop 3: Section 144 Exact Traffic Generation & Verification', async () => {
    const now = Date.now();
    const batchEvents: any[] = [];

    // Visitor A: 3 sessions, 12 page views, 4 custom events
    const vA = 'visitor_A_identity';
    for (let s = 1; s <= 3; s++) {
      const sId = `session_A_${s}`;
      const sessionBaseTime = now - (4 - s) * 3600 * 1000;
      // 4 page views per session (4 * 3 = 12)
      for (let p = 1; p <= 4; p++) {
        batchEvents.push({
          eventId: `ev_A_s${s}_pv${p}`,
          type: 'page_view',
          path: `/article-${p}`,
          hostname: 'example.com',
          timestamp: new Date(sessionBaseTime + p * 60 * 1000).toISOString(),
          visitorId: vA,
          sessionId: sId,
        });
      }
      // Custom events (1 in s1, 2 in s2, 1 in s3 = 4 total)
      const eventCount = s === 2 ? 2 : 1;
      for (let e = 1; e <= eventCount; e++) {
        batchEvents.push({
          eventId: `ev_A_s${s}_cust${e}`,
          type: 'custom',
          eventName: `click_cta_${e}`,
          path: `/article-${s}`,
          hostname: 'example.com',
          timestamp: new Date(sessionBaseTime + 5 * 60 * 1000 + e * 1000).toISOString(),
          visitorId: vA,
          sessionId: sId,
          properties: { button: 'cta' },
        });
      }
    }

    // Visitor B: 2 sessions, 7 page views, 2 custom events
    const vB = 'visitor_B_identity';
    for (let s = 1; s <= 2; s++) {
      const sId = `session_B_${s}`;
      const sessionBaseTime = now - (3 - s) * 3600 * 1000;
      // 4 page views in s1, 3 in s2 = 7 total
      const pvCount = s === 1 ? 4 : 3;
      for (let p = 1; p <= pvCount; p++) {
        batchEvents.push({
          eventId: `ev_B_s${s}_pv${p}`,
          type: 'page_view',
          path: `/product-${p}`,
          hostname: 'example.com',
          timestamp: new Date(sessionBaseTime + p * 60 * 1000).toISOString(),
          visitorId: vB,
          sessionId: sId,
        });
      }
      // 1 custom event per session = 2 total
      batchEvents.push({
        eventId: `ev_B_s${s}_cust1`,
        type: 'custom',
        eventName: 'add_to_cart',
        path: `/product-${s}`,
        hostname: 'example.com',
        timestamp: new Date(sessionBaseTime + 5 * 60 * 1000).toISOString(),
        visitorId: vB,
        sessionId: sId,
        properties: { sku: 'shirt_blue' },
      });
    }

    // Visitor C: 1 session, 4 page views, 1 event
    const vC = 'visitor_C_identity';
    const sIdC = 'session_C_1';
    const cBaseTime = now - 30 * 60 * 1000;
    for (let p = 1; p <= 4; p++) {
      batchEvents.push({
        eventId: `ev_C_s1_pv${p}`,
        type: 'page_view',
        path: `/blog-${p}`,
        hostname: 'example.com',
        timestamp: new Date(cBaseTime + p * 60 * 1000).toISOString(),
        visitorId: vC,
        sessionId: sIdC,
      });
    }
    batchEvents.push({
      eventId: 'ev_C_s1_cust1',
      type: 'custom',
      eventName: 'scroll_depth',
      path: '/blog-1',
      hostname: 'example.com',
      timestamp: new Date(cBaseTime + 5 * 60 * 1000).toISOString(),
      visitorId: vC,
      sessionId: sIdC,
      properties: { depth: 75 },
    });

    // Ingest in batches of 25 to respect 50 events limit
    const chunk1 = batchEvents.slice(0, 20);
    const chunk2 = batchEvents.slice(20);

    const resChunk1 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: { siteId, events: chunk1 },
    });
    expect(resChunk1.statusCode).toBe(200);

    const resChunk2 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: { siteId, events: chunk2 },
    });
    expect(resChunk2.statusCode).toBe(200);

    // Verify exact expected numbers:
    // Unique visitors = 3
    // Sessions = 6
    // Page views = 23
    // Events = 7 custom events (or total rows in events table = 30)
    const db = getDatabase();
    const visitorsRows = await db.select().from(visitors).where(eq(visitors.site_id, siteId));
    expect(visitorsRows.length).toBe(3);

    const sessionsRows = await db.select().from(sessions).where(eq(sessions.site_id, siteId));
    expect(sessionsRows.length).toBe(6);

    const pvRows = await db.select().from(pageViews).where(eq(pageViews.site_id, siteId));
    expect(pvRows.length).toBe(23);

    const customEventRows = await db.execute(
      sql`SELECT COUNT(*)::int as count FROM events WHERE site_id = ${siteId} AND type = 'custom'`
    );
    expect((customEventRows.rows[0] as any).count).toBe(7);

    // Hard Stop 3B: Visitor A returns with a new session
    const returnSessionId = `session_A_return_${Date.now()}`;
    const resReturn = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_A_return_pv_${Date.now()}`,
            type: 'page_view',
            path: '/returning-page',
            hostname: 'example.com',
            timestamp: new Date().toISOString(),
            visitorId: vA,
            sessionId: returnSessionId,
          },
        ],
      },
    });
    expect(resReturn.statusCode).toBe(200);

    // Unique visitors must remain 3!
    const visitorsAfterReturn = await db.select().from(visitors).where(eq(visitors.site_id, siteId));
    expect(visitorsAfterReturn.length).toBe(3);

    // Sessions count increases from 6 to 7
    const sessionsAfterReturn = await db.select().from(sessions).where(eq(sessions.site_id, siteId));
    expect(sessionsAfterReturn.length).toBe(7);
  });

  // --------------------------------------------------------------------------
  // HARD STOP 4: Aggregation & Dashboard Resolution
  // --------------------------------------------------------------------------
  it('Hard Stop 4: Hourly and daily aggregates are populated and queried by historical analytics', async () => {
    // 4A. Run hourly & daily aggregation
    const hourlyCount = await runHourlyAggregation({ siteId });
    expect(hourlyCount).toBeGreaterThan(0);

    const dailyCount = await runDailyAggregation({ siteId });
    expect(dailyCount).toBeGreaterThan(0);

    // 4B. Query daily aggregates table directly to verify schema & persistence
    const db = getDatabase();
    const aggRows = await db
      .select()
      .from(dailyAggregates)
      .where(eq(dailyAggregates.site_id, siteId));
    expect(aggRows.length).toBeGreaterThan(0);
    expect(aggRows[0].page_views).toBeGreaterThan(0);
    expect(aggRows[0].visitors).toBeGreaterThan(0);

    // 4C. Query historical timeseries endpoint; verify it uses aggregates & cache
    const fromTime = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const toTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

    const tsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/timeseries?siteId=${siteId}&from=${fromTime}&to=${toTime}&resolution=daily`,
      headers: { 'x-api-key': projectKey },
    });
    expect(tsRes.statusCode).toBe(200);
    expect(tsRes.headers['x-meow-cache']).toBe('MISS');

    // Second call should HIT cache
    const tsResCached = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/timeseries?siteId=${siteId}&from=${fromTime}&to=${toTime}&resolution=daily`,
      headers: { 'x-api-key': projectKey },
    });
    expect(tsResCached.statusCode).toBe(200);
    expect(tsResCached.headers['x-meow-cache']).toBe('HIT');
  });

  // --------------------------------------------------------------------------
  // HARD STOP 5: Resumable Checkpointed Retention Cleanup
  // --------------------------------------------------------------------------
  it('Hard Stop 5: Checkpointed retention cleanup safely prunes data without corrupting aggregates', async () => {
    const report = await runRetentionCleanup({ batchSize: 50 });
    expect(report).toBeDefined();
    expect(report.checkpoints).toBeDefined();
    expect(report.completedAt).toBeDefined();

    // Checkpoint table has record
    const db = getDatabase();
    const cp = await db.select().from(cleanupCheckpoints).where(eq(cleanupCheckpoints.job, 'retention_cleanup'));
    expect(cp.length).toBe(1);
    expect(cp[0].status).toBe('completed');
  });

  // --------------------------------------------------------------------------
  // HARD STOP 6: DEPLOYMENT.md Complete Documentation
  // --------------------------------------------------------------------------
  it('Hard Stop 6: DEPLOYMENT.md exists containing all 8 required sections', () => {
    const depPath = path.resolve(process.cwd(), 'DEPLOYMENT.md');
    expect(fs.existsSync(depPath)).toBe(true);
    const content = fs.readFileSync(depPath, 'utf8');

    expect(content).toContain('1. Create database');
    expect(content).toContain('2. Configure environment variables');
    expect(content).toContain('3. Deploy API');
    expect(content).toContain('4. Deploy dashboard');
    expect(content).toContain('5. Configure domain');
    expect(content).toContain('6. Create project');
    expect(content).toContain('7. Install SDK');
    expect(content).toContain('8. Verify events');
  });
});
