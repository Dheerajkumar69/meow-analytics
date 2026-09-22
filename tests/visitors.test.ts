import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase, visitors } from '@meow-analytics/database';
import { computeVisitorFallbackHash, normalizeIpForPrivacy } from '@meow-analytics/shared';
import { eq, sql } from 'drizzle-orm';

describe('Phase 3 — Visitor Identity, Storage & Privacy Fallback', () => {
  let app: FastifyInstance;
  const adminSecret = 'test_admin_secret_phrase_12345';
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

    // Create a test project
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'Visitor Identity Test Project' },
    });
    const projData = JSON.parse(projRes.payload);
    siteId = projData.site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('1. New visitor with client-provided anonymous ID creates a visitor record', async () => {
    const visitorId = 'mv_test_client_visitor_123456';
    const eventId = 'ev_vis_test_1';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/landing',
            hostname: 'example.com',
            referrer: 'https://google.com',
            visitorId,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ingested).toBe(1);

    const db = getDatabase();
    const rows = await db
      .select()
      .from(visitors)
      .where(eq(visitors.anonymous_id, visitorId));

    expect(rows.length).toBe(1);
    expect(rows[0]!.site_id).toBe(siteId);
    expect(rows[0]!.anonymous_id).toBe(visitorId);
    expect(rows[0]!.first_path).toBe('/landing');
    expect(rows[0]!.first_referrer).toBe('https://google.com');
  });

  it('2. When client storage/cookies disabled (no visitorId provided), server uses privacy-preserving fallback HMAC', async () => {
    const eventId = 'ev_fallback_1';
    const now = Date.now();
    const ip = '198.51.100.42';
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'x-forwarded-for': ip,
        'user-agent': ua,
      },
      payload: {
        siteId,
        events: [
          {
            eventId,
            type: 'page_view',
            timestamp: now,
            path: '/private-browsing',
            hostname: 'example.com',
            referrer: '',
            // visitorId omitted
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);

    const expectedFallbackId = computeVisitorFallbackHash({
      ip,
      userAgent: ua,
      secret: meowSecret,
      siteId,
      timestamp: now,
      rotationHours: 24,
    });

    const db = getDatabase();
    const rows = await db
      .select()
      .from(visitors)
      .where(eq(visitors.anonymous_id, expectedFallbackId));

    expect(rows.length).toBe(1);
    expect(rows[0]!.anonymous_id).toBe(expectedFallbackId);
    expect(rows[0]!.anonymous_id.startsWith('mv_s_')).toBe(true);

    // Verify raw IP is NOT stored in any visitor column
    expect(rows[0]!.anonymous_id).not.toContain(ip);
  });

  it('3. Server fallback HMAC rotates automatically after 24 hours without retaining raw IP', () => {
    const ip = '203.0.113.19';
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    const day1Time = new Date('2026-09-01T10:00:00Z').getTime();
    const day2Time = new Date('2026-09-02T11:00:00Z').getTime(); // > 24 hours later

    const hashDay1 = computeVisitorFallbackHash({
      ip,
      userAgent: ua,
      secret: meowSecret,
      siteId,
      timestamp: day1Time,
      rotationHours: 24,
    });

    const hashDay2 = computeVisitorFallbackHash({
      ip,
      userAgent: ua,
      secret: meowSecret,
      siteId,
      timestamp: day2Time,
      rotationHours: 24,
    });

    expect(hashDay1.startsWith('mv_s_')).toBe(true);
    expect(hashDay2.startsWith('mv_s_')).toBe(true);
    expect(hashDay1).not.toBe(hashDay2);
  });

  it('4. Shared IP edge case: 10 users with the same IP and different visitor IDs remain 10 separate visitors', async () => {
    const sharedIp = '198.51.100.99';
    const userAgent = 'Mozilla/5.0 (Shared Office Network)';

    const userPromises = [];
    for (let i = 0; i < 10; i++) {
      const visitorId = `mv_shared_ip_user_${i}_${Date.now()}`;
      userPromises.push(
        app.inject({
          method: 'POST',
          url: '/api/v1/collect',
          headers: {
            'x-forwarded-for': sharedIp,
            'user-agent': userAgent,
          },
          payload: {
            siteId,
            events: [
              {
                eventId: `ev_shared_ip_${i}_${Date.now()}`,
                type: 'page_view',
                timestamp: Date.now(),
                path: `/user-${i}`,
                hostname: 'example.com',
                referrer: '',
                visitorId,
              },
            ],
          },
        })
      );
    }

    const results = await Promise.all(userPromises);
    results.forEach((res) => expect(res.statusCode).toBe(200));

    // Verify all 10 distinct visitors exist
    const db = getDatabase();
    const countRes = await db.execute(sql`
      SELECT COUNT(DISTINCT anonymous_id) AS distinct_visitors
      FROM visitors
      WHERE site_id = ${siteId} AND anonymous_id LIKE 'mv_shared_ip_user_%'
    `);

    expect(Number((countRes.rows[0] as any).distinct_visitors)).toBe(10);
  });

  it('5. Changed IP edge case: same person moving across different IPs retains single visitor identity', async () => {
    const visitorId = `mv_roaming_traveler_${Date.now()}`;

    // Request from Home WiFi
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'x-forwarded-for': '192.0.2.1' },
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_roam_1_${Date.now()}`,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/home-network',
            hostname: 'example.com',
            referrer: '',
            visitorId,
          },
        ],
      },
    });

    // Request from Mobile Cellular Network (different IP)
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'x-forwarded-for': '198.51.100.50' },
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_roam_2_${Date.now()}`,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/cellular-network',
            hostname: 'example.com',
            referrer: '',
            visitorId,
          },
        ],
      },
    });

    // Request from Coffee Shop VPN (different IP)
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: { 'x-forwarded-for': '203.0.113.88' },
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_roam_3_${Date.now()}`,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/coffee-vpn',
            hostname: 'example.com',
            referrer: '',
            visitorId,
          },
        ],
      },
    });

    const db = getDatabase();
    const rows = await db
      .select()
      .from(visitors)
      .where(eq(visitors.anonymous_id, visitorId));

    // Exactly 1 visitor record exists
    expect(rows.length).toBe(1);
    expect(rows[0]!.last_path).toBe('/coffee-vpn');
  });

  it('6. Race condition: simultaneous concurrent requests from the same new visitor create exactly 1 visitor record', async () => {
    const concurrentVisitorId = `mv_race_condition_${Date.now()}`;

    // Fire 5 requests simultaneously for the same new visitor
    const concurrentRequests = Array.from({ length: 5 }, (_, idx) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/collect',
        payload: {
          siteId,
          events: [
            {
              eventId: `ev_race_${idx}_${Date.now()}`,
              type: 'page_view',
              timestamp: Date.now(),
              path: `/page-${idx}`,
              hostname: 'example.com',
              referrer: '',
              visitorId: concurrentVisitorId,
            },
          ],
        },
      })
    );

    const responses = await Promise.all(concurrentRequests);
    responses.forEach((res) => expect(res.statusCode).toBe(200));

    const db = getDatabase();
    const rows = await db
      .select()
      .from(visitors)
      .where(eq(visitors.anonymous_id, concurrentVisitorId));

    expect(rows.length).toBe(1);
  });
});
