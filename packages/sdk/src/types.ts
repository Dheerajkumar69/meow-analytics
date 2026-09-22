export interface MeowConfig {
  /**
   * Unique site identifier for Meow Analytics project.
   */
  siteId: string;

  /**
   * Collector URL or origin (e.g. "https://analytics.example.com" or "http://localhost:3001").
   * Defaults to the current window location or script source origin.
   */
  host?: string;

  /**
   * Ingestion endpoint path. Defaults to "/api/v1/collect".
   */
  endpoint?: string;

  /**
   * Number of events to buffer before triggering an immediate flush. Defaults to 10.
   */
  batchSize?: number;

  /**
   * Maximum interval in milliseconds before buffered events are dispatched. Defaults to 5000ms.
   */
  flushIntervalMs?: number;

  /**
   * Strict maximum queue size for in-memory and offline local storage. Defaults to 50.
   */
  maxQueueSize?: number;

  /**
   * Whether to automatically track initial page view and SPA route changes. Defaults to true.
   */
  autoTrack?: boolean;

  /**
   * Enable verbose console logging for debugging. Defaults to false.
   */
  debug?: boolean;

  /**
   * Inactivity timeout in milliseconds before a new session is started.
   * Defaults to 1800000 (30 minutes).
   */
  sessionTimeoutMs?: number;

  /**
   * Heartbeat ping interval in milliseconds.
   * Defaults to 60000 (60 seconds).
   */
  heartbeatIntervalMs?: number;

  /**
   * Whether to send lightweight periodic heartbeats for live visitor tracking.
   * Defaults to true.
   */
  heartbeatEnabled?: boolean;

  /**
   * Preferred client-side storage mechanism.
   * Defaults to 'localStorage'.
   */
  storageType?: 'localStorage' | 'sessionStorage' | 'cookie' | 'memory';

  /**
   * Whether to automatically track outbound external link clicks.
   * Defaults to true.
   */
  trackOutboundClicks?: boolean;

  /**
   * Whether to automatically track file downloads.
   * Defaults to true.
   */
  trackDownloads?: boolean;

  /**
   * Whether to automatically capture uncaught exceptions and unhandled promise rejections.
   * Defaults to true.
   */
  trackErrors?: boolean;

  /**
   * Whether to automatically track 404 error page visits.
   * Defaults to false.
   */
  track404?: boolean;

  /**
   * Whether to automatically track session start events when a new session begins.
   * Defaults to false.
   */
  trackSessionStart?: boolean;

  /**
   * Whether to automatically collect web performance and Core Web Vitals (LCP, INP, CLS, FCP, TTFB).
   * Defaults to true.
   */
  trackPerformance?: boolean;

  /**
   * Performance sampling rate between 0.0 and 1.0 (e.g. 1.0 = 100%, 0.1 = 10%).
   * Defaults to 1.0.
   */
  performanceSampleRate?: number;
}

export interface PerformanceMetricData {
  path?: string;
  timestamp?: number;
  device?: 'desktop' | 'mobile' | 'tablet';
  // Core Web Vitals
  lcp?: number | null;
  inp?: number | null;
  cls?: number | null;
  fcp?: number | null;
  ttfb?: number | null;
  // Navigation Timing
  dns?: number | null;
  connection?: number | null;
  request?: number | null;
  response?: number | null;
  domLoading?: number | null;
  pageLoad?: number | null;
  sampleRate?: number;
}

export interface MeowEvent {
  eventId: string;
  type: string;
  eventName?: string;
  properties?: Record<string, any>;
  timestamp: number;
  path: string;
  hostname: string;
  referrer: string;
  visitorId?: string;
  sessionId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  language?: string;
  timezone?: string;
}

export interface BatchPayload {
  siteId: string;
  events: MeowEvent[];
}

