import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireProjectAuth } from '../plugins/auth.js';
import { exportQuerySchema, escapeCsvValue, projectIdParamSchema } from '@meow-analytics/shared';
import { getDatabase, projects, events, sessions, pageViews } from '@meow-analytics/database';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { NotFoundError } from '../plugins/error-handler.js';
import {
  buildPageViewsFilterSql,
  buildSessionsFilterSql,
  buildEventsFilterSql,
} from '../lib/filters.js';

export const exportRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // All export requests require authenticated project access
  app.addHook('preHandler', requireProjectAuth);

  // GET /api/v1/projects/:id/export
  app.get('/api/v1/projects/:id/export', async (request, reply) => {
    const { id } = projectIdParamSchema.parse(request.params);
    const query = exportQuerySchema.parse(request.query);
    const db = getDatabase();

    // Verify project exists
    const projRows = await db
      .select()
      .from(projects)
      .where(sql`${projects.id} = ${id} OR ${projects.site_id} = ${id}`)
      .limit(1);

    if (projRows.length === 0) {
      throw new NotFoundError(`Project with ID "${id}" was not found`);
    }

    const project = projRows[0]!;
    const siteId = project.site_id;

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;
    const limit = query.limit || 10000;
    const filters = query.filters;

    const eventsFilter = buildEventsFilterSql(filters);
    const sessionsFilter = buildSessionsFilterSql(filters);
    const pvFilter = buildPageViewsFilterSql(filters);

    const fromEventsSql = fromDate ? sql`AND timestamp >= ${fromDate}` : sql``;
    const toEventsSql = toDate ? sql`AND timestamp <= ${toDate}` : sql``;
    const fromSessionsSql = fromDate ? sql`AND started_at >= ${fromDate}` : sql``;
    const toSessionsSql = toDate ? sql`AND started_at <= ${toDate}` : sql``;

    let data: any = {};

    // 1. Fetch Events if requested
    if (query.type === 'events' || query.type === 'all') {
      const eventRows = await db.execute(sql`
        SELECT
          event_id as "eventId", site_id as "siteId", type, event_name as "eventName",
          path, hostname, referrer, referrer_source as "referrerSource",
          utm_source as "utmSource", utm_medium as "utmMedium", utm_campaign as "utmCampaign",
          country_code as "countryCode", country_name as "countryName",
          device_type as "deviceType", browser, os, timestamp
        FROM events
        WHERE site_id = ${siteId}
          ${fromEventsSql}
          ${toEventsSql}
          ${eventsFilter}
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `);

      data.events = (eventRows.rows as any[]).map((r) => ({
        ...r,
        timestamp: new Date(r.timestamp).toISOString(),
      }));
    }

    // 2. Fetch Sessions if requested
    if (query.type === 'sessions' || query.type === 'all') {
      const sessionRows = await db.execute(sql`
        SELECT
          session_id as "sessionId", site_id as "siteId", started_at as "startedAt",
          last_seen_at as "lastSeenAt", landing_page as "landingPage", exit_page as "exitPage",
          page_views as "pageViews", event_count as "eventCount", is_bounce as "isBounce",
          duration_seconds as "durationSeconds", is_returning as "isReturning",
          country_code as "countryCode", device_type as "deviceType", browser, os
        FROM sessions
        WHERE site_id = ${siteId}
          ${fromSessionsSql}
          ${toSessionsSql}
          ${sessionsFilter}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `);

      data.sessions = (sessionRows.rows as any[]).map((r) => ({
        ...r,
        startedAt: new Date(r.startedAt).toISOString(),
        lastSeenAt: new Date(r.lastSeenAt).toISOString(),
      }));
    }

    // 3. Fetch Page Views if requested
    if (query.type === 'page_views' || query.type === 'all') {
      const pvRows = await db.execute(sql`
        SELECT
          id, event_id as "eventId", site_id as "siteId", path, hostname, referrer, timestamp
        FROM page_views
        WHERE site_id = ${siteId}
          ${fromEventsSql}
          ${toEventsSql}
          ${pvFilter}
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `);

      data.pageViews = (pvRows.rows as any[]).map((r) => ({
        ...r,
        timestamp: new Date(r.timestamp).toISOString(),
      }));
    }

    const filename = `meow-export-${siteId}-${Date.now()}`;


    // Format output
    if (query.format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filename}.csv"`);

      // If specific type requested, generate tabular CSV
      if (query.type === 'events' && data.events) {
        const headers = [
          'eventId', 'siteId', 'type', 'eventName', 'path', 'hostname',
          'referrer', 'referrerSource', 'utmSource', 'utmMedium', 'utmCampaign',
          'countryCode', 'countryName', 'deviceType', 'browser', 'os', 'timestamp'
        ];
        const lines = [headers.join(',')];
        for (const ev of data.events) {
          lines.push(headers.map((h) => escapeCsvValue(ev[h])).join(','));
        }
        return reply.send(lines.join('\n'));
      }

      if (query.type === 'sessions' && data.sessions) {
        const headers = [
          'sessionId', 'siteId', 'startedAt', 'lastSeenAt', 'landingPage', 'exitPage',
          'pageViews', 'eventCount', 'isBounce', 'durationSeconds', 'isReturning',
          'countryCode', 'deviceType', 'browser', 'os'
        ];
        const lines = [headers.join(',')];
        for (const s of data.sessions) {
          lines.push(headers.map((h) => escapeCsvValue(s[h])).join(','));
        }
        return reply.send(lines.join('\n'));
      }

      if (query.type === 'page_views' && data.pageViews) {
        const headers = ['id', 'eventId', 'siteId', 'path', 'hostname', 'referrer', 'timestamp'];
        const lines = [headers.join(',')];
        for (const pv of data.pageViews) {
          lines.push(headers.map((h) => escapeCsvValue(pv[h])).join(','));
        }
        return reply.send(lines.join('\n'));
      }

      // If 'all' type requested in CSV format, produce combined events summary
      const rows = data.events || [];
      const headers = ['recordType', 'id', 'siteId', 'timestamp', 'path', 'country', 'device', 'browser', 'os'];
      const lines = [headers.join(',')];
      for (const ev of rows) {
        lines.push([
          'event',
          escapeCsvValue(ev.eventId),
          escapeCsvValue(ev.siteId),
          escapeCsvValue(ev.timestamp),
          escapeCsvValue(ev.path),
          escapeCsvValue(ev.countryCode),
          escapeCsvValue(ev.deviceType),
          escapeCsvValue(ev.browser),
          escapeCsvValue(ev.os),
        ].join(','));
      }
      return reply.send(lines.join('\n'));
    }

    // JSON Format
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}.json"`);
    return reply.status(200).send({
      siteId,
      exportedAt: new Date().toISOString(),
      filter: {
        from: fromDate?.toISOString() || null,
        to: toDate?.toISOString() || null,
        type: query.type,
      },
      ...data,
    });
  });
};
