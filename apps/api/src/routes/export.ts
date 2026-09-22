import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireProjectAuth } from '../plugins/auth.js';
import { exportQuerySchema, escapeCsvValue, projectIdParamSchema } from '@meow-analytics/shared';
import { getDatabase, projects, events, sessions, pageViews } from '@meow-analytics/database';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { NotFoundError } from '../plugins/error-handler.js';

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

    let data: any = {};

    // 1. Fetch Events if requested
    if (query.type === 'events' || query.type === 'all') {
      const conditions: any[] = [eq(events.site_id, siteId)];
      if (fromDate) conditions.push(gte(events.timestamp, fromDate));
      if (toDate) conditions.push(lte(events.timestamp, toDate));

      const eventRows = await db
        .select({
          eventId: events.event_id,
          siteId: events.site_id,
          type: events.type,
          eventName: events.event_name,
          path: events.path,
          hostname: events.hostname,
          referrer: events.referrer,
          referrerSource: events.referrer_source,
          utmSource: events.utm_source,
          utmMedium: events.utm_medium,
          utmCampaign: events.utm_campaign,
          countryCode: events.country_code,
          countryName: events.country_name,
          deviceType: events.device_type,
          browser: events.browser,
          os: events.os,
          timestamp: events.timestamp,
        })
        .from(events)
        .where(and(...conditions))
        .orderBy(desc(events.timestamp))
        .limit(limit);

      data.events = eventRows.map((r) => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
      }));
    }

    // 2. Fetch Sessions if requested
    if (query.type === 'sessions' || query.type === 'all') {
      const conditions: any[] = [eq(sessions.site_id, siteId)];
      if (fromDate) conditions.push(gte(sessions.started_at, fromDate));
      if (toDate) conditions.push(lte(sessions.started_at, toDate));

      const sessionRows = await db
        .select({
          sessionId: sessions.session_id,
          siteId: sessions.site_id,
          startedAt: sessions.started_at,
          lastSeenAt: sessions.last_seen_at,
          landingPage: sessions.landing_page,
          exitPage: sessions.exit_page,
          pageViews: sessions.page_views,
          eventCount: sessions.event_count,
          isBounce: sessions.is_bounce,
          durationSeconds: sessions.duration_seconds,
          isReturning: sessions.is_returning,
          countryCode: sessions.country_code,
          deviceType: sessions.device_type,
          browser: sessions.browser,
          os: sessions.os,
        })
        .from(sessions)
        .where(and(...conditions))
        .orderBy(desc(sessions.started_at))
        .limit(limit);

      data.sessions = sessionRows.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
      }));
    }

    // 3. Fetch Page Views if requested
    if (query.type === 'page_views' || query.type === 'all') {
      const conditions: any[] = [eq(pageViews.site_id, siteId)];
      if (fromDate) conditions.push(gte(pageViews.timestamp, fromDate));
      if (toDate) conditions.push(lte(pageViews.timestamp, toDate));

      const pvRows = await db
        .select({
          id: pageViews.id,
          eventId: pageViews.event_id,
          siteId: pageViews.site_id,
          path: pageViews.path,
          hostname: pageViews.hostname,
          referrer: pageViews.referrer,
          timestamp: pageViews.timestamp,
        })
        .from(pageViews)
        .where(and(...conditions))
        .orderBy(desc(pageViews.timestamp))
        .limit(limit);

      data.pageViews = pvRows.map((r) => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
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
