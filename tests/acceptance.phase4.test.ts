import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase } from '@meow-analytics/database';
import { sql } from 'drizzle-orm';

describe('Phase 4 — Master Acceptance Test (Section 21)', () => {
  let app: FastifyInstance;
  const adminSecret = 'phase4_master_acceptance_secret_12345';
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
      payload: { name: 'Phase 4 Acceptance Site' },
    });
    siteId = JSON.parse(projRes.payload).site_id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('Executes the exact Section 21 Acceptance Test: India/Chrome/Android/Google, USA/Firefox/Linux/Reddit, India/Safari/iOS/Direct', async () => {
    const now = Date.now();

    // 1. Traffic 1: India / Chrome / Android / Google
    // User-Agent: Android Chrome
    const uaIndiaChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
    const refGoogle = 'https://www.google.co.in/search?q=meow+analytics';
    const vis1 = 'mv_vis_india_android';
    const ses1 = 'ms_ses_india_android';

    const resp1 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'user-agent': uaIndiaChrome,
        'cf-ipcountry': 'IN',
        'cf-region': 'Maharashtra',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'ev_p4_1',
            type: 'page_view',
            timestamp: now - 30000,
            path: '/landing?utm_source=google&utm_medium=cpc&utm_campaign=brand_search',
            hostname: 'acceptance.meow.com',
            referrer: refGoogle,
            visitorId: vis1,
            sessionId: ses1,
            language: 'en-IN',
            screenWidth: 393,
            screenHeight: 852,
          },
        ],
      },
    });
    expect(resp1.statusCode).toBe(200);
    expect(JSON.parse(resp1.payload).ingested).toBe(1);

    // 2. Traffic 2: USA / Firefox / Linux / Reddit
    // User-Agent: Linux Firefox
    const uaUsaFirefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0';
    const refReddit = 'https://www.reddit.com/r/selfhosted/comments/123';
    const vis2 = 'mv_vis_usa_linux';
    const ses2 = 'ms_ses_usa_linux';

    const resp2 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'user-agent': uaUsaFirefox,
        'cf-ipcountry': 'US',
        'cf-region': 'California',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'ev_p4_2',
            type: 'page_view',
            timestamp: now - 20000,
            path: '/docs',
            hostname: 'acceptance.meow.com',
            referrer: refReddit,
            visitorId: vis2,
            sessionId: ses2,
            language: 'en-US',
            screenWidth: 1920,
            screenHeight: 1080,
          },
        ],
      },
    });
    expect(resp2.statusCode).toBe(200);
    expect(JSON.parse(resp2.payload).ingested).toBe(1);

    // 3. Traffic 3: India / Safari / iOS / Direct
    // User-Agent: iOS Safari (iPhone)
    const uaSafariIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
    const vis3 = 'mv_vis_india_ios';
    const ses3 = 'ms_ses_india_ios';

    const resp3 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'user-agent': uaSafariIos,
        'cf-ipcountry': 'IN',
        'cf-region': 'Karnataka',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'ev_p4_3',
            type: 'page_view',
            timestamp: now - 10000,
            path: '/pricing',
            hostname: 'acceptance.meow.com',
            referrer: '', // No referrer = Direct
            visitorId: vis3,
            sessionId: ses3,
            language: 'en-GB',
            screenWidth: 390,
            screenHeight: 844,
          },
        ],
      },
    });
    expect(resp3.statusCode).toBe(200);
    expect(JSON.parse(resp3.payload).ingested).toBe(1);

    // 4. Ingest an Obvious Bot Request (Googlebot)
    const uaGooglebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    const respBot = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      headers: {
        'user-agent': uaGooglebot,
        'cf-ipcountry': 'US',
      },
      payload: {
        siteId,
        events: [
          {
            eventId: 'ev_p4_bot',
            type: 'page_view',
            timestamp: now - 5000,
            path: '/robots.txt',
            hostname: 'acceptance.meow.com',
            referrer: '',
            visitorId: 'mv_bot_crawler',
            sessionId: 'ms_bot_session',
          },
        ],
      },
    });
    expect(respBot.statusCode).toBe(200);

    // ==========================================
    // VERIFY DASHBOARD ANALYTICS GROUPINGS
    // ==========================================

    // A. Country Table Grouping (Section 15)
    // Exclude bots by default: India = 2 visitors, USA = 1 visitor
    const locRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/locations?siteId=${siteId}`,
    });
    expect(locRes.statusCode).toBe(200);
    const locData = JSON.parse(locRes.payload);
    expect(locData.countries).toBeDefined();

    const india = locData.countries.find((c: any) => c.countryCode === 'IN');
    const usa = locData.countries.find((c: any) => c.countryCode === 'US');

    expect(india).toBeDefined();
    expect(india.countryName).toBe('India');
    expect(india.visitors).toBe(2);
    expect(india.pageViews).toBe(2);

    expect(usa).toBeDefined();
    expect(usa.countryName).toBe('USA');
    expect(usa.visitors).toBe(1);
    expect(usa.pageViews).toBe(1);

    // B. Device Table Grouping (Section 16)
    // Exclude bots by default: mobile = 2, desktop = 1
    const devRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/devices?siteId=${siteId}`,
    });
    expect(devRes.statusCode).toBe(200);
    const devData = JSON.parse(devRes.payload);

    const mobile = devData.devices.find((d: any) => d.device === 'mobile');
    const desktop = devData.devices.find((d: any) => d.device === 'desktop');

    expect(mobile).toBeDefined();
    expect(mobile.visitors).toBe(2);
    expect(desktop).toBeDefined();
    expect(desktop.visitors).toBe(1);

    // When including bots, bot device must be present
    const devBotsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/devices?siteId=${siteId}&includeBots=true`,
    });
    const devBotsData = JSON.parse(devBotsRes.payload);
    const botDev = devBotsData.devices.find((d: any) => d.device === 'bot');
    expect(botDev).toBeDefined();
    expect(botDev.visitors).toBe(1);

    // C. Browser Table Grouping (Section 9 & 14)
    const browserRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/browsers?siteId=${siteId}`,
    });
    expect(browserRes.statusCode).toBe(200);
    const browserData = JSON.parse(browserRes.payload);

    const chrome = browserData.browsers.find((b: any) => b.browser === 'Chrome');
    const firefox = browserData.browsers.find((b: any) => b.browser === 'Firefox');
    const safari = browserData.browsers.find((b: any) => b.browser === 'Safari');

    expect(chrome.visitors).toBe(1);
    expect(firefox.visitors).toBe(1);
    expect(safari.visitors).toBe(1);

    // D. Operating Systems Grouping (Section 8 & 14)
    const osRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/os?siteId=${siteId}`,
    });
    expect(osRes.statusCode).toBe(200);
    const osData = JSON.parse(osRes.payload);

    const android = osData.os.find((o: any) => o.os === 'Android');
    const linux = osData.os.find((o: any) => o.os === 'Linux');
    const ios = osData.os.find((o: any) => o.os === 'iOS');

    expect(android.visitors).toBe(1);
    expect(linux.visitors).toBe(1);
    expect(ios.visitors).toBe(1);

    // E. Traffic Sources & Referrers (Section 2, 3, 17)
    const sourcesRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/sources?siteId=${siteId}`,
    });
    expect(sourcesRes.statusCode).toBe(200);
    const sourcesData = JSON.parse(sourcesRes.payload);

    const googleSrc = sourcesData.sources.find((s: any) => s.source === 'Google');
    const redditSrc = sourcesData.sources.find((s: any) => s.source === 'Reddit');
    const directSrc = sourcesData.sources.find((s: any) => s.source === 'Direct');

    expect(googleSrc.visitors).toBe(1);
    expect(redditSrc.visitors).toBe(1);
    expect(directSrc.visitors).toBe(1);

    // F. Referrer Drill-down (Section 17)
    const drillGoogleRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/sources/drilldown?siteId=${siteId}&source=Google`,
    });
    expect(drillGoogleRes.statusCode).toBe(200);
    const drillGoogle = JSON.parse(drillGoogleRes.payload);
    expect(drillGoogle.referrers[0].referrerHostname).toBe('www.google.co.in');

    const drillRedditRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/sources/drilldown?siteId=${siteId}&source=Reddit`,
    });
    expect(drillRedditRes.statusCode).toBe(200);
    const drillReddit = JSON.parse(drillRedditRes.payload);
    expect(drillReddit.referrers[0].referrerHostname).toBe('www.reddit.com');

    // G. UTM Dashboard (Section 18)
    const utmRes = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/utm?siteId=${siteId}`,
    });
    expect(utmRes.statusCode).toBe(200);
    const utmData = JSON.parse(utmRes.payload);
    expect(utmData.campaigns.length).toBeGreaterThan(0);
    const brandCampaign = utmData.campaigns.find((c: any) => c.campaign === 'brand_search');
    expect(brandCampaign).toBeDefined();
    expect(brandCampaign.source).toBe('google');
    expect(brandCampaign.medium).toBe('cpc');
    expect(brandCampaign.visitors).toBe(1);

    // H. Privacy: Verify Raw IP is NEVER Stored in Database (Section 19)
    const db = getDatabase();
    const eventCols = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'events'
    `);
    const colNames = eventCols.rows.map((r: any) => r.column_name.toLowerCase());
    expect(colNames).not.toContain('ip');
    expect(colNames).not.toContain('raw_ip');
    expect(colNames).not.toContain('client_ip');
  });
});
