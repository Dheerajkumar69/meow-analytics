/**
 * In-Memory LRU/TTL Cache for Analytics Query Endpoints
 * Historical queries receive longer cache durations (up to 15-60 minutes).
 * Near real-time queries receive short durations (5-10 seconds).
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class AnalyticsCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxEntries: number;
  private hits = 0;
  private misses = 0;

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  public set<T>(key: string, data: T, ttlMs: number): void {
    if (ttlMs <= 0) return;

    // Evict oldest if reaching capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public delete(key: string): void {
    this.cache.delete(key);
  }

  public invalidateSite(siteId: string): void {
    for (const key of this.cache.keys()) {
      const parts = key.split('|');
      if (parts[1] === siteId || key.startsWith(`${siteId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }

  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

export const analyticsCache = new AnalyticsCache();

/**
 * Determine cache TTL based on whether the queried period is in the past.
 * Historical periods (> 1 hour ago) can be safely cached for longer (15 minutes).
 * Open-ended live queries return 0 (no cache) so live metric updates are immediate.
 */
export function getRecommendedCacheTtl(toDate?: Date | string | null): number {
  if (!toDate) {
    return 0; // Live open-ended queries: do not cache
  }

  const target = new Date(toDate).getTime();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  if (target <= oneHourAgo) {
    // Historical period: cache for 15 minutes
    return 15 * 60 * 1000;
  }

  // Active or recent window: short 5s TTL
  return 5 * 1000;
}

/**
 * Deterministically serialize query params into a stable cache key
 */
export function buildAnalyticsCacheKey(endpoint: string, siteId: string, params: Record<string, any>): string {
  const sortedKeys = Object.keys(params).sort();
  const parts: string[] = [endpoint, siteId];

  for (const k of sortedKeys) {
    const val = params[k];
    if (val !== undefined && val !== null) {
      if (typeof val === 'object') {
        parts.push(`${k}:${JSON.stringify(val)}`);
      } else {
        parts.push(`${k}:${val}`);
      }
    }
  }

  return parts.join('|');
}

export interface CachedProjectValidation {
  project: any;
  allowedDomains: string[];
}

class ProjectValidationCache {
  private cache = new Map<string, { data: CachedProjectValidation; expiresAt: number }>();
  private ttlMs: number;

  constructor(ttlMs = 30 * 1000) {
    this.ttlMs = ttlMs;
  }

  public get(siteId: string): CachedProjectValidation | null {
    const entry = this.cache.get(siteId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(siteId);
      return null;
    }
    return entry.data;
  }

  public set(siteId: string, data: CachedProjectValidation): void {
    this.cache.set(siteId, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  public invalidate(identifier?: string): void {
    if (!identifier) {
      this.cache.clear();
      return;
    }
    for (const [key, entry] of this.cache.entries()) {
      if (key === identifier || entry.data.project.id === identifier || entry.data.project.site_id === identifier) {
        this.cache.delete(key);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const projectValidationCache = new ProjectValidationCache();
