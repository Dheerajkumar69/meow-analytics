import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase, projects } from '@meow-analytics/database';
import {
  analyticsQuerySchema,
  liveAnalyticsQuerySchema,
  drilldownQuerySchema,
  timeseriesQuerySchema,
  pagesQuerySchema,
  breakdownQuerySchema,
  eventsQuerySchema,
  eventDetailQuerySchema,
  eventPropertiesQuerySchema,
  errorsQuerySchema,
  errorDetailQuerySchema,
  isSensitiveKey,
  performanceQuerySchema,
  classifyMetric,
} from '@meow-analytics/shared';
import { sql, eq } from 'drizzle-orm';
import {
  buildPageViewsFilterSql,
  buildSessionsFilterSql,
  buildEventsFilterSql,
  buildPerformanceFilterSql,
} from '../lib/filters.js';
import { requireAnalyticsAuth } from '../plugins/auth.js';
import { analyticsCache, getRecommendedCacheTtl, buildAnalyticsCacheKey } from '../lib/cache.js';

const LIMITATION_NOTE =
  'Estimated Unique Visitors represents estimated browser and device identifiers, not exact physical people. Single physical people using multiple devices, private browsing, VPNs, or blocked cookies are counted separately.';

const BOUNCE_RATE_DEFINITION =
  'Sessions containing exactly one qualifying page view divided by total sessions';

/**
 * Calculate comparison time range for previous_period or previous_year.
 */
function calculateComparisonTimeRange(
  from: Date,
  to: Date,
  compare: 'none' | 'previous_period' | 'previous_year'
): { from: Date; to: Date } | null {
  if (compare === 'none' || !compare) return null;
  const durationMs = to.getTime() - from.getTime();
  if (compare === 'previous_period') {
    return {
      from: new Date(from.getTime() - durationMs),
      to: new Date(from.getTime()),
    };
  } else if (compare === 'previous_year') {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    return {
      from: new Date(from.getTime() - oneYearMs),
      to: new Date(to.getTime() - oneYearMs),
    };
  }
  return null;
}

/**
 * Safely compute percentage change avoiding division-by-zero.
 */
function calculateSafePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }
  const change = ((current - previous) / previous) * 100;
  return Number(change.toFixed(1));
}

export const analyticsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Enforce project-level authorization on analytics endpoints
  fastify.addHook('preHandler', requireAnalyticsAuth);

  const db = getDatabase();

  /**
   * Helper: Resolve project site_id from siteId or projectId
   */
  async function resolveSiteId(identifier: string): Promise<string | null> {
    const rows = await db
      .select({ site_id: projects.site_id })
      .from(projects)
      .where(sql`${projects.site_id} = ${identifier} OR ${projects.id} = ${identifier}`)
      .limit(1);

    return rows.length > 0 ? rows[0]!.site_id : null;
  }

  // --- Handlers for Analytics Endpoints ---

  const handleVisitors = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Check cache
    const cacheKey = buildAnalyticsCacheKey('visitors', siteId, request.query);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('X-Meow-Cache', 'HIT');
      return reply.send(cached);
    }

    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const sessionsFilter = buildSessionsFilterSql(filters);

    // 1. Unique visitors in period
    const uniqueRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS count
      FROM sessions
      WHERE site_id = ${siteId}
        AND started_at <= ${toDate}
        AND last_seen_at >= ${fromDate}
        ${botFilter}
        ${sessionsFilter}
    `);
    const uniqueVisitors = Number((uniqueRes.rows[0] as any)?.count || 0);

    // 2. New visitors
    const newRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS count
      FROM sessions
      WHERE site_id = ${siteId}
        AND is_returning = FALSE
        AND started_at >= ${fromDate}
        AND started_at <= ${toDate}
        ${botFilter}
        ${sessionsFilter}
    `);
    const newVisitors = Number((newRes.rows[0] as any)?.count || 0);

    // 3. Returning visitors
    const returningRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS count
      FROM sessions
      WHERE site_id = ${siteId}
        AND is_returning = TRUE
        AND started_at <= ${toDate}
        AND last_seen_at >= ${fromDate}
        ${botFilter}
        ${sessionsFilter}
    `);
    const returningVisitors = Number((returningRes.rows[0] as any)?.count || 0);

    const returningVisitorRate =
      uniqueVisitors > 0 ? Number(((returningVisitors / uniqueVisitors) * 100).toFixed(2)) : 0;

    // Recent visitors list
    const visitorsList = await db.execute(sql`
      SELECT id, site_id, anonymous_id, first_seen_at, last_seen_at, first_path, last_path, first_referrer, last_referrer, created_at
      FROM visitors
      WHERE site_id = ${siteId}
      ORDER BY last_seen_at DESC
      LIMIT 50
    `);

    const responsePayload = {
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      uniqueVisitors,
      estimatedUniqueVisitors: uniqueVisitors,
      newVisitors,
      returningVisitors,
      returningVisitorRate,
      visitors: visitorsList.rows,
      limitationNote: LIMITATION_NOTE,
    };

    analyticsCache.set(cacheKey, responsePayload, getRecommendedCacheTtl(toDate));
    reply.header('X-Meow-Cache', 'MISS');
    return reply.send(responsePayload);
  };

  const handleSessions = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Check cache
    const cacheKey = buildAnalyticsCacheKey('sessions', siteId, request.query);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('X-Meow-Cache', 'HIT');
      return reply.send(cached);
    }

    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const sessionsFilter = buildSessionsFilterSql(filters);

    // Aggregate sessions metrics
    const statsRes = await db.execute(sql`
      SELECT
        COUNT(*) AS total_sessions,
        COALESCE(SUM(page_views), 0) AS total_page_views,
        COALESCE(SUM(CASE WHEN is_bounce THEN 1 ELSE 0 END), 0) AS bounce_sessions,
        COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
      FROM sessions
      WHERE site_id = ${siteId}
        AND started_at <= ${toDate}
        AND last_seen_at >= ${fromDate}
        ${botFilter}
        ${sessionsFilter}
    `);

    const row = (statsRes.rows[0] as any) || {};
    const totalSessions = Number(row.total_sessions || 0);
    const totalPageViews = Number(row.total_page_views || 0);
    const bounceSessions = Number(row.bounce_sessions || 0);
    const totalDuration = Number(row.total_duration_seconds || 0);

    const bounceRate =
      totalSessions > 0 ? Number(((bounceSessions / totalSessions) * 100).toFixed(2)) : 0;
    const averageSessionDuration =
      totalSessions > 0 ? Number((totalDuration / totalSessions).toFixed(1)) : 0;
    const pagesPerSession =
      totalSessions > 0 ? Number((totalPageViews / totalSessions).toFixed(2)) : 0;

    const recentSessions = await db.execute(sql`
      SELECT id, session_id, site_id, visitor_id, started_at, last_seen_at, landing_page, exit_page, page_views, event_count, is_bounce, duration_seconds, is_returning,
             referrer_source, referrer_hostname, country_code, country_name, device_type, browser, os, is_bot, created_at
      FROM sessions
      WHERE site_id = ${siteId}
        ${botFilter}
        ${sessionsFilter}
      ORDER BY last_seen_at DESC
      LIMIT 50
    `);

    const responsePayload = {
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      sessions: totalSessions,
      pageViews: totalPageViews,
      bounceRate,
      bounceRateDefinition: BOUNCE_RATE_DEFINITION,
      averageSessionDuration,
      pagesPerSession,
      recentSessions: recentSessions.rows,
    };

    analyticsCache.set(cacheKey, responsePayload, getRecommendedCacheTtl(toDate));
    reply.header('X-Meow-Cache', 'MISS');
    return reply.send(responsePayload);
  };

  const handleLive = async (request: any, reply: any) => {
    const parseResult = liveAnalyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, windowMinutes } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const threshold = new Date(Date.now() - windowMinutes * 60 * 1000);

    const liveRes = await db.execute(sql`
      SELECT
        COUNT(DISTINCT visitor_id) AS live_visitors,
        COUNT(id) AS live_sessions
      FROM sessions
      WHERE site_id = ${siteId}
        AND last_seen_at >= ${threshold}
        AND is_bot = FALSE
    `);

    const liveRow = (liveRes.rows[0] as any) || {};
    const liveVisitors = Number(liveRow.live_visitors || 0);
    const liveSessions = Number(liveRow.live_sessions || 0);

    const pagesRes = await db.execute(sql`
      SELECT exit_page AS path, COUNT(DISTINCT visitor_id) AS visitors
      FROM sessions
      WHERE site_id = ${siteId}
        AND last_seen_at >= ${threshold}
        AND is_bot = FALSE
      GROUP BY exit_page
      ORDER BY visitors DESC
      LIMIT 10
    `);

    return reply.send({
      siteId,
      liveVisitors,
      liveSessions,
      activePages: pagesRes.rows.map((r: any) => ({
        path: r.path,
        visitors: Number(r.visitors || 0),
      })),
      windowMinutes,
      timestamp: new Date().toISOString(),
    });
  };

  const handleOverview = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, compare, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Check cache
    const cacheKey = buildAnalyticsCacheKey('overview', siteId, request.query);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('X-Meow-Cache', 'HIT');
      return reply.send(cached);
    }
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const sessionsFilter = buildSessionsFilterSql(filters);

    async function fetchOverviewMetrics(fDate: Date, tDate: Date) {
      // 1. Visitors metrics
      const uniqueRes = await db.execute(sql`
        SELECT COUNT(DISTINCT visitor_id) AS count
        FROM sessions
        WHERE site_id = ${siteId}
          AND started_at <= ${tDate}
          AND last_seen_at >= ${fDate}
          ${botFilter}
          ${sessionsFilter}
      `);
      const uniqueVisitors = Number((uniqueRes.rows[0] as any)?.count || 0);

      const newRes = await db.execute(sql`
        SELECT COUNT(DISTINCT visitor_id) AS count
        FROM sessions
        WHERE site_id = ${siteId}
          AND is_returning = FALSE
          AND started_at >= ${fDate}
          AND started_at <= ${tDate}
          ${botFilter}
          ${sessionsFilter}
      `);
      const newVisitors = Number((newRes.rows[0] as any)?.count || 0);

      const returningRes = await db.execute(sql`
        SELECT COUNT(DISTINCT visitor_id) AS count
        FROM sessions
        WHERE site_id = ${siteId}
          AND is_returning = TRUE
          AND started_at <= ${tDate}
          AND last_seen_at >= ${fDate}
          ${botFilter}
          ${sessionsFilter}
      `);
      const returningVisitors = Number((returningRes.rows[0] as any)?.count || 0);
      const returningVisitorRate =
        uniqueVisitors > 0 ? Number(((returningVisitors / uniqueVisitors) * 100).toFixed(2)) : 0;

      // 2. Session metrics
      const statsRes = await db.execute(sql`
        SELECT
          COUNT(*) AS total_sessions,
          COALESCE(SUM(page_views), 0) AS total_page_views,
          COALESCE(SUM(CASE WHEN is_bounce THEN 1 ELSE 0 END), 0) AS bounce_sessions,
          COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
        FROM sessions
        WHERE site_id = ${siteId}
          AND started_at <= ${tDate}
          AND last_seen_at >= ${fDate}
          ${botFilter}
          ${sessionsFilter}
      `);
      const row = (statsRes.rows[0] as any) || {};
      const totalSessions = Number(row.total_sessions || 0);
      const totalPageViews = Number(row.total_page_views || 0);
      const bounceSessions = Number(row.bounce_sessions || 0);
      const totalDuration = Number(row.total_duration_seconds || 0);

      const bounceRate =
        totalSessions > 0 ? Number(((bounceSessions / totalSessions) * 100).toFixed(2)) : 0;
      const averageSessionDuration =
        totalSessions > 0 ? Number((totalDuration / totalSessions).toFixed(1)) : 0;
      const pagesPerSession =
        totalSessions > 0 ? Number((totalPageViews / totalSessions).toFixed(2)) : 0;

      return {
        estimatedUniqueVisitors: uniqueVisitors,
        newVisitors,
        returningVisitors,
        returningVisitorRate,
        sessions: totalSessions,
        pageViews: totalPageViews,
        bounceRate,
        averageSessionDuration,
        pagesPerSession,
      };
    }

    const currentMetrics = await fetchOverviewMetrics(fromDate, toDate);

    // 3. Live metrics (5-min window)
    const threshold = new Date(Date.now() - 5 * 60 * 1000);
    const liveRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS live_visitors
      FROM sessions
      WHERE site_id = ${siteId}
        AND last_seen_at >= ${threshold}
        AND is_bot = FALSE
    `);
    const liveVisitors = Number((liveRes.rows[0] as any)?.live_visitors || 0);

    const metrics = {
      ...currentMetrics,
      liveVisitors,
    };

    // 4. Comparison metrics if requested
    const compRange = calculateComparisonTimeRange(fromDate, toDate, compare || 'none');
    let compMetrics = null;
    let changes = null;

    if (compRange) {
      const prev = await fetchOverviewMetrics(compRange.from, compRange.to);
      compMetrics = {
        ...prev,
        liveVisitors: 0,
      };

      changes = {
        estimatedUniqueVisitorsChange: calculateSafePercentageChange(
          metrics.estimatedUniqueVisitors,
          prev.estimatedUniqueVisitors
        ),
        newVisitorsChange: calculateSafePercentageChange(metrics.newVisitors, prev.newVisitors),
        returningVisitorsChange: calculateSafePercentageChange(
          metrics.returningVisitors,
          prev.returningVisitors
        ),
        returningVisitorRateChange: Number(
          (metrics.returningVisitorRate - prev.returningVisitorRate).toFixed(2)
        ),
        sessionsChange: calculateSafePercentageChange(metrics.sessions, prev.sessions),
        pageViewsChange: calculateSafePercentageChange(metrics.pageViews, prev.pageViews),
        bounceRateChange: Number((metrics.bounceRate - prev.bounceRate).toFixed(2)),
        averageSessionDurationChange: calculateSafePercentageChange(
          metrics.averageSessionDuration,
          prev.averageSessionDuration
        ),
        pagesPerSessionChange: calculateSafePercentageChange(
          metrics.pagesPerSession,
          prev.pagesPerSession
        ),
      };
    }

    const responsePayload = {
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      comparisonTimeRange: compRange
        ? { from: compRange.from.toISOString(), to: compRange.to.toISOString() }
        : null,
      metrics,
      comparison: compMetrics,
      changes,
      filters: filters || [],
      limitationNote: LIMITATION_NOTE,
      bounceRateDefinition: BOUNCE_RATE_DEFINITION,
    };

    analyticsCache.set(cacheKey, responsePayload, getRecommendedCacheTtl(toDate));
    reply.header('X-Meow-Cache', 'MISS');
    return reply.send(responsePayload);
  };

  // Section 5 & 16: Traffic Timeseries
  const handleTimeseries = async (request: any, reply: any) => {
    const parseResult = timeseriesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const {
      siteId: inputSiteId,
      from: fromQuery,
      to: toQuery,
      metric,
      resolution: reqResolution,
      compare,
      filters,
      includeBots,
    } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery
      ? new Date(fromQuery)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Check cache
    const cacheKey = buildAnalyticsCacheKey('timeseries', siteId, request.query);
    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      reply.header('X-Meow-Cache', 'HIT');
      return reply.send(cached);
    }

    const durationMs = toDate.getTime() - fromDate.getTime();
    const durationHours = durationMs / (3600 * 1000);

    let resolution: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily';
    if (reqResolution === 'auto') {
      if (durationHours <= 48) {
        resolution = 'hourly';
      } else if (durationHours <= 90 * 24) {
        resolution = 'daily';
      } else if (durationHours <= 180 * 24) {
        resolution = 'weekly';
      } else {
        resolution = 'monthly';
      }
    } else {
      resolution = reqResolution;
    }

    const truncUnit =
      resolution === 'hourly'
        ? 'hour'
        : resolution === 'daily'
        ? 'day'
        : resolution === 'weekly'
        ? 'week'
        : 'month';

    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    function alignToBucketStart(date: Date, res: typeof resolution): Date {
      const d = new Date(date);
      if (res === 'hourly') {
        d.setUTCMinutes(0, 0, 0);
      } else if (res === 'daily') {
        d.setUTCHours(0, 0, 0, 0);
      } else if (res === 'weekly') {
        d.setUTCHours(0, 0, 0, 0);
        const day = d.getUTCDay();
        const diff = (day === 0 ? -6 : 1) - day;
        d.setUTCDate(d.getUTCDate() + diff);
      } else {
        d.setUTCDate(1);
        d.setUTCHours(0, 0, 0, 0);
      }
      return d;
    }

    async function fetchBuckets(fDate: Date, tDate: Date) {
      // Phase 9: Query historical aggregates for daily/hourly requests without custom property filters
      const hasCustomFilters = filters && Object.keys(filters).length > 0;
      if (!hasCustomFilters && !includeBots) {
        if (truncUnit === 'day') {
          const aggRes = await db.execute(sql`
            SELECT
              bucket_date AS bucket,
              visitors,
              sessions,
              page_views
            FROM daily_aggregates
            WHERE site_id = ${siteId}
              AND bucket_date >= ${fDate}
              AND bucket_date <= ${tDate}
            ORDER BY bucket_date ASC
          `);
          if (aggRes.rows && aggRes.rows.length > 0) {
            const map = new Map<string, { visitors: number; sessions: number; page_views: number }>();
            for (const r of aggRes.rows as any[]) {
              if (r.bucket) {
                const key = new Date(r.bucket).toISOString();
                map.set(key, {
                  visitors: Number(r.visitors || 0),
                  sessions: Number(r.sessions || 0),
                  page_views: Number(r.page_views || 0),
                });
              }
            }
            return map;
          }
        } else if (truncUnit === 'hour') {
          const aggRes = await db.execute(sql`
            SELECT
              bucket_time AS bucket,
              visitors,
              sessions,
              page_views
            FROM hourly_aggregates
            WHERE site_id = ${siteId}
              AND bucket_time >= ${fDate}
              AND bucket_time <= ${tDate}
            ORDER BY bucket_time ASC
          `);
          if (aggRes.rows && aggRes.rows.length > 0) {
            const map = new Map<string, { visitors: number; sessions: number; page_views: number }>();
            for (const r of aggRes.rows as any[]) {
              if (r.bucket) {
                const key = new Date(r.bucket).toISOString();
                map.set(key, {
                  visitors: Number(r.visitors || 0),
                  sessions: Number(r.sessions || 0),
                  page_views: Number(r.page_views || 0),
                });
              }
            }
            return map;
          }
        }
      }

      const dateTruncExpr =
        truncUnit === 'hour'
          ? sql`date_trunc('hour', timestamp)`
          : truncUnit === 'day'
          ? sql`date_trunc('day', timestamp)`
          : truncUnit === 'week'
          ? sql`date_trunc('week', timestamp)`
          : sql`date_trunc('month', timestamp)`;

      const res = await db.execute(sql`
        SELECT
          ${dateTruncExpr} AS bucket,
          COUNT(DISTINCT visitor_id) AS visitors,
          COUNT(DISTINCT session_id) AS sessions,
          COUNT(*) AS page_views
        FROM page_views
        WHERE site_id = ${siteId}
          AND timestamp >= ${fDate}
          AND timestamp <= ${tDate}
          ${botFilter}
          ${pvFilter}
        GROUP BY bucket
        ORDER BY bucket ASC
      `);

      const map = new Map<string, { visitors: number; sessions: number; page_views: number }>();
      for (const r of res.rows as any[]) {
        if (r.bucket) {
          const key = new Date(r.bucket).toISOString();
          map.set(key, {
            visitors: Number(r.visitors || 0),
            sessions: Number(r.sessions || 0),
            page_views: Number(r.page_views || 0),
          });
        }
      }
      return map;
    }

    const primaryMap = await fetchBuckets(fromDate, toDate);

    const compRange = calculateComparisonTimeRange(fromDate, toDate, compare || 'none');
    const compMap = compRange ? await fetchBuckets(compRange.from, compRange.to) : null;

    function getNextTs(ts: number, res: typeof resolution): number {
      const d = new Date(ts);
      if (res === 'hourly') {
        return ts + 3600 * 1000;
      } else if (res === 'daily') {
        d.setUTCDate(d.getUTCDate() + 1);
        return d.getTime();
      } else if (res === 'weekly') {
        d.setUTCDate(d.getUTCDate() + 7);
        return d.getTime();
      } else {
        d.setUTCMonth(d.getUTCMonth() + 1);
        return d.getTime();
      }
    }

    function formatLabel(ts: number, res: typeof resolution): string {
      const d = new Date(ts);
      if (res === 'hourly') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (res === 'daily' || res === 'weekly') {
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        return d.toLocaleDateString([], { month: 'short', year: 'numeric' });
      }
    }

    const compTimestamps: number[] = [];
    if (compRange) {
      let compTs = alignToBucketStart(compRange.from, resolution).getTime();
      const compEndTs = compRange.to.getTime();
      while (compTs <= compEndTs) {
        compTimestamps.push(compTs);
        compTs = getNextTs(compTs, resolution);
      }
    }

    const series: any[] = [];
    let currentTs = alignToBucketStart(fromDate, resolution).getTime();
    const endTs = toDate.getTime();
    let idx = 0;
    let total = 0;
    let comparisonTotal = compRange ? 0 : null;

    while (currentTs <= endTs) {
      const nextTs = getNextTs(currentTs, resolution);
      let matchedVal = 0;
      for (const [key, val] of primaryMap.entries()) {
        const bTs = new Date(key).getTime();
        if (bTs >= currentTs && bTs < nextTs) {
          matchedVal +=
            metric === 'visitors'
              ? val.visitors
              : metric === 'sessions'
              ? val.sessions
              : val.page_views;
        }
      }

      let matchedCompVal: number | null = null;
      if (compMap && compTimestamps[idx] !== undefined) {
        const cTs = compTimestamps[idx]!;
        const nextCompTs = getNextTs(cTs, resolution);
        let cVal = 0;
        for (const [key, val] of compMap.entries()) {
          const bTs = new Date(key).getTime();
          if (bTs >= cTs && bTs < nextCompTs) {
            cVal +=
              metric === 'visitors'
                ? val.visitors
                : metric === 'sessions'
                ? val.sessions
                : val.page_views;
          }
        }
        matchedCompVal = cVal;
        if (comparisonTotal !== null) {
          comparisonTotal += cVal;
        }
      }

      total += matchedVal;
      series.push({
        timestamp: new Date(currentTs).toISOString(),
        label: formatLabel(currentTs, resolution),
        value: matchedVal,
        comparisonValue: matchedCompVal,
      });

      currentTs = nextTs;
      idx++;
    }

    const totalChange =
      comparisonTotal !== null ? calculateSafePercentageChange(total, comparisonTotal) : null;

    const responsePayload = {
      siteId,
      metric,
      resolution,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      comparisonTimeRange: compRange
        ? { from: compRange.from.toISOString(), to: compRange.to.toISOString() }
        : null,
      series,
      total,
      comparisonTotal,
      totalChange,
    };

    analyticsCache.set(cacheKey, responsePayload, getRecommendedCacheTtl(toDate));
    reply.header('X-Meow-Cache', 'MISS');
    return reply.send(responsePayload);
  };

  // Section 6: Top Pages
  const handlePages = async (request: any, reply: any) => {
    const parseResult = pagesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const {
      siteId: inputSiteId,
      from: fromQuery,
      to: toQuery,
      sortBy,
      sortOrder,
      limit,
      offset,
      filters,
      includeBots,
    } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery
      ? new Date(fromQuery)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const totalRes = await db.execute(sql`
      SELECT
        COUNT(DISTINCT visitor_id) AS total_visitors,
        COUNT(*) AS total_views,
        COUNT(DISTINCT path) AS total_pages
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
    `);

    const totalRow = (totalRes.rows[0] as any) || {};
    const totalVisitors = Number(totalRow.total_visitors || 0);
    const totalPageViews = Number(totalRow.total_views || 0);
    const totalPages = Number(totalRow.total_pages || 0);

    const sortCol =
      sortBy === 'page_views' ? sql`page_views` : sortBy === 'sessions' ? sql`sessions` : sql`visitors`;
    const orderClause = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;

    const rowsRes = await db.execute(sql`
      SELECT
        path,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY path
      ORDER BY ${sortCol} ${orderClause}, page_views DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const pages = rowsRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      return {
        path: r.path,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      totalPageViews,
      totalPages,
      pages,
    });
  };

  // Section 11: Universal Group By & Analytics Explorer
  const handleBreakdown = async (request: any, reply: any) => {
    const parseResult = breakdownQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const {
      siteId: inputSiteId,
      dimension,
      from: fromQuery,
      to: toQuery,
      sortBy,
      sortOrder,
      limit,
      offset,
      filters,
      includeBots,
    } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery
      ? new Date(fromQuery)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    let dimExpr = sql`path`;
    switch (dimension) {
      case 'path':
        dimExpr = sql`path`;
        break;
      case 'country':
        dimExpr = sql`COALESCE(NULLIF(country_code, ''), 'UNKNOWN')`;
        break;
      case 'device':
        dimExpr = sql`COALESCE(NULLIF(device_type, ''), 'unknown')`;
        break;
      case 'os':
        dimExpr = sql`COALESCE(NULLIF(os, ''), 'Unknown')`;
        break;
      case 'browser':
        dimExpr = sql`COALESCE(NULLIF(browser, ''), 'Unknown')`;
        break;
      case 'source':
        dimExpr = sql`COALESCE(NULLIF(referrer_source, ''), 'Direct')`;
        break;
      case 'referrer':
        dimExpr = sql`COALESCE(NULLIF(referrer_hostname, ''), 'direct')`;
        break;
      case 'utm':
        dimExpr = sql`COALESCE(NULLIF(utm_campaign, ''), '(none)')`;
        break;
    }

    const labelExpr =
      dimension === 'country'
        ? sql`COALESCE(NULLIF(country_name, ''), NULLIF(country_code, ''), 'Unknown')`
        : dimExpr;

    const totalRes = await db.execute(sql`
      SELECT
        COUNT(DISTINCT visitor_id) AS total_visitors,
        COUNT(DISTINCT session_id) AS total_sessions,
        COUNT(*) AS total_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
    `);

    const totalRow = (totalRes.rows[0] as any) || {};
    const totalVisitors = Number(totalRow.total_visitors || 0);
    const totalSessions = Number(totalRow.total_sessions || 0);
    const totalPageViews = Number(totalRow.total_views || 0);

    const sortCol =
      sortBy === 'page_views' ? sql`page_views` : sortBy === 'sessions' ? sql`sessions` : sql`visitors`;
    const orderClause = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;

    const rowsRes = await db.execute(sql`
      SELECT
        ${dimExpr} AS key_val,
        ${labelExpr} AS label_val,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY key_val, label_val
      ORDER BY ${sortCol} ${orderClause}, page_views DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const items = rowsRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      const key = String(r.key_val || 'Unknown');
      const label = String(r.label_val || r.key_val || 'Unknown');
      return {
        key,
        label,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      dimension,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      totalSessions,
      totalPageViews,
      items,
    });
  };

  // --- Phase 4 Analytics Handlers ---

  // Section 14 & 17: Traffic Sources
  const handleSources = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const totalRes = await db.execute(sql`
      SELECT
        COUNT(DISTINCT visitor_id) AS total_visitors,
        COUNT(DISTINCT session_id) AS total_sessions,
        COUNT(*) AS total_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
    `);
    const totalRow = (totalRes.rows[0] as any) || {};
    const totalVisitors = Number(totalRow.total_visitors || 0);
    const totalSessions = Number(totalRow.total_sessions || 0);
    const totalPageViews = Number(totalRow.total_views || 0);

    const sourcesRes = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(referrer_source, ''), 'Direct') AS source,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY source
      ORDER BY visitors DESC, page_views DESC
    `);

    const sources = sourcesRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      return {
        source: r.source,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      totalSessions,
      totalPageViews,
      sources,
    });
  };

  // Section 17: Referrer Drill-Down
  const handleSourcesDrilldown = async (request: any, reply: any) => {
    const parseResult = drilldownQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, source, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const rowsRes = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(referrer_hostname, ''), 'direct') AS referrer_hostname,
        referrer_url,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND referrer_source = ${source}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY referrer_hostname, referrer_url
      ORDER BY visitors DESC, page_views DESC
      LIMIT 100
    `);

    return reply.send({
      siteId,
      source,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      referrers: rowsRes.rows.map((r: any) => ({
        referrerHostname: r.referrer_hostname,
        referrerUrl: r.referrer_url || '',
        visitors: Number(r.visitors || 0),
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
      })),
    });
  };

  // Section 18: UTM Dashboard
  const handleUtm = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const rowsRes = await db.execute(sql`
      SELECT
        utm_campaign,
        utm_source,
        utm_medium,
        utm_term,
        utm_content,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        AND (utm_campaign IS NOT NULL OR utm_source IS NOT NULL OR utm_medium IS NOT NULL)
        ${botFilter}
        ${pvFilter}
      GROUP BY utm_campaign, utm_source, utm_medium, utm_term, utm_content
      ORDER BY visitors DESC, page_views DESC
      LIMIT 100
    `);

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      campaigns: rowsRes.rows.map((r: any) => ({
        campaign: r.utm_campaign || null,
        source: r.utm_source || null,
        medium: r.utm_medium || null,
        term: r.utm_term || null,
        content: r.utm_content || null,
        visitors: Number(r.visitors || 0),
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
      })),
    });
  };

  // Section 14 & 15: Country Table & Geography
  const handleLocations = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const totalRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS total_visitors
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
    `);
    const totalVisitors = Number((totalRes.rows[0] as any)?.total_visitors || 0);

    const rowsRes = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(country_code, ''), 'UNKNOWN') AS country_code,
        COALESCE(NULLIF(country_name, ''), 'Unknown') AS country_name,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY country_code, country_name
      ORDER BY visitors DESC, page_views DESC
      LIMIT 100
    `);

    const countries = rowsRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      return {
        countryCode: r.country_code,
        countryName: r.country_name,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      countries,
    });
  };

  // Section 14 & 16: Device Table
  const handleDevices = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const totalRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS total_visitors
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
    `);
    const totalVisitors = Number((totalRes.rows[0] as any)?.total_visitors || 0);

    const rowsRes = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(device_type, ''), 'unknown') AS device,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY device
      ORDER BY visitors DESC, page_views DESC
    `);

    const devices = rowsRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      return {
        device: r.device,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      devices,
    });
  };

  // Section 14: Browser Breakdown
  const handleBrowsers = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const totalRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS total_visitors
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
    `);
    const totalVisitors = Number((totalRes.rows[0] as any)?.total_visitors || 0);

    const rowsRes = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(browser, ''), 'Unknown') AS browser,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY browser
      ORDER BY visitors DESC, page_views DESC
    `);

    const browsers = rowsRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      return {
        browser: r.browser,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      browsers,
    });
  };

  // Section 14: Operating System Breakdown
  const handleOs = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const totalRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS total_visitors
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
    `);
    const totalVisitors = Number((totalRes.rows[0] as any)?.total_visitors || 0);

    const rowsRes = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(os, ''), 'Unknown') AS os,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${pvFilter}
      GROUP BY os
      ORDER BY visitors DESC, page_views DESC
    `);

    const osList = rowsRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      return {
        os: r.os,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      os: osList,
    });
  };

  // Section 14: Languages Breakdown
  const handleLanguages = async (request: any, reply: any) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, from: fromQuery, to: toQuery, filters, includeBots } = parseResult.data;
    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const pvFilter = buildPageViewsFilterSql(filters);

    const totalRes = await db.execute(sql`
      SELECT COUNT(DISTINCT visitor_id) AS total_visitors
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        AND language IS NOT NULL AND language <> ''
        ${botFilter}
        ${pvFilter}
    `);
    const totalVisitors = Number((totalRes.rows[0] as any)?.total_visitors || 0);

    const rowsRes = await db.execute(sql`
      SELECT
        language,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS page_views
      FROM page_views
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        AND language IS NOT NULL AND language <> ''
        ${botFilter}
        ${pvFilter}
      GROUP BY language
      ORDER BY visitors DESC, page_views DESC
      LIMIT 100
    `);

    const languages = rowsRes.rows.map((r: any) => {
      const visitors = Number(r.visitors || 0);
      const percentage = totalVisitors > 0 ? Number(((visitors / totalVisitors) * 100).toFixed(1)) : 0;
      return {
        language: r.language,
        visitors,
        sessions: Number(r.sessions || 0),
        pageViews: Number(r.page_views || 0),
        percentage,
      };
    });

    return reply.send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalVisitors,
      languages,
    });
  };

  // --- Route Registrations ---
  fastify.get('/analytics/visitors', handleVisitors);
  fastify.get('/api/v1/analytics/visitors', handleVisitors);

  fastify.get('/analytics/sessions', handleSessions);
  fastify.get('/api/v1/analytics/sessions', handleSessions);

  fastify.get('/analytics/live', handleLive);
  fastify.get('/api/v1/analytics/live', handleLive);

  fastify.get('/analytics/overview', handleOverview);
  fastify.get('/api/v1/analytics/overview', handleOverview);

  // Phase 5 Traffic Timeseries, Pages, and Group By Endpoints
  fastify.get('/analytics/timeseries', handleTimeseries);
  fastify.get('/api/v1/analytics/timeseries', handleTimeseries);

  fastify.get('/analytics/pages', handlePages);
  fastify.get('/api/v1/analytics/pages', handlePages);

  fastify.get('/analytics/breakdown', handleBreakdown);
  fastify.get('/api/v1/analytics/breakdown', handleBreakdown);
  fastify.get('/analytics/groupby', handleBreakdown);
  fastify.get('/api/v1/analytics/groupby', handleBreakdown);

  // Phase 4 Traffic Source and Visitor Context Endpoints
  fastify.get('/analytics/sources', handleSources);
  fastify.get('/api/v1/analytics/sources', handleSources);

  fastify.get('/analytics/sources/drilldown', handleSourcesDrilldown);
  fastify.get('/api/v1/analytics/sources/drilldown', handleSourcesDrilldown);

  fastify.get('/analytics/utm', handleUtm);
  fastify.get('/api/v1/analytics/utm', handleUtm);

  fastify.get('/analytics/locations', handleLocations);
  fastify.get('/api/v1/analytics/locations', handleLocations);
  fastify.get('/analytics/countries', handleLocations);
  fastify.get('/api/v1/analytics/countries', handleLocations);

  fastify.get('/analytics/devices', handleDevices);
  fastify.get('/api/v1/analytics/devices', handleDevices);

  fastify.get('/analytics/browsers', handleBrowsers);
  fastify.get('/api/v1/analytics/browsers', handleBrowsers);

  fastify.get('/analytics/os', handleOs);
  fastify.get('/api/v1/analytics/os', handleOs);

  // --- Phase 6 Custom Events & Errors Handlers ---

  const handleEvents = async (request: any, reply: any) => {
    const queryInput = {
      ...(request.query as object),
      ...(request.params?.projectId && !(request.query as any)?.siteId ? { siteId: request.params.projectId } : {}),
    };
    const parseResult = eventsQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const {
      siteId: inputSiteId,
      from: fromQuery,
      to: toQuery,
      search,
      sortBy,
      sortOrder,
      limit,
      offset,
      filters,
      includeBots,
    } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const eventsFilter = buildEventsFilterSql(filters);
    const searchFilter = search ? sql`AND (event_name ILIKE ${`%${search}%`} OR type ILIKE ${`%${search}%`})` : sql``;

    let sortColumn = sql`count`;
    if (sortBy === 'visitors') sortColumn = sql`visitors`;
    else if (sortBy === 'sessions') sortColumn = sql`sessions`;
    else if (sortBy === 'name') sortColumn = sql`event_name`;

    const sortDir = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;

    const rowsRes = await db.execute(sql`
      SELECT
        COALESCE(NULLIF(TRIM(event_name), ''), type) as event_name,
        COUNT(*)::int as count,
        COUNT(DISTINCT visitor_id)::int as visitors,
        COUNT(DISTINCT session_id)::int as sessions
      FROM events
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        AND type != 'ping'
        ${botFilter}
        ${eventsFilter}
        ${searchFilter}
      GROUP BY COALESCE(NULLIF(TRIM(event_name), ''), type)
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRes = await db.execute(sql`
      SELECT
        COUNT(*)::int as total_events,
        COUNT(DISTINCT COALESCE(NULLIF(TRIM(event_name), ''), type))::int as unique_events
      FROM events
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        AND type != 'ping'
        ${botFilter}
        ${eventsFilter}
        ${searchFilter}
    `);

    const totalRow = totalRes.rows[0] as any;
    const totalEvents = Number(totalRow?.total_events || 0);
    const totalUniqueEvents = Number(totalRow?.unique_events || 0);

    const items = rowsRes.rows.map((r: any) => ({
      eventName: String(r.event_name),
      count: Number(r.count || 0),
      visitors: Number(r.visitors || 0),
      uniqueVisitors: Number(r.visitors || 0),
      sessions: Number(r.sessions || 0),
    }));

    return reply.status(200).send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalEvents,
      totalUniqueEvents,
      events: items,
    });
  };

  const handleEventDetail = async (request: any, reply: any) => {
    const queryInput = {
      ...(request.query as object),
      ...(request.params?.projectId && !(request.query as any)?.siteId ? { siteId: request.params.projectId } : {}),
    };
    const parseResult = eventDetailQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const {
      siteId: inputSiteId,
      eventName,
      from: fromQuery,
      to: toQuery,
      filters,
      includeBots,
    } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const eventsFilter = buildEventsFilterSql(filters);

    const summaryRes = await db.execute(sql`
      SELECT
        COUNT(*)::int as occurrences,
        COUNT(DISTINCT visitor_id)::int as visitors,
        COUNT(DISTINCT session_id)::int as sessions
      FROM events
      WHERE site_id = ${siteId}
        AND (event_name = ${eventName} OR type = ${eventName})
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${eventsFilter}
    `);

    const summaryRow = summaryRes.rows[0] as any;
    const occurrences = Number(summaryRow?.occurrences || 0);
    const visitors = Number(summaryRow?.visitors || 0);
    const sessions = Number(summaryRow?.sessions || 0);

    const pathsRes = await db.execute(sql`
      SELECT
        path,
        COUNT(*)::int as count
      FROM events
      WHERE site_id = ${siteId}
        AND (event_name = ${eventName} OR type = ${eventName})
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${eventsFilter}
      GROUP BY path
      ORDER BY count DESC
      LIMIT 10
    `);

    const paths = pathsRes.rows.map((r: any) => {
      const c = Number(r.count || 0);
      return {
        path: String(r.path),
        count: c,
        percentage: occurrences > 0 ? Number(((c / occurrences) * 100).toFixed(1)) : 0,
      };
    });

    const durationHours = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60);
    const bucket = durationHours <= 48 ? 'hour' : 'day';

    const timeseriesRes = await db.execute(sql`
      SELECT
        DATE_TRUNC(${bucket}, timestamp) as bucket_time,
        COUNT(*)::int as count,
        COUNT(DISTINCT visitor_id)::int as visitors
      FROM events
      WHERE site_id = ${siteId}
        AND (event_name = ${eventName} OR type = ${eventName})
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${botFilter}
        ${eventsFilter}
      GROUP BY bucket_time
      ORDER BY bucket_time ASC
    `);

    const timeseries = timeseriesRes.rows.map((r: any) => ({
      timestamp: new Date(r.bucket_time).toISOString(),
      count: Number(r.count || 0),
      visitors: Number(r.visitors || 0),
    }));

    const propsRes = await db.execute(sql`
      SELECT properties
      FROM events
      WHERE site_id = ${siteId}
        AND (event_name = ${eventName} OR type = ${eventName})
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        AND properties IS NOT NULL
        ${botFilter}
      LIMIT 500
    `);

    const propMap: Record<string, Record<string, number>> = {};
    for (const row of propsRes.rows) {
      const p = (row as any).properties;
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;

      for (const [k, v] of Object.entries(p)) {
        if (isSensitiveKey(k)) continue;
        if (v === null || v === undefined) continue;
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (!propMap[k]) propMap[k] = {};
        propMap[k][valStr] = (propMap[k][valStr] || 0) + 1;
      }
    }

    const properties: Record<string, { value: string; count: number; percentage: number }[]> = {};
    for (const [k, valCounts] of Object.entries(propMap)) {
      const totalForProp = Object.values(valCounts).reduce((acc, c) => acc + c, 0);
      const sorted = Object.entries(valCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([val, cnt]) => ({
          value: val,
          count: cnt,
          percentage: totalForProp > 0 ? Number(((cnt / totalForProp) * 100).toFixed(1)) : 0,
        }));
      properties[k] = sorted;
    }

    return reply.status(200).send({
      siteId,
      eventName,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      occurrences,
      visitors,
      sessions,
      paths,
      timeseries,
      properties,
    });
  };

  const handleEventProperties = async (request: any, reply: any) => {
    const queryInput = {
      ...(request.query as object),
      ...(request.params?.projectId && !(request.query as any)?.siteId ? { siteId: request.params.projectId } : {}),
    };
    const parseResult = eventPropertiesQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const {
      siteId: inputSiteId,
      eventName,
      propertyKey,
      from: fromQuery,
      to: toQuery,
      limit,
      filters,
      includeBots,
    } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (isSensitiveKey(propertyKey)) {
      return reply.status(200).send({
        siteId,
        eventName,
        propertyKey,
        property: propertyKey,
        timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
        totalOccurrences: 0,
        totalValues: 0,
        values: [],
      });
    }

    const botFilter = includeBots ? sql`` : sql`AND is_bot = FALSE`;
    const eventsFilter = buildEventsFilterSql(filters);

    const rowsRes = await db.execute(sql`
      SELECT
        COALESCE(properties->>${propertyKey}, 'unknown') as prop_val,
        COUNT(*)::int as count
      FROM events
      WHERE site_id = ${siteId}
        AND (event_name = ${eventName} OR type = ${eventName})
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        AND properties->${propertyKey} IS NOT NULL
        ${botFilter}
        ${eventsFilter}
      GROUP BY prop_val
      ORDER BY count DESC
      LIMIT ${limit}
    `);

    const total = rowsRes.rows.reduce((acc: number, r: any) => acc + Number(r.count || 0), 0);
    const values = rowsRes.rows.map((r: any) => {
      const c = Number(r.count || 0);
      return {
        value: String(r.prop_val),
        count: c,
        percentage: total > 0 ? Number(((c / total) * 100).toFixed(1)) : 0,
      };
    });

    return reply.status(200).send({
      siteId,
      eventName,
      propertyKey,
      property: propertyKey,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalOccurrences: total,
      totalValues: total,
      values,
    });
  };

  const handleErrors = async (request: any, reply: any) => {
    const queryInput = {
      ...(request.query as object),
      ...(request.params?.projectId && !(request.query as any)?.siteId ? { siteId: request.params.projectId } : {}),
    };
    const parseResult = errorsQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const {
      siteId: inputSiteId,
      from: fromQuery,
      to: toQuery,
      search,
      sortBy,
      sortOrder,
      limit,
      offset,
    } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const searchFilter = search ? sql`AND (error_group ILIKE ${`%${search}%`} OR message ILIKE ${`%${search}%`})` : sql``;

    let sortCol = sql`occurrences`;
    if (sortBy === 'visitors') sortCol = sql`affected_visitors`;
    else if (sortBy === 'first_seen') sortCol = sql`first_seen`;
    else if (sortBy === 'last_seen') sortCol = sql`last_seen`;

    const sortDir = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;

    const rowsRes = await db.execute(sql`
      SELECT
        error_group,
        error_type,
        MIN(message) as message,
        COUNT(*)::int as occurrences,
        COUNT(DISTINCT visitor_id)::int as affected_visitors,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM error_events
      WHERE site_id = ${siteId}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
        ${searchFilter}
      GROUP BY error_group, error_type
      ORDER BY ${sortCol} ${sortDir}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRes = await db.execute(sql`
      SELECT
        COALESCE(SUM(c), 0)::int as total_errors,
        COUNT(*)::int as unique_errors
      FROM (
        SELECT COUNT(*) as c
        FROM error_events
        WHERE site_id = ${siteId}
          AND timestamp >= ${fromDate}
          AND timestamp <= ${toDate}
          ${searchFilter}
        GROUP BY error_group
      ) sub
    `);

    const totalRow = totalRes.rows[0] as any;
    const totalErrors = Number(totalRow?.total_errors || 0);
    const uniqueErrors = Number(totalRow?.unique_errors || 0);

    const errors = rowsRes.rows.map((r: any) => ({
      errorGroup: String(r.error_group),
      errorType: String(r.error_type),
      message: String(r.message),
      occurrences: Number(r.occurrences || 0),
      affectedVisitors: Number(r.affected_visitors || 0),
      firstSeen: new Date(r.first_seen).toISOString(),
      lastSeen: new Date(r.last_seen).toISOString(),
    }));

    return reply.status(200).send({
      siteId,
      timeRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totalErrors,
      uniqueErrors,
      errors,
    });
  };

  const handleErrorDetail = async (request: any, reply: any) => {
    const queryInput = {
      ...(request.query as object),
      ...(request.params?.projectId && !(request.query as any)?.siteId ? { siteId: request.params.projectId } : {}),
    };
    const parseResult = errorDetailQuerySchema.safeParse(queryInput);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    const { siteId: inputSiteId, errorGroup, from: fromQuery, to: toQuery } = parseResult.data;

    const siteId = await resolveSiteId(inputSiteId);
    if (!siteId) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Site or project "${inputSiteId}" not found` },
      });
    }

    const toDate = toQuery ? new Date(toQuery) : new Date();
    const fromDate = fromQuery ? new Date(fromQuery) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const summaryRes = await db.execute(sql`
      SELECT
        error_group,
        error_type,
        MIN(message) as message,
        COUNT(*)::int as occurrences,
        COUNT(DISTINCT visitor_id)::int as affected_visitors,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen
      FROM error_events
      WHERE site_id = ${siteId}
        AND error_group = ${errorGroup}
        AND timestamp >= ${fromDate}
        AND timestamp <= ${toDate}
      GROUP BY error_group, error_type
      LIMIT 1
    `);

    if (summaryRes.rows.length === 0) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Error group "${errorGroup}" not found` },
      });
    }

    const sumRow = summaryRes.rows[0] as any;

    const pathsRes = await db.execute(sql`
      SELECT path, COUNT(*)::int as count
      FROM error_events
      WHERE site_id = ${siteId} AND error_group = ${errorGroup}
        AND timestamp >= ${fromDate} AND timestamp <= ${toDate}
      GROUP BY path ORDER BY count DESC LIMIT 10
    `);

    const browsersRes = await db.execute(sql`
      SELECT browser, COUNT(*)::int as count
      FROM error_events
      WHERE site_id = ${siteId} AND error_group = ${errorGroup}
        AND timestamp >= ${fromDate} AND timestamp <= ${toDate}
      GROUP BY browser ORDER BY count DESC LIMIT 10
    `);

    const osRes = await db.execute(sql`
      SELECT os, COUNT(*)::int as count
      FROM error_events
      WHERE site_id = ${siteId} AND error_group = ${errorGroup}
        AND timestamp >= ${fromDate} AND timestamp <= ${toDate}
      GROUP BY os ORDER BY count DESC LIMIT 10
    `);

    const timeseriesRes = await db.execute(sql`
      SELECT DATE_TRUNC('day', timestamp) as bucket, COUNT(*)::int as count
      FROM error_events
      WHERE site_id = ${siteId} AND error_group = ${errorGroup}
        AND timestamp >= ${fromDate} AND timestamp <= ${toDate}
      GROUP BY bucket ORDER BY bucket ASC
    `);

    return reply.status(200).send({
      siteId,
      errorGroup: String(sumRow.error_group),
      errorType: String(sumRow.error_type),
      message: String(sumRow.message),
      occurrences: Number(sumRow.occurrences || 0),
      affectedVisitors: Number(sumRow.affected_visitors || 0),
      firstSeen: new Date(sumRow.first_seen).toISOString(),
      lastSeen: new Date(sumRow.last_seen).toISOString(),
      paths: pathsRes.rows.map((r: any) => ({ path: String(r.path), count: Number(r.count || 0) })),
      browsers: browsersRes.rows.map((r: any) => ({ browser: String(r.browser), count: Number(r.count || 0) })),
      os: osRes.rows.map((r: any) => ({ os: String(r.os), count: Number(r.count || 0) })),
      timeseries: timeseriesRes.rows.map((r: any) => ({
        timestamp: new Date(r.bucket).toISOString(),
        count: Number(r.count || 0),
      })),
    });
  };

  // Phase 6 Custom Events & Error Tracking Endpoints
  fastify.get('/analytics/events', handleEvents);
  fastify.get('/api/v1/analytics/events', handleEvents);
  fastify.get('/api/v1/projects/:projectId/analytics/events', handleEvents);

  fastify.get('/analytics/events/detail', handleEventDetail);
  fastify.get('/api/v1/analytics/events/detail', handleEventDetail);
  fastify.get('/api/v1/projects/:projectId/analytics/events/detail', handleEventDetail);

  fastify.get('/analytics/events/properties', handleEventProperties);
  fastify.get('/api/v1/analytics/events/properties', handleEventProperties);
  fastify.get('/api/v1/projects/:projectId/analytics/events/properties', handleEventProperties);

  fastify.get('/analytics/errors', handleErrors);
  fastify.get('/api/v1/analytics/errors', handleErrors);
  fastify.get('/api/v1/projects/:projectId/analytics/errors', handleErrors);

  fastify.get('/analytics/errors/detail', handleErrorDetail);
  fastify.get('/api/v1/analytics/errors/detail', handleErrorDetail);
  fastify.get('/api/v1/projects/:projectId/analytics/errors/detail', handleErrorDetail);

  // --- Phase 7 Performance & Speed Insights Handler ---
  const handlePerformance = async (request: any, reply: any) => {
    const rawQuery = { ...request.query };
    if (request.params?.projectId && !rawQuery.siteId) {
      const proj = await db
        .select()
        .from(projects)
        .where(eq(projects.id, request.params.projectId))
        .limit(1);
      if (proj[0]) rawQuery.siteId = proj[0].site_id;
    }

    const parseResult = performanceQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      const message = parseResult.error.issues.map((i) => i.message).join('; ');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: message || 'Invalid performance query parameters',
        },
      });
    }

    const {
      siteId,
      from: fromStr,
      to: toStr,
      path: pathParam,
      device: deviceParam,
      country: countryParam,
      filters,
      comparePeriod,
    } = parseResult.data;

    // Verify site exists
    const projCheck = await db
      .select({ site_id: projects.site_id })
      .from(projects)
      .where(eq(projects.site_id, siteId))
      .limit(1);

    if (!projCheck[0]) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: `Project with siteId "${siteId}" not found`,
        },
      });
    }

    const now = new Date();
    const to = toStr ? new Date(toStr) : now;
    const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const prevRange = comparePeriod ? calculateComparisonTimeRange(from, to, 'previous_period') : null;

    // Build filter expressions
    const pathSql = pathParam ? sql`AND path = ${pathParam}` : sql``;
    const deviceSql = deviceParam ? sql`AND device = ${deviceParam}` : sql``;
    const countrySql = countryParam ? sql`AND (country = ${countryParam.toUpperCase()} OR country_name ILIKE ${countryParam})` : sql``;
    const extraFiltersSql = buildPerformanceFilterSql(filters);

    // 1. Current Period Percentiles & Navigation Timings
    const currentSummaryRes = await db.execute(sql`
      SELECT
        COUNT(*)::int as total_samples,
        COUNT(lcp)::int as count_lcp,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY lcp) as lcp_p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lcp) as lcp_p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY lcp) as lcp_p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY lcp) as lcp_p95,
        COUNT(inp)::int as count_inp,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY inp) as inp_p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inp) as inp_p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY inp) as inp_p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY inp) as inp_p95,
        COUNT(cls)::int as count_cls,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY cls) as cls_p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cls) as cls_p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY cls) as cls_p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cls) as cls_p95,
        COUNT(fcp)::int as count_fcp,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY fcp) as fcp_p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY fcp) as fcp_p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fcp) as fcp_p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY fcp) as fcp_p95,
        COUNT(ttfb)::int as count_ttfb,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ttfb) as ttfb_p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttfb) as ttfb_p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY ttfb) as ttfb_p90,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttfb) as ttfb_p95,
        AVG(sample_rate) as avg_sample_rate,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dns_duration) as dns_p75,
        AVG(dns_duration) as dns_avg,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY connection_duration) as connection_p75,
        AVG(connection_duration) as connection_avg,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY request_duration) as request_p75,
        AVG(request_duration) as request_avg,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY response_duration) as response_p75,
        AVG(response_duration) as response_avg,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dom_loading) as dom_loading_p75,
        AVG(dom_loading) as dom_loading_avg,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY page_load) as page_load_p75,
        AVG(page_load) as page_load_avg
      FROM performance_metrics
      WHERE site_id = ${siteId}
        AND timestamp >= ${from} AND timestamp <= ${to}
        ${pathSql} ${deviceSql} ${countrySql} ${extraFiltersSql}
    `);

    const cur = (currentSummaryRes.rows && currentSummaryRes.rows[0]) ? currentSummaryRes.rows[0] : ({} as any);

    // 2. Previous Period Percentiles (for trend comparison)
    let prev: any = {};
    if (prevRange) {
      const prevRes = await db.execute(sql`
        SELECT
          COUNT(*)::int as total_samples,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lcp) as lcp_p75,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inp) as inp_p75,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cls) as cls_p75,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY fcp) as fcp_p75,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttfb) as ttfb_p75
        FROM performance_metrics
        WHERE site_id = ${siteId}
          AND timestamp >= ${prevRange.from} AND timestamp <= ${prevRange.to}
          ${pathSql} ${deviceSql} ${countrySql} ${extraFiltersSql}
      `);
      if (prevRes.rows && prevRes.rows[0]) {
        prev = prevRes.rows[0];
      }
    }

    const roundMetric = (val: any, decimals = 2): number | null => {
      if (val === null || val === undefined) return null;
      const num = Number(val);
      return isNaN(num) ? null : Number(num.toFixed(decimals));
    };

    const lcpP75 = roundMetric(cur.lcp_p75);
    const inpP75 = roundMetric(cur.inp_p75);
    const clsP75 = roundMetric(cur.cls_p75, 4);
    const fcpP75 = roundMetric(cur.fcp_p75);
    const ttfbP75 = roundMetric(cur.ttfb_p75);

    const prevLcpP75 = roundMetric(prev.lcp_p75);
    const prevInpP75 = roundMetric(prev.inp_p75);
    const prevClsP75 = roundMetric(prev.cls_p75, 4);
    const prevFcpP75 = roundMetric(prev.fcp_p75);
    const prevTtfbP75 = roundMetric(prev.ttfb_p75);

    // 3. Performance By Page
    const byPageRes = await db.execute(sql`
      SELECT
        path,
        COUNT(*)::int as count,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY lcp) as lcp_p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lcp) as lcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inp) as inp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cls) as cls_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY fcp) as fcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttfb) as ttfb_p75
      FROM performance_metrics
      WHERE site_id = ${siteId}
        AND timestamp >= ${from} AND timestamp <= ${to}
        ${deviceSql} ${countrySql} ${extraFiltersSql}
      GROUP BY path
      ORDER BY count DESC
      LIMIT 50
    `);

    // 4. Performance By Device
    const byDeviceRes = await db.execute(sql`
      SELECT
        device,
        COUNT(*)::int as count,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lcp) as lcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inp) as inp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cls) as cls_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY fcp) as fcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttfb) as ttfb_p75
      FROM performance_metrics
      WHERE site_id = ${siteId}
        AND timestamp >= ${from} AND timestamp <= ${to}
        ${pathSql} ${countrySql} ${extraFiltersSql}
      GROUP BY device
      ORDER BY count DESC
    `);

    // 5. Performance By Country
    const byCountryRes = await db.execute(sql`
      SELECT
        country as country_code,
        country_name,
        COUNT(*)::int as count,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lcp) as lcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY inp) as inp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cls) as cls_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY fcp) as fcp_p75,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttfb) as ttfb_p75
      FROM performance_metrics
      WHERE site_id = ${siteId}
        AND timestamp >= ${from} AND timestamp <= ${to}
        ${pathSql} ${deviceSql} ${extraFiltersSql}
      GROUP BY country, country_name
      ORDER BY count DESC
      LIMIT 50
    `);

    const avgSampleRate = Number(cur.avg_sample_rate ?? 1.0);
    const isSampled = avgSampleRate < 0.999;

    return reply.send({
      siteId,
      timeRange: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      previousTimeRange: prevRange
        ? { from: prevRange.from.toISOString(), to: prevRange.to.toISOString() }
        : null,
      totalSamples: Number(cur.total_samples || 0),
      isSampled,
      sampleRate: roundMetric(avgSampleRate, 2) ?? 1.0,
      summary: {
        lcp: {
          p50: roundMetric(cur.lcp_p50),
          p75: lcpP75,
          p90: roundMetric(cur.lcp_p90),
          p95: roundMetric(cur.lcp_p95),
          rating: classifyMetric('lcp', lcpP75),
          count: Number(cur.count_lcp || 0),
          trend: lcpP75 !== null && prevLcpP75 !== null ? calculateSafePercentageChange(lcpP75, prevLcpP75) : null,
        },
        inp: {
          p50: roundMetric(cur.inp_p50),
          p75: inpP75,
          p90: roundMetric(cur.inp_p90),
          p95: roundMetric(cur.inp_p95),
          rating: classifyMetric('inp', inpP75),
          count: Number(cur.count_inp || 0),
          trend: inpP75 !== null && prevInpP75 !== null ? calculateSafePercentageChange(inpP75, prevInpP75) : null,
        },
        cls: {
          p50: roundMetric(cur.cls_p50, 4),
          p75: clsP75,
          p90: roundMetric(cur.cls_p90, 4),
          p95: roundMetric(cur.cls_p95, 4),
          rating: classifyMetric('cls', clsP75),
          count: Number(cur.count_cls || 0),
          trend: clsP75 !== null && prevClsP75 !== null ? calculateSafePercentageChange(clsP75, prevClsP75) : null,
        },
        fcp: {
          p50: roundMetric(cur.fcp_p50),
          p75: fcpP75,
          p90: roundMetric(cur.fcp_p90),
          p95: roundMetric(cur.fcp_p95),
          rating: classifyMetric('fcp', fcpP75),
          count: Number(cur.count_fcp || 0),
          trend: fcpP75 !== null && prevFcpP75 !== null ? calculateSafePercentageChange(fcpP75, prevFcpP75) : null,
        },
        ttfb: {
          p50: roundMetric(cur.ttfb_p50),
          p75: ttfbP75,
          p90: roundMetric(cur.ttfb_p90),
          p95: roundMetric(cur.ttfb_p95),
          rating: classifyMetric('ttfb', ttfbP75),
          count: Number(cur.count_ttfb || 0),
          trend: ttfbP75 !== null && prevTtfbP75 !== null ? calculateSafePercentageChange(ttfbP75, prevTtfbP75) : null,
        },
      },
      previousSummary: prevRange
        ? {
            lcp: { p75: prevLcpP75 },
            inp: { p75: prevInpP75 },
            cls: { p75: prevClsP75 },
            fcp: { p75: prevFcpP75 },
            ttfb: { p75: prevTtfbP75 },
          }
        : null,
      navigationTiming: {
        dns: { p75: roundMetric(cur.dns_p75), avg: roundMetric(cur.dns_avg) },
        connection: { p75: roundMetric(cur.connection_p75), avg: roundMetric(cur.connection_avg) },
        request: { p75: roundMetric(cur.request_p75), avg: roundMetric(cur.request_avg) },
        response: { p75: roundMetric(cur.response_p75), avg: roundMetric(cur.response_avg) },
        domLoading: { p75: roundMetric(cur.dom_loading_p75), avg: roundMetric(cur.dom_loading_avg) },
        pageLoad: { p75: roundMetric(cur.page_load_p75), avg: roundMetric(cur.page_load_avg) },
      },
      byPage: byPageRes.rows.map((r: any) => ({
        path: String(r.path),
        count: Number(r.count || 0),
        lcp: roundMetric(r.lcp_p75),
        inp: roundMetric(r.inp_p75),
        cls: roundMetric(r.cls_p75, 4),
        fcp: roundMetric(r.fcp_p75),
        ttfb: roundMetric(r.ttfb_p75),
      })),
      byDevice: byDeviceRes.rows.map((r: any) => ({
        device: String(r.device),
        count: Number(r.count || 0),
        lcp: roundMetric(r.lcp_p75),
        inp: roundMetric(r.inp_p75),
        cls: roundMetric(r.cls_p75, 4),
        fcp: roundMetric(r.fcp_p75),
        ttfb: roundMetric(r.ttfb_p75),
      })),
      byCountry: byCountryRes.rows.map((r: any) => ({
        countryCode: String(r.country_code),
        countryName: String(r.country_name || r.country_code),
        count: Number(r.count || 0),
        lcp: roundMetric(r.lcp_p75),
        inp: roundMetric(r.inp_p75),
        cls: roundMetric(r.cls_p75, 4),
        fcp: roundMetric(r.fcp_p75),
        ttfb: roundMetric(r.ttfb_p75),
      })),
    });
  };

  // Performance Endpoints
  fastify.get('/analytics/performance', handlePerformance);
  fastify.get('/api/v1/analytics/performance', handlePerformance);
  fastify.get('/api/v1/projects/:projectId/analytics/performance', handlePerformance);
};
