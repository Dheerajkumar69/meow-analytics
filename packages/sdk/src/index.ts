import { MeowConfig, MeowEvent, PerformanceMetricData } from './types.js';
import { createEventQueue, EventQueue } from './queue.js';
import { createSPARouter, SPARouter } from './router.js';
import { createPerformanceObserverController, PerformanceObserverController } from './performance.js';

export * from './types.js';
export * from './queue.js';
export * from './router.js';
export * from './performance.js';

let currentConfig: MeowConfig | null = null;
let eventQueue: EventQueue | null = null;
let router: SPARouter | null = null;
let perfController: PerformanceObserverController | null = null;
let isEnabled = true;
let isInitialized = false;

// In-memory identity fallbacks when storage is unavailable or disabled
let inMemoryVisitorId: string | null = null;
let inMemorySessionId: string | null = null;
let inMemorySessionLastActivity = 0;

// Heartbeat interval timer & event listener references
let heartbeatTimer: any = null;
let visibilityHandler: (() => void) | null = null;
let clickListener: ((e: MouseEvent) => void) | null = null;
let errorHandler: ((e: ErrorEvent) => void) | null = null;
let rejectionHandler: ((e: PromiseRejectionEvent) => void) | null = null;

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|pass|token|secret|authorization|auth|cookie|session|bearer|apikey|api_key|access_token|refresh_token|credit_card|card_number|cvv|cvc|ssn)/i;

function sanitizeClientProperties(raw?: Record<string, any>): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, any> = {};
  let count = 0;

  for (const [key, val] of Object.entries(raw)) {
    if (count >= 50) break;
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    const safeKey = key.trim().slice(0, 64);
    if (!safeKey) continue;

    if (typeof val === 'string') {
      clean[safeKey] = val.slice(0, 512);
      count++;
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      clean[safeKey] = val;
      count++;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested: Record<string, any> = {};
      let nestedCount = 0;
      for (const [nk, nv] of Object.entries(val)) {
        if (nestedCount >= 20) break;
        if (SENSITIVE_KEY_PATTERN.test(nk)) continue;
        const safeNk = nk.trim().slice(0, 64);
        if (!safeNk) continue;
        if (typeof nv === 'string') {
          nested[safeNk] = nv.slice(0, 512);
          nestedCount++;
        } else if (typeof nv === 'number' || typeof nv === 'boolean') {
          nested[safeNk] = nv;
          nestedCount++;
        }
      }
      clean[safeKey] = nested;
      count++;
    }
  }

  return clean;
}

const VISITOR_STORAGE_KEY = '_meow_vid';
const SESSION_STORAGE_KEY = '_meow_sid';
const SESSION_LAST_ACTIVE_KEY = '_meow_slast';
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Generate a random alphanumeric string with prefix.
 * e.g. prefix 'mv_' -> mv_9f2k3j...
 */
export function generateRandomId(prefix: string, length = 24): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      for (let i = 0; i < length; i++) {
        result += chars[bytes[i]! % chars.length];
      }
      return `${prefix}${result}`;
    }
  } catch {}

  for (let i = 0; i < length; i++) {
    result += chars[(Math.random() * chars.length) | 0];
  }
  return `${prefix}${result}`;
}

/**
 * Generate an RFC 4122 compliant UUID v4.
 * Uses crypto.randomUUID when available, with a robust fallback.
 */
export function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}

  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
      bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant 10xx
      const hex: string[] = [];
      for (let i = 0; i < 16; i++) {
        hex.push(bytes[i]!.toString(16).padStart(2, '0'));
      }
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    }
  } catch {}

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Sanitize the URL path:
 * - Strips query parameters (?...)
 * - Strips hash anchors (#...)
 * - Ensures leading slash
 */
export function sanitizePath(rawPath?: string): string {
  try {
    const source = rawPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    const withoutQuery = source.split('?')[0] ?? '';
    const clean = (withoutQuery.split('#')[0] ?? '').trim();
    return clean.startsWith('/') ? clean : `/${clean}`;
  } catch {
    return '/';
  }
}

/**
 * Read a cookie by name safely.
 */
function getCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}

/**
 * Write a cookie safely (first-party, SameSite=Lax).
 */
function setCookie(name: string, value: string, maxAgeSeconds = 365 * 24 * 3600): void {
  try {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  } catch {}
}

/**
 * Get or generate first-party anonymous visitor ID.
 * Example: mv_<random24>
 * Never derived from IP, UA, email, phone, name, or fingerprint.
 */
export function getOrCreateVisitorId(): string {
  // If memory only configured or memory cached
  if (currentConfig?.storageType === 'memory') {
    if (!inMemoryVisitorId) {
      inMemoryVisitorId = generateRandomId('mv_');
    }
    return inMemoryVisitorId;
  }

  // 1. Try localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(VISITOR_STORAGE_KEY);
      if (stored && stored.startsWith('mv_')) {
        return stored;
      }
    }
  } catch {}

  // 2. Try Cookie fallback
  const cookieVal = getCookie(VISITOR_STORAGE_KEY);
  if (cookieVal && cookieVal.startsWith('mv_')) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(VISITOR_STORAGE_KEY, cookieVal);
      }
    } catch {}
    return cookieVal;
  }

  // 3. Check in-memory fallback
  if (inMemoryVisitorId) {
    return inMemoryVisitorId;
  }

  // 4. Generate new first-party anonymous ID
  const newVisitorId = generateRandomId('mv_');
  inMemoryVisitorId = newVisitorId;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VISITOR_STORAGE_KEY, newVisitorId);
    }
  } catch {}

  try {
    setCookie(VISITOR_STORAGE_KEY, newVisitorId);
  } catch {}

  return newVisitorId;
}

/**
 * Get or rotate session ID based on inactivity timeout (default 30 min).
 * Example: ms_<random24>
 */
export function getOrCreateSessionId(): string {
  const timeoutMs = currentConfig?.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
  const now = Date.now();

  // If memory storage configured
  if (currentConfig?.storageType === 'memory') {
    if (!inMemorySessionId || now - inMemorySessionLastActivity > timeoutMs) {
      inMemorySessionId = generateRandomId('ms_');
    }
    inMemorySessionLastActivity = now;
    return inMemorySessionId;
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      const storedSid = sessionStorage.getItem(SESSION_STORAGE_KEY);
      const storedLast = sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY);

      if (storedSid && storedSid.startsWith('ms_') && storedLast) {
        const lastActivity = parseInt(storedLast, 10);
        if (!isNaN(lastActivity) && now - lastActivity <= timeoutMs) {
          // Valid session, refresh activity timestamp
          sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, now.toString());
          inMemorySessionId = storedSid;
          inMemorySessionLastActivity = now;
          return storedSid;
        }
      }

      // Expired or non-existent: create new session
      const newSid = generateRandomId('ms_');
      sessionStorage.setItem(SESSION_STORAGE_KEY, newSid);
      sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, now.toString());
      inMemorySessionId = newSid;
      inMemorySessionLastActivity = now;
      return newSid;
    }
  } catch {}

  // Fallback to in-memory session tracking
  if (!inMemorySessionId || now - inMemorySessionLastActivity > timeoutMs) {
    inMemorySessionId = generateRandomId('ms_');
  }
  inMemorySessionLastActivity = now;
  return inMemorySessionId;
}

/**
 * Manually force-start a new session (e.g. for testing or logout).
 */
export function resetSession(): string {
  const newSid = generateRandomId('ms_');
  const now = Date.now();
  inMemorySessionId = newSid;
  inMemorySessionLastActivity = now;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, newSid);
      sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, now.toString());
    }
  } catch {}
  return newSid;
}

/**
 * Extracts and whitelists only standard UTM parameters from window.location.search.
 * Discards any arbitrary query parameters to ensure privacy.
 */
function extractBrowserUtm(): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
} {
  try {
    if (typeof window === 'undefined' || !window.location || !window.location.search) {
      return {};
    }
    const params = new URLSearchParams(window.location.search);
    const res: any = {};
    const s = params.get('utm_source')?.trim();
    const m = params.get('utm_medium')?.trim();
    const c = params.get('utm_campaign')?.trim();
    const t = params.get('utm_term')?.trim();
    const co = params.get('utm_content')?.trim();
    if (s) res.utmSource = s.slice(0, 255);
    if (m) res.utmMedium = m.slice(0, 255);
    if (c) res.utmCampaign = c.slice(0, 255);
    if (t) res.utmTerm = t.slice(0, 255);
    if (co) res.utmContent = co.slice(0, 255);
    return res;
  } catch {
    return {};
  }
}

/**
 * Reads non-invasive browser display context (screen, language, timezone).
 * Never fingerprints or queries GPS/location.
 */
function getBrowserContext() {
  try {
    const screenWidth = typeof window !== 'undefined' && window.screen && window.screen.width > 0 ? Math.round(window.screen.width) : undefined;
    const screenHeight = typeof window !== 'undefined' && window.screen && window.screen.height > 0 ? Math.round(window.screen.height) : undefined;
    const viewportWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? Math.round(window.innerWidth) : undefined;
    const viewportHeight = typeof window !== 'undefined' && window.innerHeight > 0 ? Math.round(window.innerHeight) : undefined;
    const devicePixelRatio = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? Number(window.devicePixelRatio.toFixed(2)) : undefined;
    const language = typeof navigator !== 'undefined' && navigator.language ? navigator.language : undefined;
    let timezone: string | undefined;
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    } catch {}

    return {
      screenWidth,
      screenHeight,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      language,
      timezone,
    };
  } catch {
    return {};
  }
}

/**
 * Main MeowAnalytics client interface.
 */
export const MeowAnalytics = {
  /**
   * Initialize Meow Analytics with options.
   */
  init(config: MeowConfig): void {
    try {
      if (!config || !config.siteId) {
        if (config?.debug) console.warn('[MeowAnalytics] siteId is required for initialization');
        return;
      }

      // Cleanup prior instance if re-initializing
      if (isInitialized) {
        MeowAnalytics.destroy();
      }

      currentConfig = {
        batchSize: 10,
        flushIntervalMs: 5000,
        maxQueueSize: 50,
        autoTrack: true,
        debug: false,
        sessionTimeoutMs: DEFAULT_SESSION_TIMEOUT_MS,
        heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
        heartbeatEnabled: true,
        ...config,
      };

      eventQueue = createEventQueue(currentConfig);
      isEnabled = true;
      isInitialized = true;

      // Ensure visitor and session IDs are initialized
      getOrCreateVisitorId();
      getOrCreateSessionId();

      // Automatic Session Start Tracking (Section 8)
      if (currentConfig.trackSessionStart) {
        MeowAnalytics.trackSessionStart();
      }

      // SPA Router & automatic navigation tracking
      if (currentConfig.autoTrack) {
        router = createSPARouter((path) => {
          perfController?.resetForRoute(path);
          MeowAnalytics.pageView(path);
        });
        router.start();

        // Track initial page load
        MeowAnalytics.pageView();
      }

      // Automatic Web Performance / Speed Insights Tracking (Phase 7)
      if (currentConfig.trackPerformance !== false) {
        perfController = createPerformanceObserverController({
          sampleRate: currentConfig.performanceSampleRate,
          getPath: () => sanitizePath(),
          onReport: (metrics) => {
            MeowAnalytics.trackPerformance(metrics);
          },
        });
      }

      // Start lightweight periodic heartbeat for live visitor tracking (default 60s)
      if (currentConfig.heartbeatEnabled !== false) {
        MeowAnalytics.startHeartbeat();
      }

      // Automatic Outbound Click & Download Tracking
      if (typeof document !== 'undefined') {
        clickListener = (e: MouseEvent) => {
          try {
            const target = e.target as HTMLElement | null;
            const anchor = target?.closest('a') as HTMLAnchorElement | null;
            if (!anchor || !anchor.href) return;

            const href = anchor.href;
            const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
            const isDownload =
              anchor.hasAttribute('download') ||
              /\.(pdf|zip|tar|gz|rar|7z|csv|xlsx?|docx?|pptx?|mp3|mp4|wav|dmg|exe|apk)$/i.test(
                anchor.pathname || href
              );

            if (isDownload && currentConfig?.trackDownloads !== false) {
              MeowAnalytics.trackDownload(href);
            } else if (
              anchor.hostname &&
              anchor.hostname !== currentHost &&
              currentConfig?.trackOutboundClicks !== false
            ) {
              MeowAnalytics.trackOutboundClick(href);
            }
          } catch {}
        };
        document.addEventListener('click', clickListener, { capture: true, passive: true });
      }

      // Automatic Frontend Error Tracking (uncaught exceptions & unhandled promises)
      if (typeof window !== 'undefined' && currentConfig?.trackErrors !== false) {
        errorHandler = (event: ErrorEvent) => {
          try {
            const err = event.error || event.message || 'Uncaught Exception';
            MeowAnalytics.trackError(err);
          } catch {}
        };
        window.addEventListener('error', errorHandler);

        rejectionHandler = (event: PromiseRejectionEvent) => {
          try {
            const reason = event.reason || 'Unhandled Promise Rejection';
            MeowAnalytics.trackError(reason);
          } catch {}
        };
        window.addEventListener('unhandledrejection', rejectionHandler);
      }
    } catch {
      // Fail silently: never break host website
    }
  },

  /**
   * Starts the 60-second live heartbeat timer and page visibility listeners.
   */
  startHeartbeat(): void {
    try {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      const intervalMs = currentConfig?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

      heartbeatTimer = setInterval(() => {
        try {
          if (!isInitialized || !isEnabled || !eventQueue) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            return; // Pause pings when tab is hidden
          }
          MeowAnalytics.ping();
        } catch {}
      }, intervalMs);

      // Handle visibility changes
      if (typeof document !== 'undefined' && !visibilityHandler) {
        visibilityHandler = () => {
          try {
            if (document.visibilityState === 'visible') {
              getOrCreateSessionId(); // Refresh session activity
              MeowAnalytics.ping();
            } else if (document.visibilityState === 'hidden') {
              MeowAnalytics.flush(true);
            }
          } catch {}
        };
        document.addEventListener('visibilitychange', visibilityHandler);
      }
    } catch {}
  },

  /**
   * Send a lightweight heartbeat ping event (updates session and live status, not page views).
   */
  ping(): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue) return;

      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const visitorId = getOrCreateVisitorId();
      const sessionId = getOrCreateSessionId();

      const event: MeowEvent = {
        eventId: generateUUID(),
        type: 'ping',
        timestamp: Date.now(),
        path: sanitizePath(),
        hostname,
        referrer: '',
        visitorId,
        sessionId,
      };

      eventQueue.enqueue(event);
    } catch {}
  },

  /**
   * Track a custom event with optional properties.
   * Example: meowAnalytics.track("Play Movie", { movieId: "123", category: "action" })
   */
  track(eventName: string, properties?: Record<string, any>): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const referrer = typeof document !== 'undefined' ? document.referrer : '';
      const visitorId = getOrCreateVisitorId();
      const sessionId = getOrCreateSessionId();
      const cleanProps = sanitizeClientProperties(properties);

      const event: MeowEvent = {
        eventId: generateUUID(),
        type: eventName === 'page_view' || eventName === 'ping' ? eventName : 'custom',
        eventName: (eventName || 'custom').slice(0, 128),
        properties: cleanProps,
        timestamp: Date.now(),
        path: sanitizePath(),
        hostname,
        referrer,
        visitorId,
        sessionId,
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Track a file download.
   * Example: meowAnalytics.trackDownload("/reports/q3_data.pdf")
   */
  trackDownload(filenameOrUrl: string, properties?: Record<string, any>): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      let filename = filenameOrUrl;
      let extension = '';
      try {
        const clean = filenameOrUrl.split('?')[0]?.split('#')[0] || filenameOrUrl;
        const parts = clean.split('/');
        filename = parts[parts.length - 1] || filenameOrUrl;
        const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
        if (extMatch) {
          extension = extMatch[1]!.toLowerCase();
        }
      } catch {}

      const cleanProps = sanitizeClientProperties(properties);
      const downloadProps = {
        filename: filename.slice(0, 255),
        extension: extension.slice(0, 32),
        path: sanitizePath(),
        ...cleanProps,
      };

      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const event: MeowEvent = {
        eventId: generateUUID(),
        type: 'download',
        eventName: 'download',
        properties: downloadProps,
        timestamp: Date.now(),
        path: sanitizePath(),
        hostname,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Track an outbound external link click.
   * Example: meowAnalytics.trackOutboundClick("https://github.com/project")
   */
  trackOutboundClick(url: string, properties?: Record<string, any>): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      let destHostname = url;
      try {
        const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        destHostname = parsed.hostname;
      } catch {}

      const cleanProps = sanitizeClientProperties(properties);
      const outboundProps = {
        destination: destHostname.slice(0, 255),
        path: sanitizePath(),
        ...cleanProps,
      };

      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const event: MeowEvent = {
        eventId: generateUUID(),
        type: 'outbound_click',
        eventName: 'outbound_click',
        properties: outboundProps,
        timestamp: Date.now(),
        path: sanitizePath(),
        hostname,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Track a frontend error (uncaught exception or unhandled promise rejection).
   */
  trackError(error: Error | string | any, properties?: Record<string, any>): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      let errorType = 'Error';
      let message = 'Unknown error';

      if (error instanceof Error) {
        errorType = error.name || 'Error';
        message = error.message || 'Unknown error';
      } else if (typeof error === 'string') {
        message = error;
      } else if (error && typeof error === 'object') {
        errorType = error.name || 'Error';
        message = error.message || String(error);
      }

      // Sanitize error message: strip query params from URLs
      let sanitizedMessage = message.trim();
      sanitizedMessage = sanitizedMessage.replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?/gi, (u) => {
        return u.split('?')[0] || u;
      });
      sanitizedMessage = sanitizedMessage.slice(0, 512);

      const cleanProps = sanitizeClientProperties(properties);
      const errorProps = {
        errorType: errorType.slice(0, 64),
        message: sanitizedMessage,
        path: sanitizePath(),
        ...cleanProps,
      };

      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const event: MeowEvent = {
        eventId: generateUUID(),
        type: 'error',
        eventName: 'error',
        properties: errorProps,
        timestamp: Date.now(),
        path: sanitizePath(),
        hostname,
        referrer: '',
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Track a 404 Not Found page error.
   */
  track404(path?: string, properties?: Record<string, any>): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      const cleanPath = sanitizePath(path);
      const cleanProps = sanitizeClientProperties(properties);
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

      const event: MeowEvent = {
        eventId: generateUUID(),
        type: '404',
        eventName: '404',
        properties: { path: cleanPath, ...cleanProps },
        timestamp: Date.now(),
        path: cleanPath,
        hostname,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Track a session_start event (Section 8).
   * Example: meowAnalytics.trackSessionStart()
   */
  trackSessionStart(properties?: Record<string, any>): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const cleanProps = sanitizeClientProperties(properties);
      const event: MeowEvent = {
        eventId: generateUUID(),
        type: 'session_start',
        eventName: 'session_start',
        properties: cleanProps,
        timestamp: Date.now(),
        path: sanitizePath(),
        hostname,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Track a page view event.
   */
  pageView(path?: string, referrer?: string): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      const cleanPath = sanitizePath(path);
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const ref = referrer ?? (typeof document !== 'undefined' ? document.referrer : '');
      const visitorId = getOrCreateVisitorId();
      const sessionId = getOrCreateSessionId();

      const utm = extractBrowserUtm();
      const ctx = getBrowserContext();

      const event: MeowEvent = {
        eventId: generateUUID(),
        type: 'page_view',
        timestamp: Date.now(),
        path: cleanPath,
        hostname,
        referrer: ref,
        visitorId,
        sessionId,
        ...utm,
        ...ctx,
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Track web performance metrics (LCP, INP, CLS, FCP, TTFB, Navigation Timing).
   */
  trackPerformance(metrics?: Partial<PerformanceMetricData>): void {
    try {
      if (!isInitialized || !isEnabled || !eventQueue || !currentConfig) {
        return;
      }

      const currentPath = sanitizePath(metrics?.path);
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const sampleRate = metrics?.sampleRate ?? currentConfig.performanceSampleRate ?? 1.0;

      const event: MeowEvent = {
        eventId: generateUUID(),
        type: 'performance',
        eventName: 'performance',
        properties: {
          ...metrics,
          path: currentPath,
          sampleRate,
        },
        timestamp: metrics?.timestamp || Date.now(),
        path: currentPath,
        hostname,
        referrer: typeof document !== 'undefined' ? document.referrer : '',
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
      };

      eventQueue.enqueue(event);
    } catch {
      // Fail silently
    }
  },

  /**
   * Immediately flush collected performance metrics.
   */
  flushPerformance(): void {
    try {
      perfController?.flush();
    } catch {
      // Fail silently
    }
  },

  /**
   * Get current in-memory performance metrics snapshot.
   */
  getPerformanceMetrics(): PerformanceMetricData | null {
    try {
      return perfController ? perfController.getData() : null;
    } catch {
      return null;
    }
  },

  /**
   * Flush pending events immediately.
   */
  async flush(useBeacon = false): Promise<void> {
    try {
      if (eventQueue) {
        await eventQueue.flush(useBeacon);
      }
    } catch {
      // Fail silently
    }
  },

  /**
   * Enable event collection (e.g. after consent granted).
   */
  enable(): void {
    isEnabled = true;
  },

  /**
   * Disable event collection (e.g. consent denied).
   */
  disable(): void {
    isEnabled = false;
  },

  /**
   * Check if currently initialized.
   */
  isInitialized(): boolean {
    return isInitialized;
  },

  /**
   * Returns the current visitor ID.
   */
  getVisitorId(): string {
    return getOrCreateVisitorId();
  },

  /**
   * Returns the current session ID.
   */
  getSessionId(): string {
    return getOrCreateSessionId();
  },

  /**
   * Resets the active session and creates a new session ID.
   */
  resetSession(): string {
    return resetSession();
  },

  /**
   * Destroy and clean up listeners/timers.
   */
  destroy(): void {
    try {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
      }
      if (clickListener && typeof document !== 'undefined') {
        document.removeEventListener('click', clickListener, { capture: true });
        clickListener = null;
      }
      if (errorHandler && typeof window !== 'undefined') {
        window.removeEventListener('error', errorHandler);
        errorHandler = null;
      }
      if (rejectionHandler && typeof window !== 'undefined') {
        window.removeEventListener('unhandledrejection', rejectionHandler);
        rejectionHandler = null;
      }
      if (router) {
        router.stop();
        router = null;
      }
      if (perfController) {
        perfController.destroy();
        perfController = null;
      }
      if (eventQueue) {
        eventQueue.destroy();
        eventQueue = null;
      }
      currentConfig = null;
      isInitialized = false;
    } catch {
      // Fail silently
    }
  },
};

// --- Automatic Script Tag Installation ---
// Support: <script defer src=".../meow.js" data-site-id="SITE_ID"></script>

function autoInitFromScriptTag(): void {
  try {
    if (typeof document === 'undefined') return;

    let scriptEl = document.currentScript as HTMLScriptElement | null;
    if (!scriptEl || !scriptEl.getAttribute('data-site-id')) {
      scriptEl = document.querySelector('script[data-site-id]');
    }

    if (!scriptEl) return;

    const siteId = scriptEl.getAttribute('data-site-id');
    if (!siteId) return;

    let host = scriptEl.getAttribute('data-host') || '';
    if (!host && scriptEl.src) {
      try {
        const url = new URL(scriptEl.src);
        host = url.origin;
      } catch {}
    }

    const autoTrack = scriptEl.getAttribute('data-auto-track') !== 'false';
    const debug = scriptEl.getAttribute('data-debug') === 'true';

    MeowAnalytics.init({
      siteId,
      host,
      autoTrack,
      debug,
    });
  } catch {
    // Fail silently: never break host website
  }
}

// Attach to window object for direct script tag usage
if (typeof window !== 'undefined') {
  (window as any).MeowAnalytics = MeowAnalytics;
  (window as any).meowAnalytics = MeowAnalytics;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitFromScriptTag, { once: true });
  } else {
    autoInitFromScriptTag();
  }
}

export const meowAnalytics = MeowAnalytics;
export default MeowAnalytics;
