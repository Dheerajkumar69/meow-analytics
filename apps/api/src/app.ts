import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { getConfig } from '@meow-analytics/config';
import { registerErrorHandler } from './plugins/error-handler.js';
import { structuredLoggerPlugin } from './plugins/logger.js';
import { rateLimiterPlugin } from './plugins/rate-limiter.js';
import { backpressurePlugin } from './plugins/backpressure.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { domainRoutes } from './routes/domains.js';
import { keyRoutes } from './routes/keys.js';
import { collectRoutes } from './routes/collect.js';
import { analyticsRoutes } from './routes/analytics.js';
import { exportRoutes } from './routes/export.js';
import { systemRoutes } from './routes/system.js';

export async function buildApp(opts: FastifyServerOptions = {}): Promise<FastifyInstance> {
  const config = getConfig();

  const app = Fastify({
    logger: opts.logger !== undefined ? opts.logger : (config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL }),
    trustProxy: true,
    bodyLimit: 64 * 1024, // 64 KB payload size limit
    ...opts,
  });

  // Security Headers (Section 9)
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // Support public cross-origin collection while strictly gating dashboard APIs
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0] || request.url;
    const origin = request.headers.origin as string | undefined;

    if (origin && (url === '/api/v1/collect' || url === '/api/v1/performance' || url === '/meow.js')) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-admin-secret');
      // BUG-13 FIX: Removed Access-Control-Allow-Credentials:true from collect/performance
      // endpoints. Analytics event ingestion doesn't require credentialed cross-origin
      // requests — the SDK sends visitor IDs in the payload body, not as cookies.
      // Credentials:true with a reflected origin is an unnecessarily broad security posture.

      if (request.method === 'OPTIONS') {
        return reply.status(204).send();
      }
    }
  });

  // CORS Configuration for Dashboard & Management APIs (Section 13)
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        return cb(null, true);
      }
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      // Reject unauthorized origins for dashboard & management endpoints
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Rate Limiting & Backpressure (Spike protection, queue limits, DB protection)
  await app.register(rateLimiterPlugin);
  await app.register(backpressurePlugin);

  // Support text/plain payloads for navigator.sendBeacon
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  // Centralized Error Handling & Structured Logging
  registerErrorHandler(app);
  await app.register(structuredLoggerPlugin);

  // Register Routes
  await app.register(healthRoutes);
  await app.register(projectRoutes);
  await app.register(domainRoutes);
  await app.register(keyRoutes);
  await app.register(collectRoutes);
  await app.register(analyticsRoutes);
  await app.register(exportRoutes);
  await app.register(systemRoutes);

  return app;
}
