import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export const structuredLoggerPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  // Store start time on request
  app.addHook('onRequest', async (request) => {
    (request as any).startTime = process.hrtime.bigint();
  });

  // Log on response completion
  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime as bigint | undefined;
    let duration = 0;
    if (startTime) {
      const diffNs = process.hrtime.bigint() - startTime;
      duration = Number(diffNs) / 1_000_000; // milliseconds
    }

    // Clean, structured log avoiding secrets, cookies, auth headers, and raw IPs
    const logData = {
      requestId: request.id,
      method: request.method,
      path: request.url.split('?')[0] || request.url,
      status: reply.statusCode,
      duration: Math.round(duration * 100) / 100, // rounded to 2 decimals
    };

    if (reply.statusCode >= 500) {
      request.log.error(logData, 'Request completed with server error');
    } else if (reply.statusCode >= 400) {
      request.log.warn(logData, 'Request completed with client error');
    } else {
      request.log.info(logData, 'Request completed successfully');
    }
  });
});
