import { getDatabase, projects, hourlyAggregates, dailyAggregates } from '@meow-analytics/database';
import { sql, eq, and, ne } from 'drizzle-orm';
import { generateId } from '@meow-analytics/shared';

export interface AggregationOptions {
  siteId?: string;
  upToDate?: Date;
  sinceDate?: Date;
  all?: boolean;
  batchHours?: number;
}

export interface AggregationResult {
  hourlyProcessed: number;
  dailyProcessed: number;
  sites: string[];
}

/**
 * Runs hourly aggregation on raw events and sessions.
 * Reduces raw events into hourly_aggregates.
 * Idempotent and safe to run multiple times.
 */
export async function runHourlyAggregation(options: AggregationOptions = {}): Promise<number> {
  const db = getDatabase();
  const upTo = options.upToDate || new Date();
  const since = options.sinceDate || (options.all ? null : new Date(Date.now() - 48 * 3600 * 1000));
  const sinceSql = since ? sql`AND e.timestamp >= ${since}` : sql``;

  // Find target sites
  let siteIds: string[] = [];
  if (options.siteId) {
    siteIds = [options.siteId];
  } else {
    const activeProjects = await db
      .select({ site_id: projects.site_id })
      .from(projects)
      .where(ne(projects.status, 'deleted'));
    siteIds = activeProjects.map((p) => p.site_id);
  }

  let totalAggregated = 0;

  for (const site_id of siteIds) {
    // Concurrently group raw events and sessions by hour
    const [rows, sessionRows] = await Promise.all([
      db.execute(sql`
        SELECT
          date_trunc('hour', e.timestamp) as bucket_time,
          COUNT(e.event_id)::int as total_events,
          COUNT(CASE WHEN e.type = 'page_view' THEN 1 END)::int as page_views,
          COUNT(DISTINCT e.visitor_id)::int as visitors,
          COUNT(DISTINCT e.session_id)::int as sessions
        FROM events e
        WHERE e.site_id = ${site_id}
          AND e.timestamp <= ${upTo}
          ${sinceSql}
        GROUP BY date_trunc('hour', e.timestamp)
        ORDER BY bucket_time ASC
      `),
      db.execute(sql`
        SELECT
          date_trunc('hour', s.started_at) as bucket_time,
          COUNT(CASE WHEN s.is_bounce = true THEN 1 END)::int as bounces,
          COALESCE(SUM(s.duration_seconds), 0)::int as total_duration
        FROM sessions s
        WHERE s.site_id = ${site_id}
          AND s.started_at <= ${upTo}
          ${since ? sql`AND s.started_at >= ${since}` : sql``}
        GROUP BY date_trunc('hour', s.started_at)
      `),
    ]);

    const sessionStatsMap = new Map<string, { bounces: number; durationSeconds: number }>();
    for (const s of sessionRows.rows as any[]) {
      if (s.bucket_time) {
        sessionStatsMap.set(new Date(s.bucket_time).toISOString(), {
          bounces: Number(s.bounces || 0),
          durationSeconds: Number(s.total_duration || 0),
        });
      }
    }

    for (const r of rows.rows as any[]) {
      const bucketTime = new Date(r.bucket_time);
      const sStat = sessionStatsMap.get(bucketTime.toISOString()) || { bounces: 0, durationSeconds: 0 };
      const bounces = sStat.bounces;
      const durationSeconds = sStat.durationSeconds;

      const id = `ha_${generateId()}`;
      await db.execute(sql`
        INSERT INTO hourly_aggregates (
          id, site_id, bucket_time, page_views, visitors, sessions, events, bounces, duration_seconds, updated_at
        ) VALUES (
          ${id}, ${site_id}, ${bucketTime},
          ${Number(r.page_views || 0)}, ${Number(r.visitors || 0)}, ${Number(r.sessions || 0)},
          ${Number(r.total_events || 0)}, ${bounces}, ${durationSeconds}, NOW()
        )
        ON CONFLICT (site_id, bucket_time) DO UPDATE SET
          page_views = EXCLUDED.page_views,
          visitors = EXCLUDED.visitors,
          sessions = EXCLUDED.sessions,
          events = EXCLUDED.events,
          bounces = EXCLUDED.bounces,
          duration_seconds = EXCLUDED.duration_seconds,
          updated_at = NOW()
      `);
      totalAggregated++;
    }
  }

  return totalAggregated;
}

/**
 * Compresses hourly_aggregates into daily_aggregates.
 * Idempotent and safe to run repeatedly.
 */
export async function runDailyAggregation(options: AggregationOptions = {}): Promise<number> {
  const db = getDatabase();
  const upTo = options.upToDate || new Date();
  const since = options.sinceDate || (options.all ? null : new Date(Date.now() - 14 * 24 * 3600 * 1000));
  const sinceSql = since ? sql`AND h.bucket_time >= ${since}` : sql``;

  let siteIds: string[] = [];
  if (options.siteId) {
    siteIds = [options.siteId];
  } else {
    const activeProjects = await db
      .select({ site_id: projects.site_id })
      .from(projects)
      .where(ne(projects.status, 'deleted'));
    siteIds = activeProjects.map((p) => p.site_id);
  }

  let totalAggregated = 0;

  for (const site_id of siteIds) {
    const rows = await db.execute(sql`
      SELECT
        date_trunc('day', h.bucket_time) as bucket_date,
        SUM(h.page_views)::int as page_views,
        MAX(h.visitors)::int as visitors,
        SUM(h.sessions)::int as sessions,
        SUM(h.events)::int as events,
        SUM(h.bounces)::int as bounces,
        SUM(h.duration_seconds)::int as duration_seconds
      FROM hourly_aggregates h
      WHERE h.site_id = ${site_id}
        AND h.bucket_time <= ${upTo}
        ${sinceSql}
      GROUP BY date_trunc('day', h.bucket_time)
      ORDER BY bucket_date ASC
    `);

    for (const r of rows.rows as any[]) {
      const bucketDate = new Date(r.bucket_date);
      const id = `da_${generateId()}`;

      await db.execute(sql`
        INSERT INTO daily_aggregates (
          id, site_id, bucket_date, page_views, visitors, sessions, events, bounces, duration_seconds, updated_at
        ) VALUES (
          ${id}, ${site_id}, ${bucketDate},
          ${Number(r.page_views || 0)}, ${Number(r.visitors || 0)}, ${Number(r.sessions || 0)},
          ${Number(r.events || 0)}, ${Number(r.bounces || 0)}, ${Number(r.duration_seconds || 0)}, NOW()
        )
        ON CONFLICT (site_id, bucket_date) DO UPDATE SET
          page_views = EXCLUDED.page_views,
          visitors = EXCLUDED.visitors,
          sessions = EXCLUDED.sessions,
          events = EXCLUDED.events,
          bounces = EXCLUDED.bounces,
          duration_seconds = EXCLUDED.duration_seconds,
          updated_at = NOW()
      `);
      totalAggregated++;
    }
  }

  return totalAggregated;
}
