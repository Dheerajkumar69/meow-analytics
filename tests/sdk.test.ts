import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MeowAnalytics, meowAnalytics, generateUUID, sanitizePath } from '@meow-analytics/sdk';
import { createEventQueue } from '../packages/sdk/src/queue.js';
import { createSPARouter } from '../packages/sdk/src/router.js';

describe('Meow Analytics Browser SDK', () => {
  let mockFetch: any;
  let mockSendBeacon: any;
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
      clear: vi.fn(() => {
        mockLocalStorage = {};
      }),
    };

    // Mock fetch & sendBeacon
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    mockSendBeacon = vi.fn().mockReturnValue(true);

    // Setup global window environment
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('navigator', {
      onLine: true,
      sendBeacon: mockSendBeacon,
    });

    vi.stubGlobal('window', {
      location: {
        pathname: '/home',
        hostname: 'test.example.com',
        origin: 'https://test.example.com',
        href: 'https://test.example.com/home',
      },
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      localStorage: localStorageMock,
    });

    vi.stubGlobal('document', {
      referrer: 'https://google.com',
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    MeowAnalytics.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Utility Helpers', () => {
    it('generateUUID produces valid RFC4122 v4 UUIDs', () => {
      const id1 = generateUUID();
      const id2 = generateUUID();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('sanitizePath strips query parameters, hashes, and ensures leading slash', () => {
      expect(sanitizePath('/movies?search=batman&page=2#top')).toBe('/movies');
      expect(sanitizePath('watch?v=123')).toBe('/watch');
      expect(sanitizePath('')).toBe('/');
      expect(sanitizePath('/about/team/')).toBe('/about/team/');
    });
  });

  describe('SPA Router & Duplicate Prevention', () => {
    it('tracks pushState and popstate navigation', () => {
      const onNavigate = vi.fn();
      const router = createSPARouter(onNavigate);

      router.start();

      // Simulate pushState to /movies
      window.location.pathname = '/movies';
      (window.location as any).href = 'https://test.example.com/movies';
      window.history.pushState({}, '', '/movies');

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith('/movies', '/home');

      // Simulate pushState to /watch
      window.location.pathname = '/watch';
      (window.location as any).href = 'https://test.example.com/watch';
      window.history.pushState({}, '', '/watch');

      expect(onNavigate).toHaveBeenCalledTimes(2);
      expect(onNavigate).toHaveBeenLastCalledWith('/watch', '/movies');

      router.stop();
    });

    it('prevents duplicate page views on identical paths (replaceState / re-renders)', () => {
      const onNavigate = vi.fn();
      const router = createSPARouter(onNavigate);

      router.start();

      // Navigation to /movies
      window.location.pathname = '/movies';
      (window.location as any).href = 'https://test.example.com/movies';
      window.history.pushState({}, '', '/movies');
      expect(onNavigate).toHaveBeenCalledTimes(1);

      // Re-trigger replaceState with the exact same path (href unchanged)
      window.history.replaceState({}, '', '/movies');
      window.history.pushState({}, '', '/movies');

      // Must NOT fire another navigation event!
      expect(onNavigate).toHaveBeenCalledTimes(1);

      router.stop();
    });
  });

  describe('Event Queue & Batching', () => {
    it('flushes immediately when batchSize (e.g. 10 events) is reached', async () => {
      const queue = createEventQueue({
        siteId: 'site_test',
        host: 'https://collector.example.com',
        batchSize: 10,
        flushIntervalMs: 10000,
      });

      // Enqueue 9 events -> should not flush yet
      for (let i = 1; i <= 9; i++) {
        queue.enqueue({
          eventId: `evt_${i}`,
          type: 'page_view',
          timestamp: Date.now(),
          path: `/page-${i}`,
          hostname: 'test.example.com',
          referrer: '',
        });
      }

      expect(mockFetch).not.toHaveBeenCalled();
      expect(queue.getQueueLength()).toBe(9);

      // Enqueue 10th event -> triggers batch flush
      queue.enqueue({
        eventId: 'evt_10',
        type: 'page_view',
        timestamp: Date.now(),
        path: '/page-10',
        hostname: 'test.example.com',
        referrer: '',
      });

      // Allow microtask to run
      await new Promise((r) => setTimeout(r, 10));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://collector.example.com/api/v1/collect');

      const body = JSON.parse(callArgs[1].body);
      expect(body.siteId).toBe('site_test');
      expect(body.events.length).toBe(10);
      expect(queue.getQueueLength()).toBe(0);

      queue.destroy();
    });

    it('flushes pending events after flushIntervalMs timeout', async () => {
      vi.useFakeTimers();

      const queue = createEventQueue({
        siteId: 'site_test',
        host: 'https://collector.example.com',
        batchSize: 10,
        flushIntervalMs: 5000,
      });

      queue.enqueue({
        eventId: 'evt_timer_1',
        type: 'page_view',
        timestamp: Date.now(),
        path: '/delayed',
        hostname: 'test.example.com',
        referrer: '',
      });

      expect(mockFetch).not.toHaveBeenCalled();

      // Advance time by 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.events.length).toBe(1);

      queue.destroy();
      vi.useRealTimers();
    });

    it('uses sendBeacon when available on page unload/hidden and falls back to fetch', async () => {
      const queue = createEventQueue({
        siteId: 'site_test',
        host: 'https://collector.example.com',
      });

      queue.enqueue({
        eventId: 'evt_beacon',
        type: 'page_view',
        timestamp: Date.now(),
        path: '/unload',
        hostname: 'test.example.com',
        referrer: '',
      });

      // Flush with useBeacon = true
      await queue.flush(true);

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      const beaconCall = mockSendBeacon.mock.calls[0];
      expect(beaconCall[0]).toBe('https://collector.example.com/api/v1/collect');
      expect(mockFetch).not.toHaveBeenCalled();

      // Now test fallback: if sendBeacon returns false
      mockSendBeacon.mockReturnValueOnce(false);

      queue.enqueue({
        eventId: 'evt_beacon_fallback',
        type: 'page_view',
        timestamp: Date.now(),
        path: '/fallback',
        hostname: 'test.example.com',
        referrer: '',
      });

      await queue.flush(true);

      // Should have fallen back to fetch with keepalive
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].keepalive).toBe(true);

      queue.destroy();
    });
  });

  describe('Retry System & Permanent Error Handling', () => {
    it('retries temporary failures (500 / network failure) with backoff', async () => {
      vi.useFakeTimers();

      // First fetch call fails with 500 Server Error
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const queue = createEventQueue({
        siteId: 'site_test',
        host: 'https://collector.example.com',
        batchSize: 1,
      });

      queue.enqueue({
        eventId: 'evt_retry_me',
        type: 'page_view',
        timestamp: Date.now(),
        path: '/retry-page',
        hostname: 'test.example.com',
        referrer: '',
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance past backoff delay (between 1000ms - 1500ms)
      await vi.advanceTimersByTimeAsync(2000);

      // Second retry call succeeds
      expect(mockFetch).toHaveBeenCalledTimes(2);

      queue.destroy();
      vi.useRealTimers();
    });

    it('DOES NOT retry permanent 4xx errors (400, 403, 404, 422)', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

      const queue = createEventQueue({
        siteId: 'site_test',
        host: 'https://collector.example.com',
        batchSize: 1,
      });

      queue.enqueue({
        eventId: 'evt_bad_req',
        type: 'page_view',
        timestamp: Date.now(),
        path: '/bad-req',
        hostname: 'test.example.com',
        referrer: '',
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance through 10 seconds: must NOT trigger any retries!
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      queue.destroy();
      vi.useRealTimers();
    });
  });

  describe('Offline Queue & Strict Cap', () => {
    it('buffers events in localStorage when browser is offline and flushes on online', async () => {
      // Set offline mode
      (navigator as any).onLine = false;

      const queue = createEventQueue({
        siteId: 'site_offline_test',
        host: 'https://collector.example.com',
        batchSize: 1,
      });

      queue.enqueue({
        eventId: 'evt_offline_1',
        type: 'page_view',
        timestamp: Date.now(),
        path: '/offline-page',
        hostname: 'test.example.com',
        referrer: '',
      });

      await new Promise((r) => setTimeout(r, 10));

      // Must NOT have attempted fetch while offline
      expect(mockFetch).not.toHaveBeenCalled();

      // Must be saved to localStorage
      const saved = mockLocalStorage['__meow_queue_site_offline_test'];
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved!);
      expect(parsed.length).toBe(1);
      expect(parsed[0].eventId).toBe('evt_offline_1');

      // Now restore network
      (navigator as any).onLine = true;
      queue.drainOfflineQueue();

      // Allow flush microtask
      await new Promise((r) => setTimeout(r, 10));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockLocalStorage['__meow_queue_site_offline_test']).toBeUndefined();

      queue.destroy();
    });

    it('enforces strict maximum queue size in localStorage to prevent unbounded storage', () => {
      (navigator as any).onLine = false;

      const queue = createEventQueue({
        siteId: 'site_capped',
        maxQueueSize: 5, // Capped at 5
        batchSize: 1,
      });

      for (let i = 1; i <= 10; i++) {
        queue.enqueue({
          eventId: `evt_capped_${i}`,
          type: 'page_view',
          timestamp: Date.now(),
          path: `/page-${i}`,
          hostname: 'test.example.com',
          referrer: '',
        });
      }

      const saved = mockLocalStorage['__meow_queue_site_capped'];
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved!);

      // Strictly capped at maxQueueSize (5)
      expect(parsed.length).toBe(5);
      // Older items evicted; newest items preserved
      expect(parsed[0].eventId).toBe('evt_capped_6');
      expect(parsed[4].eventId).toBe('evt_capped_10');

      queue.destroy();
    });
  });

  describe('Failure Isolation', () => {
    it('never throws or breaks host website when collector is completely unreachable', () => {
      mockFetch.mockRejectedValue(new Error('Network error: Connection refused'));

      expect(() => {
        MeowAnalytics.init({
          siteId: 'site_unreachable',
          host: 'http://localhost:9999',
          batchSize: 1,
        });

        MeowAnalytics.pageView('/movies');
        MeowAnalytics.track('custom_event', { foo: 'bar' });
      }).not.toThrow();
    });
  });

  describe('Phase 6 SDK APIs & Window Binding', () => {
    it('provides meowAnalytics export and aliases correctly', () => {
      expect(meowAnalytics).toBe(MeowAnalytics);
      expect(typeof meowAnalytics.track).toBe('function');
      expect(typeof meowAnalytics.trackDownload).toBe('function');
      expect(typeof meowAnalytics.trackOutboundClick).toBe('function');
      expect(typeof meowAnalytics.trackError).toBe('function');
      expect(typeof meowAnalytics.trackSessionStart).toBe('function');
    });

    it('tracks custom events with meowAnalytics.track("Signup") and properties', async () => {
      meowAnalytics.init({
        siteId: 'site_p6_sdk',
        host: 'https://analytics.example.com',
        batchSize: 1,
        autoTrack: false,
        heartbeatEnabled: false,
      });

      meowAnalytics.track('Signup');
      await meowAnalytics.flush();

      expect(mockFetch).toHaveBeenCalled();
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const payload = JSON.parse(lastCall[1].body);
      expect(payload.siteId).toBe('site_p6_sdk');
      expect(payload.events[0].eventName).toBe('Signup');
      expect(payload.events[0].type).toBe('custom');
    });

    it('tracks movie with category property: meowAnalytics.track("Play Movie", { movieId, category })', async () => {
      meowAnalytics.init({
        siteId: 'site_p6_sdk',
        host: 'https://analytics.example.com',
        batchSize: 1,
        autoTrack: false,
        heartbeatEnabled: false,
      });

      meowAnalytics.track('Play Movie', { movieId: '123', category: 'action' });
      await meowAnalytics.flush();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const payload = JSON.parse(lastCall[1].body);
      expect(payload.events[0].eventName).toBe('Play Movie');
      expect(payload.events[0].properties).toEqual({ movieId: '123', category: 'action' });
    });

    it('tracks download via meowAnalytics.trackDownload', async () => {
      meowAnalytics.init({
        siteId: 'site_p6_sdk',
        host: 'https://analytics.example.com',
        batchSize: 1,
        autoTrack: false,
        heartbeatEnabled: false,
      });

      meowAnalytics.trackDownload('/downloads/whitepaper.pdf');
      await meowAnalytics.flush();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const payload = JSON.parse(lastCall[1].body);
      expect(payload.events[0].type).toBe('download');
      expect(payload.events[0].properties.filename).toBe('whitepaper.pdf');
      expect(payload.events[0].properties.extension).toBe('pdf');
    });

    it('tracks outbound clicks via meowAnalytics.trackOutboundClick', async () => {
      meowAnalytics.init({
        siteId: 'site_p6_sdk',
        host: 'https://analytics.example.com',
        batchSize: 1,
        autoTrack: false,
        heartbeatEnabled: false,
      });

      meowAnalytics.trackOutboundClick('https://github.com/my-repo');
      await meowAnalytics.flush();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const payload = JSON.parse(lastCall[1].body);
      expect(payload.events[0].type).toBe('outbound_click');
      expect(payload.events[0].properties.destination).toBe('github.com');
    });

    it('tracks errors via meowAnalytics.trackError with sanitization', async () => {
      meowAnalytics.init({
        siteId: 'site_p6_sdk',
        host: 'https://analytics.example.com',
        batchSize: 1,
        autoTrack: false,
        heartbeatEnabled: false,
      });

      meowAnalytics.trackError(new TypeError("Cannot read properties of undefined (reading 'play')"));
      await meowAnalytics.flush();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const payload = JSON.parse(lastCall[1].body);
      expect(payload.events[0].type).toBe('error');
      expect(payload.events[0].properties.errorType).toBe('TypeError');
      expect(payload.events[0].properties.message).toContain("Cannot read properties of undefined (reading 'play')");
    });

    it('tracks session_start via meowAnalytics.trackSessionStart', async () => {
      meowAnalytics.init({
        siteId: 'site_p6_sdk',
        host: 'https://analytics.example.com',
        batchSize: 1,
        autoTrack: false,
        heartbeatEnabled: false,
      });

      meowAnalytics.trackSessionStart();
      await meowAnalytics.flush();

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const payload = JSON.parse(lastCall[1].body);
      expect(payload.events[0].type).toBe('session_start');
      expect(payload.events[0].eventName).toBe('session_start');
    });
  });
});
