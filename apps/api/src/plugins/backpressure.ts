import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

export interface BackpressureOptions {
  maxConcurrentIngestion?: number; // e.g. 100 concurrent requests
  retryAfterSeconds?: number;
}

let activeIngestionRequests = 0;
let peakConcurrency = 0;
let totalShedRequests = 0;

export function getBackpressureStats() {
  return {
    activeIngestionRequests,
    peakConcurrency,
    totalShedRequests,
  };
}

export function resetBackpressureStats() {
  activeIngestionRequests = 0;
  peakConcurrency = 0;
  totalShedRequests = 0;
}

export const backpressurePlugin: FastifyPluginAsync<BackpressureOptions> = fp(
  async (app: FastifyInstance, opts: BackpressureOptions = {}) => {
    const maxConcurrent = opts.maxConcurrentIngestion ?? (
      process.env.MAX_CONCURRENT_INGESTION ? parseInt(process.env.MAX_CONCURRENT_INGESTION, 10) : 120
    );
    const retryAfter = opts.retryAfterSeconds ?? 3;

    app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      const url = request.url.split('?')[0] || request.url;
      const isIngestionRoute = url === '/api/v1/collect' || url === '/api/v1/performance';

      if (!isIngestionRoute) {
        return;
      }

      // Check current in-flight load against backpressure ceiling
      if (activeIngestionRequests >= maxConcurrent) {
        totalShedRequests++;
        reply.header('Retry-After', String(retryAfter));
        reply.header('X-Meow-Backpressure', 'active');
        return reply.status(503).send({
          error: {
            code: 'BACKPRESSURE_TRIGGERED',
            message: 'Server ingestion pipeline is at capacity. Please retry with exponential backoff.',
          },
        });
      }

      // Track active request
      activeIngestionRequests++;
      if (activeIngestionRequests > peakConcurrency) {
        peakConcurrency = activeIngestionRequests;
      }
      (request as any).__isIngestionTracked = true;
    });

    // Clean up counter on response completion
    app.addHook('onResponse', async (request: FastifyRequest) => {
      if ((request as any).__isIngestionTracked) {
        activeIngestionRequests = Math.max(0, activeIngestionRequests - 1);
        (request as any).__isIngestionTracked = false;
      }
    });

    // Clean up counter if error prevented onResponse from completing hook
    app.addHook('onError', async (request: FastifyRequest) => {
      if ((request as any).__isIngestionTracked) {
        activeIngestionRequests = Math.max(0, activeIngestionRequests - 1);
        (request as any).__isIngestionTracked = false;
      }
    });
  }
);
