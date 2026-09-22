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
  hourlyAggregates,
  dailyAggregates,
  cleanupCheckpoints,
} from '@meow-analytics/database';
import { runRetentionCleanup } from '../apps/api/src/lib/cleanup.js';
import { runHourlyAggregation, runDailyAggregation } from '../apps/api/src/lib/aggregation.js';
import { eq, and, sql } from 'drizzle-orm';

describe('Meow Analytics — Phase 8 Acceptance Tests: Hardening, Privacy, Retention & Governance', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_phase8_12345';
  const meowSecret = '12345678901234567890123456789012';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let projectStrictId: string;
  let projectStrictSiteId: string;
  let projectAId: string;
  let projectASiteId: string;
  let projectBId: string;
  let projectBSiteId: string;
  let projectAKey: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = 'http://localhost:5173,https://dashboard.meowanalytics.dev';
    process.env.RATE_LIMIT_ENABLED = 'true';

    await migrateDatabase('memory://');
    app = await buildApp();

    // 1. Create Strict Privacy Project
    const resStrict = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: 'Strict Privacy Site',
        privacyMode: 'strict',
        visitorRetentionHours: 24,
        eventRetentionDays: 30,
      },
    });
    const strictData = JSON.parse(resStrict.payload);
    projectStrictId = strictData.id;
    projectStrictSiteId = strictData.site_id;

    // 2. Create Project A
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: 'Project Alpha',
        privacyMode: 'balanced',
        visitorRetentionHours: 24,
        eventRetentionDays: 90,
      },
    });
    const aData = JSON.parse(resA.payload);
    projectAId = aData.id;
    projectASiteId = aData.site_id;

    // 3. Create Project B
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: {
        name: 'Project Beta',
        privacyMode: 'detailed',
      },
    });
    const bData = JSON.parse(resB.payload);
    projectBId = bData.id;
    projectBSiteId = bData.site_id;

    // 4. Create API Key for Project A
    const keyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectAId}/keys`,
      headers: authHeaders,
      payload: { name: 'Alpha Ingest & Export Key' },
    });
    projectAKey = JSON.parse(keyRes.payload).key;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  // =========================================================================
  // 1. PRIVACY MODES
  // =========================================================================
  describe('1. Privacy Modes (Strict, Balanced, Detailed)', () => {
    it('Strict mode minimizes metadata: drops region, masks screen size, strips referrer query params, and rotates visitor hash', async () => {
      const now = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId: projectStrictSiteId,
          events: [
            {
              eventId: 'ev_strict_1',
              type: 'page_view',
              timestamp: now,
              path: '/strict-page',
              hostname: 'strict.example.com',
              referrer: 'https://google.com/search?q=secret_query&token=12345#heading',
              visitorId: 'mv_cookie_stored_client_id_123',
              screenWidth: 2560,
              screenHeight: 1440,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      const db = getDatabase('memory://');
      const evRows = await db
        .select()
        .from(events)
        .where(eq(events.event_id, 'ev_strict_1'));

      expect(evRows).toHaveLength(1);
      const ev = evRows[0]!;

      // Region must be stripped in Strict mode
      expect(ev.region).toBeNull();

      // Screen resolution must be generalized / Unknown in Strict mode
      expect(ev.screen_resolution).toBe('Unknown');

      // Referrer URL query strings and fragments must be stripped
      expect(ev.referrer_url).not.toContain('secret_query');
      expect(ev.referrer_url).not.toContain('token=12345');

      // Visitor record in database must NOT use the raw client cookie identifier
      const visRows = await db
        .select()
        .from(visitors)
        .where(eq(visitors.site_id, projectStrictSiteId));
      expect(visRows.length).toBeGreaterThan(0);
      expect(visRows[0]!.anonymous_id).not.toBe('mv_cookie_stored_client_id_123');
      expect(visRows[0]!.anonymous_id).toMatch(/^mv_s_/); // 24h rotating privacy HMAC hash
    });
  });

  // =========================================================================
  // 2. VISITOR RETENTION & 3. EVENT RETENTION & 4. AGGREGATION & 5/6. CLEANUP & CHECKPOINTS
  // =========================================================================
  describe('2-6. Retention, Aggregation, Checkpoints & Resumable Cleanup', () => {
    it('proves visitor identity expires after retention period and is safely purged by cleanup', async () => {
      const db = getDatabase('memory://');
      const oldTime = new Date(Date.now() - 48 * 3600 * 1000); // 48 hours ago (exceeds 24h retention)

      // Manually insert an expired visitor record
      await db.execute(sql`
        INSERT INTO visitors (
          id, site_id, anonymous_id, first_seen_at, last_seen_at, first_path, last_path, created_at
        ) VALUES (
          'vis_expired_999', ${projectASiteId}, 'mv_expired_visitor_test',
          ${oldTime}, ${oldTime}, '/old', '/old', ${oldTime}
        )
      `);

      // Run cleanup
      const report = await runRetentionCleanup();
      expect(report.visitorsCleaned).toBeGreaterThanOrEqual(1);

      // Verify visitor was deleted
      const check = await db
        .select()
        .from(visitors)
        .where(eq(visitors.id, 'vis_expired_999'));
      expect(check).toHaveLength(0);
    });

    it('proves raw events older than retention are aggregated into hourly & daily rollups before deletion', async () => {
      const db = getDatabase('memory://');
      const now = Date.now();
      const pastTime = new Date(now - 2 * 3600 * 1000); // 2 hours ago

      // Insert raw events for aggregation
      await db.execute(sql`
        INSERT INTO events (
          event_id, site_id, type, event_name, path, hostname, timestamp, created_at
        ) VALUES
          ('ev_agg_1', ${projectASiteId}, 'page_view', 'page_view', '/page-1', 'example.com', ${pastTime}, NOW()),
          ('ev_agg_2', ${projectASiteId}, 'page_view', 'page_view', '/page-2', 'example.com', ${pastTime}, NOW()),
          ('ev_agg_3', ${projectASiteId}, 'custom', 'checkout', '/cart', 'example.com', ${pastTime}, NOW())
        ON CONFLICT DO NOTHING
      `);

      // Run hourly and daily aggregation
      const hourlyCount = await runHourlyAggregation({ siteId: projectASiteId });
      expect(hourlyCount).toBeGreaterThanOrEqual(1);

      const dailyCount = await runDailyAggregation({ siteId: projectASiteId });
      expect(dailyCount).toBeGreaterThanOrEqual(1);

      // Verify records exist in hourly_aggregates and daily_aggregates
      const hourlyRows = await db
        .select()
        .from(hourlyAggregates)
        .where(eq(hourlyAggregates.site_id, projectASiteId));
      expect(hourlyRows.length).toBeGreaterThan(0);
      expect(hourlyRows[0]!.page_views).toBeGreaterThanOrEqual(2);

      const dailyRows = await db
        .select()
        .from(dailyAggregates)
        .where(eq(dailyAggregates.site_id, projectASiteId));
      expect(dailyRows.length).toBeGreaterThan(0);
    });

    it('proves cleanup maintains checkpoints that survive and update status', async () => {
      const db = getDatabase('memory://');
      const checkRows = await db
        .select()
        .from(cleanupCheckpoints)
        .where(eq(cleanupCheckpoints.job, 'retention_cleanup'));

      expect(checkRows).toHaveLength(1);
      const cp = checkRows[0]!;
      expect(cp.status).toBe('completed');
      expect(cp.updated_at).toBeDefined();
    });
  });

  // =========================================================================
  // 7. DATA DELETION
  // =========================================================================
  describe('7. Data Deletion (Date Range, Visitor Data, Project Hard Delete)', () => {
    it('deletes data in a specific date range without touching outside records', async () => {
      const db = getDatabase('memory://');
      const t1 = new Date('2026-01-01T10:00:00Z');
      const t2 = new Date('2026-01-02T10:00:00Z');
      const t3 = new Date('2026-01-03T10:00:00Z');

      await db.execute(sql`
        INSERT INTO events (event_id, site_id, type, path, hostname, timestamp, created_at)
        VALUES
          ('ev_range_1', ${projectASiteId}, 'page_view', '/p1', 'example.com', ${t1}, NOW()),
          ('ev_range_2', ${projectASiteId}, 'page_view', '/p2', 'example.com', ${t2}, NOW()),
          ('ev_range_3', ${projectASiteId}, 'page_view', '/p3', 'example.com', ${t3}, NOW())
        ON CONFLICT DO NOTHING
      `);

      // Delete range covering t2 only
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${projectAId}/data`,
        headers: authHeaders,
        payload: {
          from: '2026-01-02T00:00:00.000Z',
          to: '2026-01-02T23:59:59.999Z',
        },
      });

      expect(delRes.statusCode).toBe(200);

      // Verify ev_range_2 was deleted while ev_range_1 and ev_range_3 remain
      const remaining = await db
        .select({ id: events.event_id })
        .from(events)
        .where(eq(events.site_id, projectASiteId));
      const remIds = remaining.map((r) => r.id);
      expect(remIds).toContain('ev_range_1');
      expect(remIds).not.toContain('ev_range_2');
      expect(remIds).toContain('ev_range_3');
    });

    it('proves project hard delete cascades and permanently removes all related records', async () => {
      const db = getDatabase('memory://');
      // Create temporary project
      const tempRes = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: authHeaders,
        payload: { name: 'Temporary Delete Target' },
      });
      const tempProj = JSON.parse(tempRes.payload);

      // Ingest event for temp project
      await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId: tempProj.site_id,
          events: [
            {
              eventId: 'ev_temp_cascade',
              type: 'page_view',
              timestamp: Date.now(),
              path: '/temp',
              hostname: 'temp.com',
            },
          ],
        },
      });

      // Execute DELETE
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${tempProj.id}`,
        headers: authHeaders,
      });
      expect(delRes.statusCode).toBe(200);

      // Verify project row is physically removed
      const projCheck = await db
        .select()
        .from(projects)
        .where(eq(projects.id, tempProj.id));
      expect(projCheck).toHaveLength(0);

      // Verify cascaded events are physically removed
      const evCheck = await db
        .select()
        .from(events)
        .where(eq(events.site_id, tempProj.site_id));
      expect(evCheck).toHaveLength(0);
    });
  });

  // =========================================================================
  // 8. DATA EXPORT & 16. RAW IP AUDIT
  // =========================================================================
  describe('8. Data Export & Zero Raw IP Exposure', () => {
    it('exports data in JSON format without raw IP addresses', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectAId}/export?format=json`,
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      const body = JSON.parse(res.payload);
      expect(body.siteId).toBe(projectASiteId);
      expect(body.events).toBeDefined();

      // Ensure NO raw IP addresses exist in any property
      const rawString = JSON.stringify(body);
      expect(rawString).not.toMatch(/"rawIp":/);
      expect(rawString).not.toMatch(/"ip":/);
    });

    it('exports data in safe CSV format with formula injection sanitization', async () => {
      const db = getDatabase('memory://');
      // Ingest an event with potential spreadsheet formula injection
      await db.execute(sql`
        INSERT INTO events (
          event_id, site_id, type, event_name, path, hostname, timestamp, created_at
        ) VALUES (
          'ev_formula_inject', ${projectASiteId}, 'custom', '=cmd|"/C calc"!A0', '/calc', 'example.com', NOW(), NOW()
        ) ON CONFLICT DO NOTHING
      `);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectAId}/export?format=csv&type=events`,
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');

      const csvContent = res.payload;
      // Formula starting with '=' must be escaped with single quote
      expect(csvContent).toContain("'=cmd|");
      // Raw IP column must NOT be present in CSV headers
      expect(csvContent.split('\n')[0]).not.toContain(',ip,');
      expect(csvContent.split('\n')[0]).not.toContain('rawIp');
    });
  });

  // =========================================================================
  // 9. SECURITY HEADERS & 13. CORS
  // =========================================================================
  describe('9. Security Headers & 13. CORS Hardening', () => {
    it('sets strict security headers: CSP, frame-ancestors none, nosniff, HSTS', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: authHeaders,
      });

      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('allows whitelisted CORS origins and rejects unauthorized origins on dashboard APIs', async () => {
      // 1. Authorized origin
      const authOriginRes = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: {
          ...authHeaders,
          origin: 'http://localhost:5173',
        },
      });
      expect(authOriginRes.headers['access-control-allow-origin']).toBe('http://localhost:5173');

      // 2. Unauthorized external origin
      const unauthOriginRes = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: {
          ...authHeaders,
          origin: 'https://attacker-site.com',
        },
      });
      // Permissive CORS header must NOT be returned for unauthorized origin
      expect(unauthOriginRes.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  // =========================================================================
  // 10. RATE LIMITING
  // =========================================================================
  describe('10. Rate Limiting (Burst & Excessive Request Protection)', () => {
    it('returns 429 Too Many Requests when burst limit is exceeded', async () => {
      const requests = [];
      const testIp = '198.51.100.42';

      // Send 35 requests in immediate burst (limit is 30/sec)
      for (let i = 0; i < 35; i++) {
        requests.push(
          app.inject({
            method: 'POST',
            url: '/api/v1/collect',
            headers: {
              'x-forwarded-for': testIp,
            },
            payload: {
              siteId: projectASiteId,
              events: [
                {
                  eventId: `ev_burst_${i}`,
                  type: 'ping',
                  timestamp: Date.now(),
                  path: '/',
                  hostname: 'example.com',
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

  // =========================================================================
  // 11. API AUTHORIZATION & 12. API KEY SECURITY
  // =========================================================================
  describe('11-12. API Authorization & Key Security', () => {
    it('accepts valid project API key for authorized project export', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectAId}/export?format=json`,
        headers: {
          authorization: `Bearer ${projectAKey}`,
        },
      });
      expect(res.statusCode).toBe(200);
    });

    it('rejects API key when attempting to access an unauthorized project (cross-project access)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectBId}/export?format=json`,
        headers: {
          authorization: `Bearer ${projectAKey}`, // Key belongs to Project A, attempting to read Project B
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('rejects revoked API key with 401 Unauthorized', async () => {
      // 1. Create a key to revoke
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${projectAId}/keys`,
        headers: authHeaders,
        payload: { name: 'Key to Revoke' },
      });
      const keyData = JSON.parse(createRes.payload);
      const testKey = keyData.key;
      const keyId = keyData.id;

      // 2. Revoke the key
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${projectAId}/keys/${keyId}`,
        headers: authHeaders,
      });

      // 3. Attempt to use revoked key
      const useRes = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectAId}/export?format=json`,
        headers: {
          authorization: `Bearer ${testKey}`,
        },
      });

      expect(useRes.statusCode).toBe(401);
      const body = JSON.parse(useRes.payload);
      expect(body.error.message).toContain('revoked');
    });

    it('rejects unauthenticated management and export requests with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectAId}/export?format=json`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 14. INPUT SECURITY (XSS, SQLi, Prototype Pollution, Oversized Payloads)
  // =========================================================================
  describe('14. Input Security Defenses', () => {
    it('defends against Prototype Pollution by dropping __proto__ and constructor', async () => {
      const now = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId: projectASiteId,
          events: [
            {
              eventId: 'ev_proto_pollute',
              type: 'custom',
              eventName: 'proto_test',
              properties: {
                safeKey: 'hello',
                __proto__: { polluted: 'true' },
                constructor: { malicious: 'true' },
                prototype: { attack: 'true' },
              },
              timestamp: now,
              path: '/proto',
              hostname: 'example.com',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify prototype pollution keys were dropped
      const db = getDatabase('memory://');
      const row = await db
        .select()
        .from(events)
        .where(eq(events.event_id, 'ev_proto_pollute'));
      expect(row).toHaveLength(1);
      const props = row[0]!.properties as any;
      expect(props.safeKey).toBe('hello');
      expect(Object.hasOwn(props, '__proto__')).toBe(false);
      expect(Object.hasOwn(props, 'constructor')).toBe(false);
      expect(Object.hasOwn(props, 'prototype')).toBe(false);
      expect(props.polluted).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();
    });

    it('safely handles SQL injection attempts in search/filter parameters', async () => {
      const sqlAttack = "'; DROP TABLE projects; --";
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects?search=${encodeURIComponent(sqlAttack)}`,
        headers: authHeaders,
      });

      // Server should handle gracefully without crashing or executing the injected DDL
      expect(res.statusCode).toBe(200);

      // Confirm projects table is completely intact
      const db = getDatabase('memory://');
      const check = await db.select().from(projects);
      expect(check.length).toBeGreaterThan(0);
    });

    it('rejects oversized payloads exceeding the 64 KB network limit', async () => {
      const hugeString = 'a'.repeat(70 * 1024); // 70 KB payload
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId: projectASiteId,
          events: [
            {
              eventId: 'ev_oversized',
              type: 'page_view',
              timestamp: Date.now(),
              path: `/${hugeString}`,
              hostname: 'example.com',
            },
          ],
        },
      });

      // Fastify bodyLimit rejects payload
      expect(res.statusCode).toBe(413);
    });
  });

  // =========================================================================
  // 15. PRIVACY AUDIT (SENSITIVE DATA LOGGING DEFENSE)
  // =========================================================================
  describe('15. Privacy & Sensitive Data Safety', () => {
    it('ensures centralized error handler strips credentials and secrets from responses', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/non-existent-id-999',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      // Must not leak connection strings or internal file paths
      expect(res.payload).not.toContain('memory://');
      expect(res.payload).not.toContain('postgres://');
    });
  });
});
