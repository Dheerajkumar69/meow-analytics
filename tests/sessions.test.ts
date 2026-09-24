import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase, sessions } from '@meow-analytics/database';
import { eq, sql } from 'drizzle-orm';

describe('Phase 3 — Session System, Timeouts & Bounce Tracking', () => {
  let app: FastifyInstance;
  const adminSecret = 'session_test_admin_secret_12345';
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
      payload: { name: 'Session Lifecycle Test Project' },
    });
    siteId = JSON.parse(projRes.payload).site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('1. Same visitor visiting multiple pages within 30 minutes belongs to the SAME session', async () => {
    const visitorId = `mv_session_user_${Date.now()}`;
    const sessionId = `ms_session_${Date.now()}`;
    const baseTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago

    // Page 1
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_sess_p1_${Date.now()}`,
            type: 'page_view',
            timestamp: baseTime,
            path: '/home',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId,
          },
        ],
      },
    });

    // Page 2 (2 minutes later)
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_sess_p2_${Date.now()}`,
            type: 'page_view',
            timestamp: baseTime + 2 * 60 * 1000,
            path: '/pricing',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId,
          },
        ],
      },
    });

    // Page 3 (5 minutes later)
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_sess_p3_${Date.now()}`,
            type: 'page_view',
            timestamp: baseTime + 5 * 60 * 1000,
            path: '/checkout',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId,
          },
        ],
      },
    });

    const db = getDatabase();
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.session_id, sessionId));

    expect(rows.length).toBe(1);
    const sessionRecord = rows[0]!;
    expect(sessionRecord.page_views).toBe(3);
    expect(sessionRecord.landing_page).toBe('/home');
    expect(sessionRecord.exit_page).toBe('/checkout');
    expect(sessionRecord.is_bounce).toBe(false);
    expect(sessionRecord.duration_seconds).toBe(300); // 5 minutes = 300 seconds
    expect(sessionRecord.is_returning).toBe(false); // First session for this visitor
  });

  it('2. Single page view constitutes a bounce (is_bounce = true)', async () => {
    const visitorId = `mv_bouncer_${Date.now()}`;
    const sessionId = `ms_bouncer_${Date.now()}`;

    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_bounce_${Date.now()}`,
            type: 'page_view',
            timestamp: Date.now(),
            path: '/landing-only',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId,
          },
        ],
      },
    });

    const db = getDatabase();
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.session_id, sessionId));

    expect(rows.length).toBe(1);
    expect(rows[0]!.page_views).toBe(1);
    expect(rows[0]!.is_bounce).toBe(true);
    expect(rows[0]!.duration_seconds).toBe(0);
  });

  it('3. Inactivity timeout: event arriving > 30 minutes after last activity spawns a NEW session and marks returning visitor', async () => {
    const visitorId = `mv_timeout_user_${Date.now()}`;
    const session1Id = `ms_timeout_s1_${Date.now()}`;
    const t0 = new Date('2026-09-20T10:00:00Z').getTime();

    // Session 1: Activity at 10:00:00
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_s1_${Date.now()}`,
            type: 'page_view',
            timestamp: t0,
            path: '/session-1-page',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId: session1Id,
          },
        ],
      },
    });

    // Event 2 arrives at 10:45:00 (> 30 minutes idle) using same session ID token
    const t1 = t0 + 45 * 60 * 1000;
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_s2_${Date.now()}`,
            type: 'page_view',
            timestamp: t1,
            path: '/session-2-page',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId: session1Id, // Reusing client token, but expired
          },
        ],
      },
    });

    const db = getDatabase();
    const allUserSessions = await db.execute(sql`
      SELECT session_id, page_views, is_returning, landing_page
      FROM sessions
      WHERE site_id = ${siteId}
        AND visitor_id = (
          SELECT id FROM visitors WHERE site_id = ${siteId} AND anonymous_id = ${visitorId} LIMIT 1
        )
      ORDER BY started_at ASC
    `);

    // Must have created 2 distinct session records for this visitor
    const userSessions = allUserSessions.rows as any[];
    expect(userSessions.length).toBe(2);

    // First session: is_returning = false
    expect(userSessions[0].is_returning).toBe(false);
    expect(userSessions[0].landing_page).toBe('/session-1-page');

    // Second session: is_returning = true (visitor came back after >30 min gap)
    expect(userSessions[1].is_returning).toBe(true);
    expect(userSessions[1].landing_page).toBe('/session-2-page');
  });

  it('4. Lightweight heartbeat (ping event) updates last_seen_at & duration, but does NOT increment page_views or clear bounce', async () => {
    const visitorId = `mv_heartbeat_user_${Date.now()}`;
    const sessionId = `ms_heartbeat_${Date.now()}`;
    const t0 = Date.now() - 5 * 60 * 1000;

    // 1. Initial Page View
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_hb_pv_${Date.now()}`,
            type: 'page_view',
            timestamp: t0,
            path: '/long-reading-article',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId,
          },
        ],
      },
    });

    // 2. Ping at 60s
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_hb_ping1_${Date.now()}`,
            type: 'ping',
            timestamp: t0 + 60 * 1000,
            path: '/long-reading-article',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId,
          },
        ],
      },
    });

    // 3. Ping at 120s
    await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId,
        events: [
          {
            eventId: `ev_hb_ping2_${Date.now()}`,
            type: 'ping',
            timestamp: t0 + 120 * 1000,
            path: '/long-reading-article',
            hostname: 'example.com',
            referrer: '',
            visitorId,
            sessionId,
          },
        ],
      },
    });

    const db = getDatabase();
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.session_id, sessionId));

    expect(rows.length).toBe(1);
    const s = rows[0]!;
    expect(s.page_views).toBe(1); // Page views still 1!
    // Ping events are keep-alive signals (BUG-23 FIX): they do NOT increment event_count.
    // Only qualifying interactions (page_view, custom events) count.
    expect(s.event_count).toBe(1); // Only the initial page_view is counted
    expect(s.is_bounce).toBe(true); // Still a bounce because only 1 page view
    expect(s.duration_seconds).toBe(120); // 120 seconds duration recorded via last_seen_at update!
  });
});
