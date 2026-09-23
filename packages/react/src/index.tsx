/**
 * @meow-analytics/react
 * BUG-21 FIX: This package was missing from the monorepo.
 *
 * React integration for Meow Analytics. Provides:
 * - <MeowAnalytics siteId="SITE_ID" /> declarative init component
 * - useMeowAnalytics() hook for programmatic access
 *
 * Usage:
 *   import { MeowAnalytics } from '@meow-analytics/react';
 *   <MeowAnalytics siteId="your-site-id" apiUrl="https://your-analytics.example.com" />
 */

import React, { useEffect, useRef, useContext, createContext } from 'react';
import { MeowAnalytics as SDK } from '@meow-analytics/sdk';
import type { MeowAnalyticsConfig } from '@meow-analytics/sdk';

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
export interface MeowAnalyticsProps extends Partial<MeowAnalyticsConfig> {
  /** The unique site ID for this project (required) */
  siteId: string;
  /** Base URL of the Meow Analytics API server */
  apiUrl?: string;
  /** Children will have access to the analytics instance via useMeowAnalytics() */
  children?: React.ReactNode;
}

/**
 * <MeowAnalytics siteId="your-id" />
 *
 * Drop this component at the root of your app to initialize Meow Analytics.
 * Automatically handles initialization on mount and cleanup on unmount.
 * Also tracks SPA route changes when inside a React Router / Next.js app.
 */
export const MeowAnalytics: React.FC<MeowAnalyticsProps> = ({
  siteId,
  apiUrl,
  children,
  ...restConfig
}) => {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const config: MeowAnalyticsConfig = {
      siteId,
      ...(apiUrl ? { apiUrl } : {}),
      ...restConfig,
    };

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

// --- Named re-exports for convenience ---
export { SDK as meowAnalytics };
export type { MeowAnalyticsConfig };
