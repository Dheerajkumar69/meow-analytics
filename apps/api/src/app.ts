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

  // Security Headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        // BUG-K FIX: connectSrc must include 'self' to allow the dashboard JS to call
        // the API when they share the same origin, and allow the analytics API endpoint
        // to be reachable from other origins via fetch (the CORS hook handles that separately).
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // BUG-K FIX: Unified public CORS handler for collection endpoints.
  // This runs as an onRequest hook (before route handlers) and is the sole
  // CORS authority for /api/v1/collect, /api/v1/performance, and /meow.js.
  // @fastify/cors below only covers dashboard/management routes.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0] || request.url;
    const isPublicEndpoint = url === '/api/v1/collect' || url === '/api/v1/performance' || url === '/meow.js';

    if (isPublicEndpoint) {
      const origin = request.headers.origin as string | undefined;
      // Reflect the specific origin for credentialed compatibility, or use * for anonymous tracking
      const allowOrigin = origin || '*';
      reply.header('Access-Control-Allow-Origin', allowOrigin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      reply.header('Vary', 'Origin');
      // No credentials — analytics payload is sent in body, not cookies

      if (request.method === 'OPTIONS') {
        reply.header('Access-Control-Max-Age', '86400');
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
