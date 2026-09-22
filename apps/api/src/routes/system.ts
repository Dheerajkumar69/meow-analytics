import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAdminAuth } from '../plugins/auth.js';
import { runRetentionCleanup, getCleanupCheckpoint } from '../lib/cleanup.js';
import { runHourlyAggregation, runDailyAggregation } from '../lib/aggregation.js';
import { getDatabase, cleanupCheckpoints } from '@meow-analytics/database';
import { desc } from 'drizzle-orm';

export const systemRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // All system endpoints require administrative authentication
  app.addHook('preHandler', requireAdminAuth);

  // POST /api/v1/system/cleanup — trigger scheduled retention cleanup
  app.post('/api/v1/system/cleanup', async (request, reply) => {
    const body = (request.body as any) || {};
    const batchSize = typeof body.batchSize === 'number' ? body.batchSize : undefined;

    const report = await runRetentionCleanup({ batchSize });
    return reply.status(200).send({
      success: true,
      message: 'Retention cleanup completed successfully',
      report,
    });
  });

  // POST /api/v1/system/aggregate — trigger aggregation
  app.post('/api/v1/system/aggregate', async (request, reply) => {
    const body = (request.body as any) || {};
    const siteId = typeof body.siteId === 'string' ? body.siteId : undefined;

    const hourly = await runHourlyAggregation({ siteId });
    const daily = await runDailyAggregation({ siteId });

    return reply.status(200).send({
      success: true,
      message: 'Aggregation completed successfully',
      stats: {
        hourlyAggregated: hourly,
        dailyAggregated: daily,
      },
    });
  });

  // GET /api/v1/system/cleanup/status — get checkpoint status
  app.get('/api/v1/system/cleanup/status', async (request, reply) => {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(cleanupCheckpoints)
      .orderBy(desc(cleanupCheckpoints.updated_at));

    return reply.status(200).send({
      checkpoints: rows.map((r) => ({
        job: r.job,
        status: r.status,
        lastProcessedId: r.last_processed_id,
        lastProcessedTimestamp: r.last_processed_timestamp
          ? r.last_processed_timestamp.toISOString()
          : null,
        startedAt: r.started_at ? r.started_at.toISOString() : null,
        updatedAt: r.updated_at.toISOString(),
      })),
    });
  });
};
