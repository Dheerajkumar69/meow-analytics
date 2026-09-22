import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase, projects, projectDomains, pageViews, events } from '@meow-analytics/database';
import { createEventQueue } from '../packages/sdk/src/queue.js';
import { createSPARouter } from '../packages/sdk/src/router.js';
import { sanitizePath, generateUUID } from '../packages/sdk/src/index.js';
import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';

describe('Phase 2 Acceptance Test — Full End-to-End Ingestion Flow', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_12345';
  const authHeaders = { authorization: `Bearer ${adminSecret}` };

  let projectId: string;
  let siteId: string;
  const siteDomain = 'demo.meowflix.com';

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = '12345678901234567890123456789012';
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = 'http://localhost:5173,http://localhost:3000';

    await migrateDatabase('memory://');
    app = await buildApp();

    // 1. Setup Acceptance Test Project
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeaders,
      payload: { name: 'MeowFlix Acceptance Demo', timezone: 'UTC' },
    });
    const projData = JSON.parse(projRes.payload);
    projectId = projData.id;
    siteId = projData.site_id;

    // 2. Configure authorized domain
    await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/domains`,
      headers: authHeaders,
      payload: { domain: siteDomain },
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  it('Step 1: Visiting /, /movies, /search, /watch via SPA creates exactly 4 page views in database', async () => {
    // Setup simulated browser environment for MeowFlix
    let currentPath = '/';
    let currentReferrer = '';
    const mockStorage: Record<string, string> = {};

    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {},
    };

    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('navigator', { onLine: true, sendBeacon: null });
    vi.stubGlobal('window', {
      location: {
        pathname: '/',
        hostname: siteDomain,
        origin: `https://${siteDomain}`,
      },
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: localStorageMock,
    });
    vi.stubGlobal('document', {
      get referrer() {
        return currentReferrer;
      },
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    // Custom fetch forwarding directly into Fastify app
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      const response = await app.inject({
        method: init.method,
        url: '/api/v1/collect',
        headers: {
          ...init.headers,
          origin: `https://${siteDomain}`,
        },
        payload: init.body,
      });
      return {
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        json: async () => JSON.parse(response.payload),
      };
    });

    const queue = createEventQueue({
      siteId,
      host: `https://${siteDomain}`,
      batchSize: 10,
    });

    function trackPageView(path: string, ref = '') {
      queue.enqueue({
        eventId: generateUUID(),
        type: 'page_view',
        timestamp: Date.now(),
        path: sanitizePath(path),
        hostname: siteDomain,
        referrer: ref,
      });
    }

    const router = createSPARouter((newPath, oldPath) => {
      currentReferrer = oldPath ? `https://${siteDomain}${oldPath}` : '';
      trackPageView(newPath, currentReferrer);
    });

    router.start();

    // 1. Visit / (initial load)
    trackPageView('/');

    // 2. SPA navigate to /movies
    window.location.pathname = '/movies';
    window.history.pushState({}, '', '/movies');

    // 3. SPA navigate to /search
    window.location.pathname = '/search';
    window.history.pushState({}, '', '/search');

    // 4. SPA navigate to /watch
    window.location.pathname = '/watch';
    window.history.pushState({}, '', '/watch');

    // Flush batch to database
    await queue.flush();

    // Verify Database records
    const db = getDatabase();
    const rows = await db
      .select()
      .from(pageViews)
      .where(eq(pageViews.site_id, siteId))
      .orderBy(desc(pageViews.timestamp));

    expect(rows.length).toBe(4);
    const recordedPaths = rows.map((r) => r.path);
    expect(recordedPaths).toContain('/');
    expect(recordedPaths).toContain('/movies');
    expect(recordedPaths).toContain('/search');
    expect(recordedPaths).toContain('/watch');

    // Step 2: Reloading / re-navigating to /movies creates a new page view
    window.location.pathname = '/movies';
    window.history.pushState({}, '', '/movies');
    await queue.flush();

    const rowsAfterReload = await db
      .select()
      .from(pageViews)
      .where(eq(pageViews.site_id, siteId));

    expect(rowsAfterReload.length).toBe(5);
    const movieViews = rowsAfterReload.filter((r) => r.path === '/movies');
    expect(movieViews.length).toBe(2);

    // Step 3: SPA navigation to the EXACT SAME path (/movies while on /movies) must NOT create duplicate page views
    window.history.replaceState({}, '', '/movies');
    window.history.pushState({}, '', '/movies');
    await queue.flush();

    const rowsAfterDuplicateCheck = await db
      .select()
      .from(pageViews)
      .where(eq(pageViews.site_id, siteId));

    expect(rowsAfterDuplicateCheck.length).toBe(5);

    // Step 4: Stopping the API must NOT break the website
    // Simulate API going down
    vi.stubGlobal('fetch', async () => {
      throw new Error('Connection refused: API is down (503)');
    });

    // Host website user navigates while API is dead
    expect(() => {
      trackPageView('/about');
      window.location.pathname = '/about';
      window.history.pushState({}, '', '/about');
    }).not.toThrow();

    // Verify SDK flush failure is completely isolated and never crashes host
    await expect(queue.flush()).resolves.not.toThrow();

    router.stop();
    queue.destroy();
    vi.unstubAllGlobals();
  });
});
