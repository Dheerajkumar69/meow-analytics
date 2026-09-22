import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAdminAuth } from '../plugins/auth.js';
import {
  createDomainSchema,
  projectIdParamSchema,
  domainParamsSchema,
  generateDomainId,
} from '@meow-analytics/shared';
import { getDatabase, projects, projectDomains } from '@meow-analytics/database';
import { eq, and, ne } from 'drizzle-orm';
import { NotFoundError, ConflictError } from '../plugins/error-handler.js';

export const domainRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // All domain endpoints require admin authentication
  app.addHook('preHandler', requireAdminAuth);

  // Helper to ensure project exists and is not deleted
  async function assertActiveProject(projectId: string) {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), ne(projects.status, 'deleted')))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError(`Project with ID "${projectId}" was not found`);
    }
    return rows[0]!;
  }

  // POST /api/v1/projects/:id/domains
  app.post('/api/v1/projects/:id/domains', async (request, reply) => {
    const { id: projectId } = projectIdParamSchema.parse(request.params);
    const body = createDomainSchema.parse(request.body);

    await assertActiveProject(projectId);

    const db = getDatabase();

    // Check if domain is already added to this project
    const existing = await db
      .select()
      .from(projectDomains)
      .where(and(eq(projectDomains.project_id, projectId), eq(projectDomains.domain, body.domain)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(`Domain "${body.domain}" already exists for this project`);
    }

    const domainId = generateDomainId();
    const now = new Date();

    const newDomain = {
      id: domainId,
      project_id: projectId,
      domain: body.domain,
      verified: false,
      created_at: now,
    };

    await db.insert(projectDomains).values(newDomain);

    return reply.status(201).send({
      ...newDomain,
      created_at: newDomain.created_at.toISOString(),
    });
  });

  // GET /api/v1/projects/:id/domains
  app.get('/api/v1/projects/:id/domains', async (request, reply) => {
    const { id: projectId } = projectIdParamSchema.parse(request.params);
    await assertActiveProject(projectId);

    const db = getDatabase();
    const rows = await db
      .select()
      .from(projectDomains)
      .where(eq(projectDomains.project_id, projectId));

    const result = rows.map((d) => ({
      ...d,
      created_at: d.created_at.toISOString(),
    }));

    return reply.status(200).send(result);
  });

  // DELETE /api/v1/projects/:id/domains/:domainId
  app.delete('/api/v1/projects/:id/domains/:domainId', async (request, reply) => {
    const { id: projectId, domainId } = domainParamsSchema.parse(request.params);
    await assertActiveProject(projectId);

    const db = getDatabase();

    // Verify domain exists and belongs specifically to this project
    const rows = await db
      .select()
      .from(projectDomains)
      .where(and(eq(projectDomains.id, domainId), eq(projectDomains.project_id, projectId)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError(
        `Domain with ID "${domainId}" was not found on project "${projectId}"`
      );
    }

    await db
      .delete(projectDomains)
      .where(and(eq(projectDomains.id, domainId), eq(projectDomains.project_id, projectId)));

    return reply.status(200).send({
      success: true,
      message: `Domain "${domainId}" deleted successfully`,
    });
  });
};
