/**
 * @meow-analytics/react
 *
 * React integration for Meow Analytics. Provides:
 * - <MeowAnalyticsProvider siteId="SITE_ID" /> declarative init component
 * - useMeowAnalytics() hook for programmatic access
 *
 * Usage:
 *   import { MeowAnalyticsProvider } from '@meow-analytics/react';
 *   <MeowAnalyticsProvider siteId="your-site-id" host="https://your-analytics.example.com" />
 */

import React, { useEffect, useRef, useContext, createContext } from 'react';
import { MeowAnalytics as SDK } from '@meow-analytics/sdk';
import type { MeowConfig } from '@meow-analytics/sdk';

// --- Context ---
const MeowContext = createContext<typeof SDK | null>(null);

// --- Hook ---
/**
 * useMeowAnalytics returns the Meow Analytics SDK instance.
 * Must be used within a <MeowAnalyticsProvider> or as a descendant of <MeowAnalytics>.
 */
export function useMeowAnalytics(): typeof SDK {
  const ctx = useContext(MeowContext);
  if (!ctx) {
    // Return the global instance as a fallback so the hook works without a Provider
    return SDK;
  }
  return ctx;
}

// --- Component props ---
export interface MeowAnalyticsProviderProps extends Partial<MeowConfig> {
  /** The unique site ID for this project (required) */
  siteId: string;
  /**
   * Base URL of the Meow Analytics API server.
   * e.g. "https://analytics.yourdomain.com"
   * Maps to the SDK's `host` option. Required for cross-origin deployments.
   */
  host?: string;
  /** Children will have access to the analytics instance via useMeowAnalytics() */
  children?: React.ReactNode;
}

/**
 * <MeowAnalyticsProvider siteId="your-id" host="https://analytics.yourdomain.com" />
 *
 * Drop this component at the root of your app to initialize Meow Analytics.
 * Automatically handles initialization on mount and cleanup on unmount.
 * Also tracks SPA route changes when inside a React Router / Next.js app.
 *
 * IMPORTANT: `host` must point to your Meow Analytics API server, not the
 * site being tracked. Without it, events are sent to the tracked site itself.
 */
export const MeowAnalyticsProvider: React.FC<MeowAnalyticsProviderProps> = ({
  siteId,
  host,
  children,
  ...restConfig
}) => {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const config: MeowConfig = {
      siteId,
      ...(host ? { host } : {}),
      ...restConfig,
    };

    if (!host && process.env.NODE_ENV !== 'production') {
      console.warn(
        '[MeowAnalytics] No `host` prop provided. Events will be sent to the current origin ' +
        '(the tracked site itself) instead of your Meow Analytics API server. ' +
        'Pass host="https://your-analytics-api.com" to fix this.'
      );
    }

    try {
      SDK.init(config);
    } catch (err) {
      // Never crash the host app
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[MeowAnalytics] Initialization error:', err);
      }
    }

    return () => {
      try {
        SDK.destroy();
        initialized.current = false;
      } catch {
        // Fail silently
      }
    };
    // Config changes are intentionally not in deps — the SDK is initialized once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (children) {
    return <MeowContext.Provider value={SDK}>{children}</MeowContext.Provider>;
  }

  // No children: render nothing (analytics-only component)
  return null;
};

/**
 * Legacy alias — kept for backwards compatibility.
 * @deprecated Use <MeowAnalyticsProvider> instead.
 */
export const MeowAnalytics = MeowAnalyticsProvider;

// --- Named re-exports for convenience ---
export { SDK as meowAnalytics };
export type { MeowConfig };
// Legacy type alias
export type { MeowConfig as MeowAnalyticsConfig };
