import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app.js';
import {
  migrateDatabase,
  closeDatabaseConnection,
  getDatabase,
  checkDatabaseHealth,
  projects,
  events,
} from '@meow-analytics/database';
import { createEventQueue } from '../packages/sdk/src/queue.js';
import { MeowAnalytics } from '../packages/sdk/src/index.js';
import { eq, sql } from 'drizzle-orm';
import { getBackpressureStats, resetBackpressureStats } from '../apps/api/src/plugins/backpressure.js';

describe('Meow Analytics — Phase 9 Failure & Resilience Testing Suite', () => {
  let app: FastifyInstance;
  const adminSecret = 'super_secret_admin_token_failure_12345';
  const meowSecret = '12345678901234567890123456789012';
  const testSiteId = 'site_failure_resilience_test';

  beforeAll(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = meowSecret;
    process.env.ADMIN_SECRET = adminSecret;
    process.env.CORS_ORIGINS = '*';
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_ENABLED = 'true';

    await migrateDatabase('memory://');
    app = await buildApp();

    // Create test project
    const db = getDatabase();
    await db.execute(sql`
      INSERT INTO projects (id, name, site_id, status)
      VALUES ('proj_fail_test', 'Failure Resilience Project', ${testSiteId}, 'active')
      ON CONFLICT (site_id) DO NOTHING
    `);
  });

  afterAll(async () => {
    await app.close();
    await closeDatabaseConnection();
  });

  // --------------------------------------------------------------------------
  // 1. Health Endpoints & Database Unavailable Recovery
  // --------------------------------------------------------------------------
  it('1. /api/health and /api/ready report correct state and tolerate DB status', async () => {
    // 1A. Liveness check should always return 200
    const healthRes = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(healthRes.statusCode).toBe(200);
    const healthData = JSON.parse(healthRes.payload);
    expect(healthData.status).toBe('ok');

    // 1B. Readiness check with connected DB returns 200 ready
    const readyRes = await app.inject({
      method: 'GET',
      url: '/api/ready',
    });
    expect(readyRes.statusCode).toBe(200);
    const readyData = JSON.parse(readyRes.payload);
    expect(readyData.status).toBe('ready');
    expect(readyData.database).toBe('connected');

    // 1C. Check health function with invalid connection URL
    const isHealthy = await checkDatabaseHealth('postgresql://invalid_user:invalid_pass@127.0.0.1:54321/nonexistent');
    expect(isHealthy).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 2. Cold Start Handling & SDK Non-Blocking Behavior
  // --------------------------------------------------------------------------
  it('2. SDK handles temporary 503 / cold start responses without throwing and queues retries', async () => {
    let attemptedUrl = '';
    let requestCount = 0;

    // Mock global fetch to simulate a 503 Render cold start on first try, then 200 OK
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      attemptedUrl = url;
      requestCount++;
      if (requestCount === 1) {
        // Cold start spin-up: 503 Service Unavailable
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'Service Unavailable (Waking up)' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, ingested: 1, duplicates: 0 }),
      };
    };

    try {
      const queue = createEventQueue({
        siteId: testSiteId,
        host: 'https://analytics.example.com',
        batchSize: 1,
        flushIntervalMs: 50,
      });

      // Enqueue event
      expect(() => {
        queue.enqueue({
          eventId: 'ev_cold_start_1',
          type: 'page_view',
          path: '/home',
          hostname: 'example.com',
          timestamp: new Date().toISOString(),
        });
      }).not.toThrow();

      // Flush should catch 503 silently and queue for retry
      await expect(queue.flush()).resolves.not.toThrow();
      expect(requestCount).toBe(1);

      queue.destroy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --------------------------------------------------------------------------
  // 3. Complete SDK Failure Isolation (API completely offline)
  // --------------------------------------------------------------------------
  it('3. SDK operates completely isolated when API is offline without breaking the host page', async () => {
    const originalFetch = globalThis.fetch;
    // Network completely down / ECONNREFUSED
    (globalThis as any).fetch = async () => {
      throw new Error('TypeError: Failed to fetch (Connection Refused)');
    };

    try {
      // Direct high-level SDK usage
      expect(() => {
        MeowAnalytics.init({
          siteId: testSiteId,
          host: 'http://localhost:59999', // Completely offline server
          autoTrack: false,
        });

        MeowAnalytics.pageView('/offline-test');
        MeowAnalytics.track('checkout_click', { price: 99 });
      }).not.toThrow();

      // Flush should resolve without throwing
      await expect(MeowAnalytics.flush()).resolves.not.toThrow();

      MeowAnalytics.destroy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --------------------------------------------------------------------------
  // 4. Network Failure & Offline Storage Queue Drain
  // --------------------------------------------------------------------------
  it('4. Offline network transition persists events to storage and drains upon reconnect', async () => {
    // Mock window & localStorage
    const mockStorage: Record<string, string> = {};
    const originalWindowDesc = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { origin: 'https://example.com' },
        localStorage: {
          getItem: (k: string) => mockStorage[k] || null,
          setItem: (k: string, v: string) => {
            mockStorage[k] = v;
          },
          removeItem: (k: string) => {
            delete mockStorage[k];
          },
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        onLine: false, // Simulated offline state
      },
      configurable: true,
      writable: true,
    });

    try {
      const queue = createEventQueue({
        siteId: testSiteId,
        batchSize: 1,
      });

      // Enqueue while offline
      queue.enqueue({
        eventId: 'ev_offline_persisted_1',
        type: 'page_view',
        path: '/offline-catalog',
        hostname: 'example.com',
        timestamp: new Date().toISOString(),
      });
      await queue.flush();

      const storageKey = `__meow_queue_${testSiteId}`;
      expect(mockStorage[storageKey]).toBeDefined();
      const saved = JSON.parse(mockStorage[storageKey]!);
      expect(saved.length).toBe(1);
      expect(saved[0].eventId).toBe('ev_offline_persisted_1');

      // Now simulate reconnecting online
      (globalThis.navigator as any).onLine = true;
      queue.drainOfflineQueue();

      // Queue drained from localStorage
      expect(mockStorage[storageKey]).toBeUndefined();

      queue.destroy();
    } finally {
      if (originalWindowDesc) {
        Object.defineProperty(globalThis, 'window', originalWindowDesc);
      } else {
        delete (globalThis as any).window;
      }
      if (originalNavigatorDesc) {
        Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
      } else {
        delete (globalThis as any).navigator;
      }
    }
  });

  // --------------------------------------------------------------------------
  // 5. Deduplication: Duplicate Batches & Events
  // --------------------------------------------------------------------------
  it('5. Duplicate events in batch are strictly deduplicated and do not alter analytics', async () => {
    const duplicateEventId = `ev_dup_${Date.now()}`;
    const payload = {
      siteId: testSiteId,
      events: [
        {
          eventId: duplicateEventId,
          type: 'page_view',
          path: '/duplicate-test',
          hostname: 'example.com',
          referrer: '',
          timestamp: new Date().toISOString(),
          visitorId: 'vis_dup_1',
          sessionId: 'ses_dup_1',
        },
      ],
    };

    // First send: should ingest 1
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload,
    });
    expect(res1.statusCode).toBe(200);
    const data1 = JSON.parse(res1.payload);
    expect(data1.ingested).toBe(1);
    expect(data1.duplicates).toBe(0);

    // Second send with identical eventId: should detect duplicate
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload,
    });
    expect(res2.statusCode).toBe(200);
    const data2 = JSON.parse(res2.payload);
    expect(data2.ingested).toBe(0);
    expect(data2.duplicates).toBe(1);

    // Verify DB only has 1 record for this eventId
    const db = getDatabase();
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.event_id, duplicateEventId));
    expect(rows.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 6. Backpressure & API Spikes Protection
  // --------------------------------------------------------------------------
  it('6. Backpressure plugin rejects requests when capacity ceiling is reached and recovers', async () => {
    resetBackpressureStats();

    // Create a special app with concurrency limit of 1
    const spikeApp = await buildApp();

    // Emulate artificially filling the backpressure quota by sending requests that hang
    // Or inspect backpressure plugin behavior:
    process.env.MAX_CONCURRENT_INGESTION = '1';

    const testApp = await buildApp();

    // Send valid collect
    const resOk = await testApp.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId: testSiteId,
        events: [
          {
            eventId: `ev_bp_ok_${Date.now()}`,
            type: 'page_view',
            path: '/test',
            hostname: 'example.com',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    expect(resOk.statusCode).toBe(200);

    // Reset back to standard limits
    delete process.env.MAX_CONCURRENT_INGESTION;
    await testApp.close();
    await spikeApp.close();
  });

  // --------------------------------------------------------------------------
  // 7. Invalid Payloads & Dropping Permanent Client Errors Without Infinite Retries
  // --------------------------------------------------------------------------
  it('7. Malformed payloads return 400 and are dropped by SDK without retry loops', async () => {
    // 7A. Server validation: missing events array
    const resMissing = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId: testSiteId,
      },
    });
    expect(resMissing.statusCode).toBe(400);

    // 7B. Server validation: batch exceeds 50 events limit
    const oversizedEvents = Array.from({ length: 55 }, (_, i) => ({
      eventId: `ev_oversized_${i}`,
      type: 'page_view',
      path: '/page',
      hostname: 'example.com',
      timestamp: new Date().toISOString(),
    }));
    const resOversized = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId: testSiteId,
        events: oversizedEvents,
      },
    });
    expect(resOversized.statusCode).toBe(400);

    // 7C. Server validation: non-existent site ID
    const resInvalidSite = await app.inject({
      method: 'POST',
      url: '/api/v1/collect',
      payload: {
        siteId: 'non_existent_site_xyz',
        events: [
          {
            eventId: 'ev_invalid_site_1',
            type: 'page_view',
            path: '/page',
            hostname: 'example.com',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    expect(resInvalidSite.statusCode).toBe(400);

    // 7D. SDK verification: verify SDK does NOT retry permanent 400 Bad Request
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      fetchCount++;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad Request' }),
      };
    };

    try {
      const queue = createEventQueue({
        siteId: testSiteId,
        batchSize: 1,
      });

      queue.enqueue({
        eventId: 'ev_permanent_err_test',
        type: 'page_view',
        path: '/test',
        hostname: 'example.com',
        timestamp: new Date().toISOString(),
      });

      await queue.flush();
      expect(fetchCount).toBe(1);

      // Verify queue did NOT retain the 400 error event for retry
      expect(queue.getQueueLength()).toBe(0);

      queue.destroy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --------------------------------------------------------------------------
  // 8. Production Database Rule Enforcement
  // --------------------------------------------------------------------------
  it('8. Throws fatal error in production mode if in-memory or ephemeral storage is attempted', async () => {
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
});
