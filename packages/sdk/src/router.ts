export type NavigationCallback = (path: string, previousPath: string | null) => void;

export interface SPARouter {
  start: () => void;
  stop: () => void;
  getCurrentPath: () => string;
}

export function createSPARouter(onNavigate: NavigationCallback): SPARouter {
  let lastPath: string | null = null;
  let originalPushState: typeof history.pushState | null = null;
  let originalReplaceState: typeof history.replaceState | null = null;
  let isListening = false;

  function normalizePath(rawPath?: string): string {
    try {
      const source = rawPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
      const withoutQuery = source.split('?')[0] ?? '';
      const clean = (withoutQuery.split('#')[0] ?? '').trim();
      return clean.startsWith('/') ? clean : `/${clean}`;
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
