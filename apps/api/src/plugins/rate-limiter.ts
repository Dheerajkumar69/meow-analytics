import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { getConfig } from '@meow-analytics/config';

interface RateLimitBucket {
  timestamps: number[];
}

export interface RateLimiterOptions {
  windowMs?: number; // e.g. 60,000 ms (1 minute)
  maxPerIp?: number; // e.g. 120 req / window
  burstWindowMs?: number; // e.g. 1,000 ms (1 second)
  maxBurstPerIp?: number; // e.g. 30 req / burst window
  maxPerSite?: number; // e.g. 600 req / window on collect
}

const DEFAULT_OPTIONS: Required<RateLimiterOptions> = {
  windowMs: 60 * 1000,
  maxPerIp: 120,
  burstWindowMs: 1000,
  maxBurstPerIp: 30,
  maxPerSite: 600,
};

export const rateLimiterPlugin: FastifyPluginAsync<RateLimiterOptions> = fp(
  async (app: FastifyInstance, opts: RateLimiterOptions = {}) => {
    const config = getConfig();
    if (config.RATE_LIMIT_ENABLED === false) {
      return;
    }

    const settings = { ...DEFAULT_OPTIONS, ...opts };
    const ipWindows = new Map<string, RateLimitBucket>();
    const siteWindows = new Map<string, RateLimitBucket>();

    // Garbage collection timer every 30 seconds
    const gcInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - settings.windowMs;

      for (const [key, bucket] of ipWindows.entries()) {
        bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
        if (bucket.timestamps.length === 0) {
          ipWindows.delete(key);
        }
      }

      for (const [key, bucket] of siteWindows.entries()) {
        bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);
        if (bucket.timestamps.length === 0) {
          siteWindows.delete(key);
        }
      }
    }, 30 * 1000);

    app.addHook('onClose', (_instance, done) => {
      clearInterval(gcInterval);
      done();
    });

    app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      // Exclude health routes
      const url = request.url.split('?')[0] || request.url;
      if (url === '/api/health' || url === '/api/ready') {
        return;
      }

      const now = Date.now();

      // Resolve client IP
      const forwarded = request.headers['x-forwarded-for'];
      const ip =
        (typeof forwarded === 'string'
          ? forwarded.split(',')[0]?.trim()
          : Array.isArray(forwarded)
          ? forwarded[0]?.trim()
          : '') ||
        request.ip ||
        '127.0.0.1';

      // In test environment, exempt default local runner address (127.0.0.1) so synthetic in-memory batches
      // don't throttle unrelated unit tests, while enforcing on simulated client IPs (e.g. 198.51.100.42).
      if (config.NODE_ENV === 'test' && process.env.RATE_LIMIT_TEST_ALL !== 'true') {
        if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
          return;
        }
      }

      // 1. IP Rate Limiting & Burst Protection
      let ipBucket = ipWindows.get(ip);
      if (!ipBucket) {
        ipBucket = { timestamps: [] };
        ipWindows.set(ip, ipBucket);
      }

      // Filter to sliding window
      const windowCutoff = now - settings.windowMs;
      ipBucket.timestamps = ipBucket.timestamps.filter((ts) => ts > windowCutoff);

      // Check burst limit
      const burstCutoff = now - settings.burstWindowMs;
      const recentHits = ipBucket.timestamps.filter((ts) => ts > burstCutoff).length;
      if (recentHits >= settings.maxBurstPerIp) {
        reply.header('Retry-After', '1');
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests in a short interval (burst limit exceeded). Please retry shortly.',
          },
        });
      }

      // Check total window limit
      if (ipBucket.timestamps.length >= settings.maxPerIp) {
        const oldest = ipBucket.timestamps[0] || now;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldest + settings.windowMs - now) / 1000));
        reply.header('Retry-After', retryAfterSeconds.toString());
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Maximum ${settings.maxPerIp} requests per minute.`,
          },
        });
      }

      ipBucket.timestamps.push(now);

      // 2. Per-Site Rate Limiting for Ingestion
      if (url === '/api/v1/collect') {
        let siteId: string | undefined;
        // Check query or body if parsed
        if (typeof (request.query as any)?.siteId === 'string') {
          siteId = (request.query as any).siteId;
        } else if (typeof (request.body as any)?.siteId === 'string') {
          siteId = (request.body as any).siteId;
        }

        if (siteId) {
          let siteBucket = siteWindows.get(siteId);
          if (!siteBucket) {
            siteBucket = { timestamps: [] };
            siteWindows.set(siteId, siteBucket);
          }

          siteBucket.timestamps = siteBucket.timestamps.filter((ts) => ts > windowCutoff);
          if (siteBucket.timestamps.length >= settings.maxPerSite) {
            reply.header('Retry-After', '10');
            return reply.status(429).send({
              error: {
                code: 'SITE_RATE_LIMIT_EXCEEDED',
                message: `Ingestion rate limit exceeded for site "${siteId}". Maximum ${settings.maxPerSite} events per minute.`,
              },
            });
          }
          siteBucket.timestamps.push(now);
        }
      }
    });
  }
);
