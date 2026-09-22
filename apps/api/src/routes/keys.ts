import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAdminAuth } from '../plugins/auth.js';
import {
  createApiKeySchema,
  projectIdParamSchema,
  keyParamsSchema,
  generateApiKeyId,
  generateApiKey,
} from '@meow-analytics/shared';
import { getDatabase, projects, apiKeys } from '@meow-analytics/database';
import { eq, and, ne, desc } from 'drizzle-orm';
import { NotFoundError } from '../plugins/error-handler.js';

export const keyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // All API key endpoints require admin authentication
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

  // POST /api/v1/projects/:id/keys
  app.post('/api/v1/projects/:id/keys', async (request, reply) => {
    const { id: projectId } = projectIdParamSchema.parse(request.params);
    const body = createApiKeySchema.parse(request.body);

    await assertActiveProject(projectId);

    const db = getDatabase();
    const keyId = generateApiKeyId();
    const { key, keyPrefix, keyHash } = generateApiKey();
    const now = new Date();

    // Store ONLY the hash and prefix in the database — never plaintext secret!
    await db.insert(apiKeys).values({
      id: keyId,
      project_id: projectId,
      name: body.name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      created_at: now,
    });

    // Return the secret key EXACTLY ONCE upon creation
    return reply.status(201).send({
      id: keyId,
      project_id: projectId,
      name: body.name,
      key, // Returned ONLY here!
      key_prefix: keyPrefix,
      created_at: now.toISOString(),
    });
  });

  // GET /api/v1/projects/:id/keys
  app.get('/api/v1/projects/:id/keys', async (request, reply) => {
    const { id: projectId } = projectIdParamSchema.parse(request.params);
    await assertActiveProject(projectId);

    const db = getDatabase();
    // Exclude key_hash from selection to guarantee no secrets or hashes leak
    const rows = await db
      .select({
        id: apiKeys.id,
        project_id: apiKeys.project_id,
        name: apiKeys.name,
        key_prefix: apiKeys.key_prefix,
        created_at: apiKeys.created_at,
        last_used_at: apiKeys.last_used_at,
        revoked_at: apiKeys.revoked_at,
      })
      .from(apiKeys)
      .where(eq(apiKeys.project_id, projectId))
      .orderBy(desc(apiKeys.created_at));

    const result = rows.map((k) => ({
      ...k,
      created_at: k.created_at.toISOString(),
      last_used_at: k.last_used_at ? k.last_used_at.toISOString() : null,
      revoked_at: k.revoked_at ? k.revoked_at.toISOString() : null,
    }));

    return reply.status(200).send(result);
  });

  // DELETE /api/v1/projects/:id/keys/:keyId
  app.delete('/api/v1/projects/:id/keys/:keyId', async (request, reply) => {
    const { id: projectId, keyId } = keyParamsSchema.parse(request.params);
    await assertActiveProject(projectId);

    const db = getDatabase();

    // Verify key exists and belongs specifically to this project
    const rows = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.project_id, projectId)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundError(`API key with ID "${keyId}" was not found on project "${projectId}"`);
    }

    // Revoke key
    await db
      .update(apiKeys)
      .set({ revoked_at: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.project_id, projectId)));

    return reply.status(200).send({
      success: true,
      message: `API key "${keyId}" revoked successfully`,
    });
  });
};
