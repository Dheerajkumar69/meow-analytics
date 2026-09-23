import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAdminAuth } from '../plugins/auth.js';
import {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
  deleteRangeSchema,
  deleteVisitorSchema,
  generateProjectId,
  generateSiteId,
} from '@meow-analytics/shared';
import {
  getDatabase,
  projects,
  events,
  sessions,
  pageViews,
  visitors,
  errorEvents,
  performanceMetrics,
} from '@meow-analytics/database';
import { eq, and, ne, desc, gte, lte, sql } from 'drizzle-orm';
import { NotFoundError } from '../plugins/error-handler.js';
import { analyticsCache, projectValidationCache } from '../lib/cache.js';

export const projectRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // All project endpoints require admin authentication
  app.addHook('preHandler', requireAdminAuth);

  // POST /api/v1/projects
  app.post('/api/v1/projects', async (request, reply) => {
    const body = createProjectSchema.parse(request.body);
    const db = getDatabase();

    const id = generateProjectId();
    const site_id = generateSiteId();
    const now = new Date();

    const newProject = {
      id,
      name: body.name,
      site_id,
      status: 'active' as const,
      timezone: body.timezone || 'UTC',
      privacy_mode: body.privacy_mode || 'balanced',
      visitor_retention_hours: body.visitor_retention_hours || 24,
      event_retention_days: body.event_retention_days || 90,
      created_at: now,
      updated_at: now,
    };

    await db.insert(projects).values(newProject);

    return reply.status(201).send({
      ...newProject,
      created_at: newProject.created_at.toISOString(),
      updated_at: newProject.updated_at.toISOString(),
    });
  });

  // GET /api/v1/projects
  app.get('/api/v1/projects', async (request, reply) => {
    const db = getDatabase();
    // Exclude deleted projects
    const rows = await db
      .select()
      .from(projects)
      .where(ne(projects.status, 'deleted'))
      .orderBy(desc(projects.created_at));

    const result = rows.map((p) => ({
      ...p,
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString(),
    }));

    return reply.status(200).send(result);
  });

  // GET /api/v1/projects/:id
  app.get('/api/v1/projects/:id', async (request, reply) => {
    const { id } = projectIdParamSchema.parse(request.params);
    const db = getDatabase();

    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), ne(projects.status, 'deleted')))
      .limit(1);

    const project = rows[0];
    if (!project) {
      throw new NotFoundError(`Project with ID "${id}" was not found`);
    }

    return reply.status(200).send({
      ...project,
      created_at: project.created_at.toISOString(),
      updated_at: project.updated_at.toISOString(),
    });
  });

  // PATCH /api/v1/projects/:id
  app.patch('/api/v1/projects/:id', async (request, reply) => {
    const { id } = projectIdParamSchema.parse(request.params);
    const body = updateProjectSchema.parse(request.body);
    const db = getDatabase();

    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), ne(projects.status, 'deleted')))
      .limit(1);

    const existing = rows[0];
    if (!existing) {
      throw new NotFoundError(`Project with ID "${id}" was not found`);
    }

    const updates: Record<string, any> = {
      updated_at: new Date(),
    };
    if (body.name !== undefined) updates.name = body.name;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.status !== undefined) updates.status = body.status;
    if (body.privacy_mode !== undefined) updates.privacy_mode = body.privacy_mode;
    if (body.visitor_retention_hours !== undefined) updates.visitor_retention_hours = body.visitor_retention_hours;
    if (body.event_retention_days !== undefined) updates.event_retention_days = body.event_retention_days;

    await db.update(projects).set(updates).where(eq(projects.id, id));
    projectValidationCache.invalidate(id);
    if (existing.site_id) {
      projectValidationCache.invalidate(existing.site_id);
    }

    const updatedRows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    const updated = updatedRows[0]!;

    return reply.status(200).send({
      ...updated,
      created_at: updated.created_at.toISOString(),
      updated_at: updated.updated_at.toISOString(),
    });
  });

  // DELETE /api/v1/projects/:id — Actually deletes the project and cascade-removes all data
  app.delete('/api/v1/projects/:id', async (request, reply) => {
    const { id } = projectIdParamSchema.parse(request.params);
    const db = getDatabase();

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError(`Project with ID "${id}" was not found`);
    }

    const siteId = rows[0]?.site_id;
    // Physical deletion triggers foreign key cascade across all project tables
    await db.delete(projects).where(eq(projects.id, id));
    projectValidationCache.invalidate(id);
    if (siteId) {
      projectValidationCache.invalidate(siteId);
      analyticsCache.invalidateSite(siteId);
    }

    return reply.status(200).send({
      success: true,
      message: `Project "${id}" and all associated data deleted successfully`,
    });
  });

  // DELETE /api/v1/projects/:id/data — Physically deletes data within a date range
  app.delete('/api/v1/projects/:id/data', async (request, reply) => {
    const { id } = projectIdParamSchema.parse(request.params);
    const queryPayload = (request.method === 'DELETE' && Object.keys(request.query || {}).length > 0)
      ? request.query
      : request.body;
    const { from, to } = deleteRangeSchema.parse(queryPayload);
    const db = getDatabase();

    const rows = await db
      .select({ site_id: projects.site_id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError(`Project with ID "${id}" was not found`);
    }

    const siteId = rows[0]!.site_id;
    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Physically delete from all event and analytics tables for this range
    const evRes = await db
      .delete(events)
      .where(and(eq(events.site_id, siteId), gte(events.timestamp, fromDate), lte(events.timestamp, toDate)));

    const pvRes = await db
      .delete(pageViews)
      .where(and(eq(pageViews.site_id, siteId), gte(pageViews.timestamp, fromDate), lte(pageViews.timestamp, toDate)));

    const sessRes = await db
      .delete(sessions)
      .where(and(eq(sessions.site_id, siteId), gte(sessions.started_at, fromDate), lte(sessions.started_at, toDate)));

    const errRes = await db
      .delete(errorEvents)
      .where(and(eq(errorEvents.site_id, siteId), gte(errorEvents.timestamp, fromDate), lte(errorEvents.timestamp, toDate)));

    const perfRes = await db
      .delete(performanceMetrics)
      .where(and(eq(performanceMetrics.site_id, siteId), gte(performanceMetrics.timestamp, fromDate), lte(performanceMetrics.timestamp, toDate)));

    analyticsCache.invalidateSite(siteId);

    return reply.status(200).send({
      success: true,
      message: `Data between ${from} and ${to} permanently deleted for project "${id}"`,
      deleted: {
        events: (evRes as any).rowCount || 0,
        pageViews: (pvRes as any).rowCount || 0,
        sessions: (sessRes as any).rowCount || 0,
        errors: (errRes as any).rowCount || 0,
        performance: (perfRes as any).rowCount || 0,
      },
    });
  });

  // DELETE /api/v1/projects/:id/visitors — Physically deletes visitor records
  app.delete('/api/v1/projects/:id/visitors', async (request, reply) => {
    const { id } = projectIdParamSchema.parse(request.params);
    const queryPayload = (request.method === 'DELETE' && Object.keys(request.query || {}).length > 0)
      ? request.query
      : request.body;
    const body = deleteVisitorSchema.parse(queryPayload);
    const db = getDatabase();

    const rows = await db
      .select({ site_id: projects.site_id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError(`Project with ID "${id}" was not found`);
    }

    const siteId = rows[0]!.site_id;
    let deletedCount = 0;

    if (body.visitorId) {
      // Anonymize in events and sessions
      await db.execute(sql`UPDATE events SET visitor_id = NULL WHERE site_id = ${siteId} AND visitor_id = ${body.visitorId}`).catch(() => {});
      await db.execute(sql`UPDATE sessions SET visitor_id = NULL WHERE site_id = ${siteId} AND visitor_id = ${body.visitorId}`).catch(() => {});
      const res = await db.delete(visitors).where(and(eq(visitors.site_id, siteId), eq(visitors.id, body.visitorId)));
      deletedCount += (res as any).rowCount || 0;
    } else if (body.anonymousId) {
      const vRows = await db.select({ id: visitors.id }).from(visitors).where(and(eq(visitors.site_id, siteId), eq(visitors.anonymous_id, body.anonymousId)));
      for (const v of vRows) {
        await db.execute(sql`UPDATE events SET visitor_id = NULL WHERE site_id = ${siteId} AND visitor_id = ${v.id}`).catch(() => {});
        await db.execute(sql`UPDATE sessions SET visitor_id = NULL WHERE site_id = ${siteId} AND visitor_id = ${v.id}`).catch(() => {});
        const res = await db.delete(visitors).where(eq(visitors.id, v.id));
        deletedCount += (res as any).rowCount || 0;
      }
    } else if (body.olderThanHours) {
      const cutoff = new Date(Date.now() - body.olderThanHours * 3600 * 1000);
      const oldRows = await db.select({ id: visitors.id }).from(visitors).where(and(eq(visitors.site_id, siteId), lte(visitors.last_seen_at, cutoff)));
      const ids = oldRows.map((r) => r.id);
      if (ids.length > 0) {
        await db.execute(sql`UPDATE events SET visitor_id = NULL WHERE site_id = ${siteId} AND visitor_id = ANY(${ids}::varchar[])`).catch(() => {});
        await db.execute(sql`UPDATE sessions SET visitor_id = NULL WHERE site_id = ${siteId} AND visitor_id = ANY(${ids}::varchar[])`).catch(() => {});
        const res = await db.delete(visitors).where(and(eq(visitors.site_id, siteId), lte(visitors.last_seen_at, cutoff)));
        deletedCount += (res as any).rowCount || 0;
      }
    }

    analyticsCache.invalidateSite(siteId);

    return reply.status(200).send({
      success: true,
      message: `Visitor data permanently deleted for project "${id}"`,
      deletedCount,
    });
  });
};
