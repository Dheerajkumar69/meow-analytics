import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { checkDatabaseHealth } from '@meow-analytics/database';
import { getConfig } from '@meow-analytics/config';

export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Liveness check: Is the API process up and running?
  app.get('/api/health', async (request, reply) => {
    return reply.status(200).send({
      status: 'ok',
    });
  });

  // Readiness check: Are critical dependencies (database, config) operational?
  app.get('/api/ready', async (request, reply) => {
    try {
      // 1. Verify configuration integrity
      getConfig();

      // 2. Verify database connectivity
      const isDbHealthy = await checkDatabaseHealth();

      if (!isDbHealthy) {
        return reply.status(503).send({
          status: 'error',
          database: 'disconnected',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.status(200).send({
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      request.log.error({ err }, 'Readiness check failed');
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  });
};
