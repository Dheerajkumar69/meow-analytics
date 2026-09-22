import { PerformanceMetricData } from './types.js';

/**
 * Standards-based Web Performance & Core Web Vitals Collector.
 * Non-blocking, privacy-conscious, and robust against unsupported browser environments.
 */

export interface PerformanceObserverController {
  destroy: () => void;
  flush: () => void;
  getData: () => PerformanceMetricData;
  resetForRoute: (newPath: string) => void;
}

function detectDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  try {
    if (typeof navigator === 'undefined') return 'desktop';
    const ua = (navigator.userAgent || '').toLowerCase();

    // Check tablet patterns
    if (/(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk)/i.test(ua)) {
      return 'tablet';
    }

    // Check mobile patterns
    if (/(mobi|ipod|phone|blackberry|opera mini|fennec|minimo)/i.test(ua)) {
      return 'mobile';
    }

    // Screen size heuristic fallback
    if (typeof window !== 'undefined' && window.innerWidth) {
      if (window.innerWidth <= 767) return 'mobile';
      if (window.innerWidth <= 1024) return 'tablet';
    }

    return 'desktop';
  } catch {
    return 'desktop';
  }
}

/**
 * Initialize Web Performance monitoring.
 */
export function createPerformanceObserverController(options: {
  sampleRate?: number;
  getPath?: () => string;
  onReport: (metrics: PerformanceMetricData) => void;
}): PerformanceObserverController {
  const sampleRate = typeof options.sampleRate === 'number' ? Math.max(0, Math.min(1, options.sampleRate)) : 1.0;
  const isSampled = sampleRate < 1.0 ? Math.random() <= sampleRate : true;

  // If client is not sampled in, return no-op controller immediately
  if (!isSampled) {
    return {
      destroy: () => {},
      flush: () => {},
      getData: () => ({ sampleRate, path: options.getPath?.() || '/' }),
      resetForRoute: () => {},
    };
  }

  let currentPath = options.getPath?.() || (typeof window !== 'undefined' ? window.location.pathname : '/');
  let hasReportedInitial = false;
  let hasReportedFinal = false;

  // Metrics storage
  let lcpValue: number | null = null;
  let inpValue: number | null = null;
  let clsValue = 0;
  let fcpValue: number | null = null;
  let ttfbValue: number | null = null;

  // Navigation timings
  let dnsDuration: number | null = null;
  let connectionDuration: number | null = null;
  let requestDuration: number | null = null;
  let responseDuration: number | null = null;
  let domLoading: number | null = null;
  let pageLoad: number | null = null;

  // CLS Session Window tracking
  let clsSessionValue = 0;
  let clsSessionEntries: any[] = [];

  // Observers
  let lcpObserver: any = null;
  let inpObserver: any = null;
  let clsObserver: any = null;
  let paintObserver: any = null;

  // Event handlers
  let visibilityListener: (() => void) | null = null;
  let pagehideListener: (() => void) | null = null;
  let loadListener: (() => void) | null = null;
  let idleTimer: any = null;

  function collectNavigationTiming(): void {
    try {
      if (typeof performance === 'undefined') return;

      const navEntries = performance.getEntriesByType?.('navigation') as PerformanceNavigationTiming[];
      if (navEntries && navEntries.length > 0 && navEntries[0]) {
        const nav = navEntries[0];
        // TTFB: responseStart - startTime
        if (typeof nav.responseStart === 'number' && nav.responseStart > 0) {
          ttfbValue = Math.max(0, Number(nav.responseStart.toFixed(2)));
        }

        // DNS: domainLookupEnd - domainLookupStart
        if (typeof nav.domainLookupEnd === 'number' && typeof nav.domainLookupStart === 'number') {
          dnsDuration = Math.max(0, Number((nav.domainLookupEnd - nav.domainLookupStart).toFixed(2)));
        }

        // Connection: connectEnd - connectStart
        if (typeof nav.connectEnd === 'number' && typeof nav.connectStart === 'number') {
          connectionDuration = Math.max(0, Number((nav.connectEnd - nav.connectStart).toFixed(2)));
        }

        // Request: responseStart - requestStart
        if (typeof nav.responseStart === 'number' && typeof nav.requestStart === 'number') {
          requestDuration = Math.max(0, Number((nav.responseStart - nav.requestStart).toFixed(2)));
        }

        // Response: responseEnd - responseStart
        if (typeof nav.responseEnd === 'number' && typeof nav.responseStart === 'number') {
          responseDuration = Math.max(0, Number((nav.responseEnd - nav.responseStart).toFixed(2)));
        }

        // DOM loading: domContentLoadedEventEnd - responseEnd
        if (typeof nav.domContentLoadedEventEnd === 'number' && typeof nav.responseEnd === 'number' && nav.domContentLoadedEventEnd > 0) {
          domLoading = Math.max(0, Number((nav.domContentLoadedEventEnd - nav.responseEnd).toFixed(2)));
        }

        // Page load: loadEventEnd - startTime
        if (typeof nav.loadEventEnd === 'number' && nav.loadEventEnd > 0) {
          pageLoad = Math.max(0, Number((nav.loadEventEnd - (nav.startTime || 0)).toFixed(2)));
        }
      } else if (performance.timing) {
        // Fallback to legacy PerformanceTiming
        const t = performance.timing;
        if (t.responseStart && t.navigationStart) {
          ttfbValue = Math.max(0, t.responseStart - t.navigationStart);
        }
        if (t.domainLookupEnd && t.domainLookupStart) {
          dnsDuration = Math.max(0, t.domainLookupEnd - t.domainLookupStart);
        }
        if (t.connectEnd && t.connectStart) {
          connectionDuration = Math.max(0, t.connectEnd - t.connectStart);
        }
        if (t.responseStart && t.requestStart) {
          requestDuration = Math.max(0, t.responseStart - t.requestStart);
        }
        if (t.responseEnd && t.responseStart) {
          responseDuration = Math.max(0, t.responseEnd - t.responseStart);
        }
        if (t.domContentLoadedEventEnd && t.responseEnd) {
          domLoading = Math.max(0, t.domContentLoadedEventEnd - t.responseEnd);
        }
        if (t.loadEventEnd && t.navigationStart && t.loadEventEnd > 0) {
          pageLoad = Math.max(0, t.loadEventEnd - t.navigationStart);
        }
      }
    } catch {
      // Fail silently
    }
  }

  function setupPerformanceObservers(): void {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return;
    }

    const supportedTypes: string[] = (PerformanceObserver as any).supportedEntryTypes || [];

    // 1. First Contentful Paint (FCP)
    try {
      if (supportedTypes.length === 0 || supportedTypes.includes('paint')) {
        paintObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              fcpValue = Number(entry.startTime.toFixed(2));
            }
          }
        });
        paintObserver.observe({ type: 'paint', buffered: true });
      }
    } catch {
      // Paint timing not supported
    }

    // 2. Largest Contentful Paint (LCP)
    try {
      if (supportedTypes.length === 0 || supportedTypes.includes('largest-contentful-paint')) {
        lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            lcpValue = Number(lastEntry.startTime.toFixed(2));
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      }
    } catch {
      // LCP not supported
    }

    // 3. Cumulative Layout Shift (CLS)
    // CRITICAL: Do NOT count shifts where entry.hadRecentInput is true!
    try {
      if (supportedTypes.length === 0 || supportedTypes.includes('layout-shift')) {
        clsObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries() as any[]) {
            if (!entry.hadRecentInput) {
              const firstSessionEntry = clsSessionEntries[0];
              const lastSessionEntry = clsSessionEntries[clsSessionEntries.length - 1];

              // Max session window: 5000ms, gap: 1000ms
              if (
                clsSessionValue &&
                entry.startTime - lastSessionEntry.startTime < 1000 &&
                entry.startTime - firstSessionEntry.startTime < 5000
              ) {
                clsSessionValue += entry.value;
                clsSessionEntries.push(entry);
              } else {
                clsSessionValue = entry.value;
                clsSessionEntries = [entry];
              }

              if (clsSessionValue > clsValue) {
                clsValue = Number(clsSessionValue.toFixed(4));
              }
            }
          }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      }
    } catch {
      // CLS not supported
    }

    // 4. Interaction to Next Paint (INP)
    try {
      if (supportedTypes.includes('event')) {
        let maxInteractionDuration = 0;
        inpObserver = new PerformanceObserver((entryList) => {
          for (const entry of entryList.getEntries() as any[]) {
            if (entry.interactionId && entry.duration) {
              if (entry.duration > maxInteractionDuration) {
                maxInteractionDuration = entry.duration;
                inpValue = Number(maxInteractionDuration.toFixed(2));
              }
            }
          }
        });
        inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 } as any);
      }
    } catch {
      // INP event timing not supported
    }
  }

  function getMetricsSnapshot(): PerformanceMetricData {
    collectNavigationTiming();
    return {
      path: currentPath,
      timestamp: Date.now(),
      device: detectDeviceType(),
      lcp: lcpValue !== null ? lcpValue : undefined,
      inp: inpValue !== null ? inpValue : undefined,
      cls: clsValue > 0 ? clsValue : 0,
      fcp: fcpValue !== null ? fcpValue : undefined,
      ttfb: ttfbValue !== null ? ttfbValue : undefined,
      dns: dnsDuration !== null ? dnsDuration : undefined,
      connection: connectionDuration !== null ? connectionDuration : undefined,
      request: requestDuration !== null ? requestDuration : undefined,
      response: responseDuration !== null ? responseDuration : undefined,
      domLoading: domLoading !== null ? domLoading : undefined,
      pageLoad: pageLoad !== null ? pageLoad : undefined,
      sampleRate,
    };
  }

  function dispatchReport(isFinal = false): void {
    try {
      const data = getMetricsSnapshot();

      // Only dispatch if we have at least one useful metric
      const hasAnyMetric =
        data.lcp !== undefined ||
        data.fcp !== undefined ||
        data.ttfb !== undefined ||
        data.inp !== undefined ||
        (typeof data.cls === 'number' && data.cls > 0) ||
        data.pageLoad !== undefined;

      if (hasAnyMetric) {
        options.onReport(data);
        if (isFinal) {
          hasReportedFinal = true;
        } else {
          hasReportedInitial = true;
        }
      }
    } catch {
      // Non-blocking fail-safe
    }
  }

  // Initialize observers safely without blocking rendering
  try {
    setupPerformanceObservers();

    // Schedule non-blocking initial report
    const scheduleInitial = () => {
      collectNavigationTiming();
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => dispatchReport(false), { timeout: 3000 });
      } else {
        idleTimer = setTimeout(() => dispatchReport(false), 2000);
      }
    };

    if (typeof document !== 'undefined') {
      if (document.readyState === 'complete') {
        scheduleInitial();
      } else if (typeof window !== 'undefined') {
        loadListener = () => {
          setTimeout(scheduleInitial, 500);
        };
        window.addEventListener('load', loadListener, { once: true });
      }
    }

    // Flush/finalize on page visibility change to hidden or pagehide
    if (typeof document !== 'undefined') {
      visibilityListener = () => {
        if (document.visibilityState === 'hidden' && !hasReportedFinal) {
          dispatchReport(true);
        }
      };
      document.addEventListener('visibilitychange', visibilityListener);
    }

    if (typeof window !== 'undefined') {
      pagehideListener = () => {
        if (!hasReportedFinal) {
          dispatchReport(true);
        }
      };
      window.addEventListener('pagehide', pagehideListener);
    }
  } catch {
    // Non-blocking fail-safe
  }

  return {
    destroy: () => {
      try {
        if (idleTimer) clearTimeout(idleTimer);
        if (lcpObserver) lcpObserver.disconnect();
        if (inpObserver) inpObserver.disconnect();
        if (clsObserver) clsObserver.disconnect();
        if (paintObserver) paintObserver.disconnect();

        if (visibilityListener && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', visibilityListener);
        }
        if (pagehideListener && typeof window !== 'undefined') {
          window.removeEventListener('pagehide', pagehideListener);
        }
        if (loadListener && typeof window !== 'undefined') {
          window.removeEventListener('load', loadListener);
        }
      } catch {}
    },
    flush: () => {
      dispatchReport(true);
    },
    getData: () => getMetricsSnapshot(),
    resetForRoute: (newPath: string) => {
      // Dispatch final report for previous path before reset
      if (hasReportedInitial && !hasReportedFinal) {
        dispatchReport(true);
      }
      currentPath = newPath;
      hasReportedInitial = false;
      hasReportedFinal = false;
      lcpValue = null;
      inpValue = null;
      clsValue = 0;
      clsSessionValue = 0;
      clsSessionEntries = [];
    },
  };
}
