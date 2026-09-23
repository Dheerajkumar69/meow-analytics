export type NavigationCallback = (path: string, previousPath: string | null) => void;

export interface SPARouterOptions {
  /**
   * If true, the hash fragment (e.g. #/about) is included in the tracked path.
   * Set this to true for hash-based SPA frameworks (e.g. React Router with HashRouter,
   * Vue Router in hash mode). Default: false (hash is stripped, only pathname is tracked).
   */
  trackHashRoutes?: boolean;
}

export interface SPARouter {
  start: () => void;
  stop: () => void;
  getCurrentPath: () => string;
}

export function createSPARouter(onNavigate: NavigationCallback, options: SPARouterOptions = {}): SPARouter {
  let lastPath: string | null = null;
  let originalPushState: typeof history.pushState | null = null;
  let originalReplaceState: typeof history.replaceState | null = null;
  let isListening = false;

  // BUG-11 FIX: normalizePath now optionally preserves the hash so hash-based
  // SPA routers (/#/page) are tracked correctly. Previously, the hash was always
  // stripped, leaving hash-only routes as '/' and never triggering page views.
  function normalizePath(rawPath?: string): string {
    try {
      const source = rawPath ?? (typeof window !== 'undefined' ? window.location.href : '/');
      if (options.trackHashRoutes) {
        // For hash-based SPAs: use the hash portion as the "path"
        // e.g. http://app.com/#/about → /about
        // e.g. http://app.com/#!/users/1 → !/users/1 → /users/1
        const hashIdx = source.indexOf('#');
        if (hashIdx !== -1) {
          const hashPart = source.slice(hashIdx + 1) || '/';
          const clean = (hashPart.split('?')[0] ?? '').trim();
          return clean.startsWith('/') ? clean : `/${clean}`;
        }
        // Fall through to pathname if no hash present
      }
      // Standard pathname-based tracking (strip hash and query)
      const withoutHash = source.split('#')[0] ?? '';
      const withoutQuery = withoutHash.split('?')[0] ?? '';
      const clean = withoutQuery.trim();
      // Extract just the pathname portion
      try {
        const url = new URL(clean, 'http://x');
        return url.pathname || '/';
      } catch {
        return clean.startsWith('/') ? clean : `/${clean}`;
      }
    } catch {
      return '/';
    }
  }


  function handleNavigation(): void {
    try {
      if (typeof window === 'undefined') return;

      const currentPath = normalizePath();
      if (currentPath === lastPath) {
        // Prevent duplicate page view
        return;
      }

      const prev = lastPath;
      lastPath = currentPath;
      onNavigate(currentPath, prev);
    } catch {
      // Fail silently: never disrupt host application navigation
    }
  }

  function start(): void {
    if (isListening || typeof window === 'undefined') return;
    isListening = true;

    try {
      // Record initial path
      lastPath = normalizePath();

      const hist = window.history || (typeof history !== 'undefined' ? history : null);

      // Intercept history.pushState
      if (hist && hist.pushState) {
        originalPushState = hist.pushState;
        hist.pushState = function (this: History, ...args: Parameters<typeof history.pushState>) {
          try {
            originalPushState?.apply(this, args);
          } catch (err) {
            // In case original pushState threw, rethrow to preserve browser behavior
            throw err;
          } finally {
            handleNavigation();
          }
        };
      }

      // Intercept history.replaceState
      if (hist && hist.replaceState) {
        originalReplaceState = hist.replaceState;
        hist.replaceState = function (this: History, ...args: Parameters<typeof history.replaceState>) {
          try {
            originalReplaceState?.apply(this, args);
          } catch (err) {
            throw err;
          } finally {
            handleNavigation();
          }
        };
      }

      // Listen to popstate (back / forward navigation)
      window.addEventListener('popstate', handleNavigation, { passive: true });

      // Listen to hashchange
      window.addEventListener('hashchange', handleNavigation, { passive: true });
    } catch {
      // Fail silently
    }
  }

  function stop(): void {
    if (!isListening || typeof window === 'undefined') return;
    isListening = false;

    try {
      const hist = window.history || (typeof history !== 'undefined' ? history : null);
      if (hist) {
        if (originalPushState) {
          hist.pushState = originalPushState;
          originalPushState = null;
        }
        if (originalReplaceState) {
          hist.replaceState = originalReplaceState;
          originalReplaceState = null;
        }
      }
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('hashchange', handleNavigation);
      lastPath = null;
    } catch {
      // Fail silently
    }
  }

  return {
    start,
    stop,
    getCurrentPath: () => normalizePath(),
  };
}
