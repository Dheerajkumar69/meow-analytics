import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase, projects, projectDomains, events, pageViews, visitors, sessions } from '@meow-analytics/database';
import {
  collectRequestSchema,
  normalizeDomain,
  normalizeIpForPrivacy,
  defaultGeoService,
  parseUserAgent,
  performanceIngestRequestSchema,
  classifyMetric,
  generatePerformanceId,
} from '@meow-analytics/shared';
import { getConfig } from '@meow-analytics/config';
import { requireAdminAuth } from '../plugins/auth.js';
import { analyticsCache, projectValidationCache } from '../lib/cache.js';
import { executeEventBatchIngestion } from '../lib/ingest-batch.js';
import { ingestionBuffer } from '../lib/ingestion-buffer.js';
import { eq, desc, sql } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractOriginHost(originHeader?: string): string | null {
  if (!originHeader) return null;
  try {
    return normalizeDomain(originHeader);
  } catch {
    return null;
  }
}

function matchesDomain(host: string, allowedDomain: string): boolean {
  const h = host.toLowerCase();
  const d = allowedDomain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

let cachedSdkJs: { content: string; etag: string; mtime: number } | null = null;

export const collectRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const db = getDatabase();

  // Flush buffer on server shutdown
  fastify.addHook('onClose', async () => {
    await ingestionBuffer.flush();
    ingestionBuffer.stop();
  });

  // --- Serve Browser SDK Script with In-Memory Caching and 304 Support ---
  fastify.get('/meow.js', async (request, reply) => {
    const sdkPath = path.resolve(__dirname, '../../../../packages/sdk/dist/meow.js');
    if (!fs.existsSync(sdkPath)) {
      return reply.status(404).send('// Meow Analytics SDK not built. Run npm run build.');
    }

    try {
      const stat = fs.statSync(sdkPath);
      if (!cachedSdkJs || cachedSdkJs.mtime !== stat.mtimeMs) {
        const content = fs.readFileSync(sdkPath, 'utf8');
        cachedSdkJs = {
          content,
          etag: `W/"${stat.size}-${stat.mtimeMs}"`,
          mtime: stat.mtimeMs,
        };
      }

      const clientEtag = request.headers['if-none-match'];
      if (clientEtag && clientEtag === cachedSdkJs.etag) {
        reply.header('ETag', cachedSdkJs.etag);
        reply.header('Cache-Control', 'public, max-age=3600');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.status(304).send();
      }

      reply.header('Content-Type', 'application/javascript; charset=utf-8');
      reply.header('Cache-Control', 'public, max-age=3600');
      reply.header('ETag', cachedSdkJs.etag);
      reply.header('Access-Control-Allow-Origin', '*');
      return reply.send(cachedSdkJs.content);
    } catch {
      return reply.status(500).send('// Error serving SDK');
    }
  });

  // --- Public Collector Endpoint ---
  fastify.post('/api/v1/collect', async (request, reply) => {
    // 1. Validate payload schema
    const body = request.body;
    const parseResult = collectRequestSchema.safeParse(body);

    if (!parseResult.success) {
      const message = parseResult.error.issues.map((i) => i.message).join('; ');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: message || 'Invalid event collection payload',
        },
      });
    }

    const { siteId, events: incomingEvents } = parseResult.data;

    // 2. Validate site ID exists and project is active (with fast in-memory validation cache)
    let project: any;
    let configuredDomains: { domain: string }[];

    const cachedProjectVal = projectValidationCache.get(siteId);
    if (cachedProjectVal) {
      project = cachedProjectVal.project;
      configuredDomains = cachedProjectVal.allowedDomains.map((d) => ({ domain: d }));
    } else {
      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.site_id, siteId))
        .limit(1);

      project = projectRows[0];
      if (!project || project.status !== 'active') {
        return reply.status(400).send({
          error: {
            code: 'INVALID_SITE_ID',
            message: `Site ID "${siteId}" does not exist or is not active`,
          },
        });
      }

      configuredDomains = await db
        .select({ domain: projectDomains.domain })
        .from(projectDomains)
        .where(eq(projectDomains.project_id, project.id));

      projectValidationCache.set(siteId, {
        project,
        allowedDomains: configuredDomains.map((d) => d.domain),
      });
    }

    // BUG-8 FIX: Removed redundant second project status check here.
    // The check at L127 already handles the non-cached path, and the cache
    // only stores validated active projects, so this second check was dead code.

    // 3. Hostname Normalization & Domain Validation
    for (const ev of incomingEvents) {
      try {
        ev.hostname = normalizeDomain(ev.hostname);
      } catch {
        return reply.status(400).send({
          error: {
            code: 'INVALID_HOSTNAME',
            message: `Invalid hostname format in event: "${ev.hostname}"`,
          },
        });
      }
    }


    if (configuredDomains.length > 0) {
      const allowedList = configuredDomains.map((d) => d.domain.toLowerCase());

      const originHeader = (request.headers.origin || request.headers.referer || '') as string;
      const originHost = extractOriginHost(originHeader);

      if (originHost && !allowedList.some((allowed) => matchesDomain(originHost, allowed))) {
        return reply.status(403).send({
          error: {
            code: 'DOMAIN_NOT_ALLOWED',
            message: `Request origin "${originHost}" is not authorized for project "${siteId}"`,
          },
        });
      }

      for (const ev of incomingEvents) {
        if (!allowedList.some((allowed) => matchesDomain(ev.hostname, allowed))) {
          return reply.status(403).send({
            error: {
              code: 'DOMAIN_NOT_ALLOWED',
              message: `Hostname "${ev.hostname}" is not authorized for project "${siteId}"`,
            },
          });
        }
      }
    }

    // 4. Server-Side Context & Privacy Mode Application
    // BUG-3 FIX: Use request.ip which Fastify resolves correctly via trustProxy:true.
    // Manual X-Forwarded-For parsing was spoofable; request.ip uses the rightmost
    // untrusted IP based on the configured trust proxy chain.
    const rawIp = request.ip || '127.0.0.1';
    const rawUserAgent = ((request.headers['user-agent'] || '').slice(0, 512) || 'unknown').trim();
    const originHeader = (((request.headers.origin || request.headers.referer || '') as string).slice(0, 255) || null);
    const meowSecret = getConfig().MEOW_SECRET;
    const privacyMode = (project as any).privacy_mode || 'balanced';

    // Resolve Geolocation server-side (Strict Privacy: NO RAW IP STORED IN DATABASE)
    const geo = await defaultGeoService.lookup(rawIp, request.headers as Record<string, string | string[] | undefined>);
    const countryCode = geo.countryCode || 'UNKNOWN';
    const countryName = geo.countryName || 'Unknown';
    // Strict mode drops region data
    const region = privacyMode === 'strict' ? null : (geo.region || null);

    // Resolve User-Agent, Device, OS, Browser & Bot status
    const clientContext = parseUserAgent(rawUserAgent);
    const { device: deviceType, os, browser, isBot } = clientContext;
    // Strict mode generalizes user agent to avoid fine-grained hardware strings
    const userAgent = privacyMode === 'strict' ? `${browser} on ${os}` : rawUserAgent;

    // 5. Ingestion Context & High-Performance Buffering
    const batchContext = {
      rawIp,
      rawUserAgent,
      originHeader,
      meowSecret,
      countryCode,
      countryName,
      region,
      deviceType,
      browser,
      os,
      isBot,
      userAgent,
      screenResolution: 'Unknown',
    };

    // Synchronous execution in test mode or when explicitly requested via header
    const isSyncMode =
      process.env.NODE_ENV === 'test' ||
      request.headers['x-meow-sync'] === 'true' ||
      process.env.ENABLE_INGESTION_BUFFER === 'false';

    if (isSyncMode) {
      const { ingested, duplicates } = await executeEventBatchIngestion(
        db,
        project,
        incomingEvents,
        batchContext
      );

      return reply.status(200).send({
        success: true,
        status: 'ok',
        ingested,
        duplicates,
      });
    }

    // High-performance asynchronous mode: Enqueue to in-memory buffer and return HTTP 202 in < 5ms
    ingestionBuffer.enqueue({
      siteId,
      project,
      events: incomingEvents,
      context: batchContext,
    }).catch((err) => {
      request.log.error(err, '[Collector] Background buffer ingestion failed');
    });

    return reply.status(202).send({
      success: true,
      status: 'ok',
      ingested: incomingEvents.length,
      duplicates: 0,
      queued: true,
    });
  });

  // --- Dedicated Performance Ingestion Endpoint (POST /api/v1/performance) ---
  fastify.post('/api/v1/performance', async (request, reply) => {
    const body = request.body;
    const parseResult = performanceIngestRequestSchema.safeParse(body);

    if (!parseResult.success) {
      const message = parseResult.error.issues.map((i) => i.message).join('; ');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: message || 'Invalid performance metric payload',
        },
      });
    }

    const { siteId, metrics } = parseResult.data;

    // Validate site ID exists and project is active (with cache)
    let project: any;
    const cachedProjectVal = projectValidationCache.get(siteId);
    if (cachedProjectVal) {
      project = cachedProjectVal.project;
    } else {
      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.site_id, siteId))
        .limit(1);

      project = projectRows[0];
      if (project && project.status === 'active') {
        const configuredDomains = await db
          .select({ domain: projectDomains.domain })
          .from(projectDomains)
          .where(eq(projectDomains.project_id, project.id));

        projectValidationCache.set(siteId, {
          project,
          allowedDomains: configuredDomains.map((d) => d.domain),
        });
      }
    }

    if (!project || project.status !== 'active') {
      return reply.status(400).send({
        error: {
          code: 'INVALID_SITE_ID',
          message: `Site ID "${siteId}" does not exist or is not active`,
        },
      });
    }

    // IP, Geo, and User-Agent parsing
    // BUG-3 FIX: Use request.ip (Fastify trustProxy resolves the real client IP).
    const rawIp = request.ip || '127.0.0.1';
    const geo = await defaultGeoService.lookup(rawIp, request.headers as Record<string, string | string[] | undefined>);
    const countryCode = geo.countryCode || 'Unknown';
    const countryName = geo.countryName || 'Unknown';

    const userAgentHeader = request.headers['user-agent'] || '';
    const clientInfo = parseUserAgent(userAgentHeader);
    const clientDevice = clientInfo.device || 'desktop';

    const ingested = await (db as any).transaction(async (tx: any) => {
      let txIngested = 0;
      for (const m of metrics) {
        const perfId = generatePerformanceId();
        const perfPath = m.path || '/';
        const evTimestamp = new Date(m.timestamp || Date.now());
        const deviceType = (m.device && m.device !== 'unknown') ? m.device : clientDevice;

        const lcp = typeof m.lcp === 'number' ? m.lcp : null;
        const inp = typeof m.inp === 'number' ? m.inp : null;
        const cls = typeof m.cls === 'number' ? m.cls : null;
        const fcp = typeof m.fcp === 'number' ? m.fcp : null;
        const ttfb = typeof m.ttfb === 'number' ? m.ttfb : null;

        const dns = typeof m.dns === 'number' ? m.dns : null;
        const connection = typeof m.connection === 'number' ? m.connection : null;
        const requestMs = typeof m.request === 'number' ? m.request : null;
        const responseMs = typeof m.response === 'number' ? m.response : null;
        const domLoading = typeof m.domLoading === 'number' ? m.domLoading : null;
        const pageLoad = typeof m.pageLoad === 'number' ? m.pageLoad : null;

        const sampleRate = typeof m.sampleRate === 'number' ? m.sampleRate : 1.0;

        const ratingLcp = classifyMetric('lcp', lcp);
        const ratingInp = classifyMetric('inp', inp);
        const ratingCls = classifyMetric('cls', cls);
        const ratingFcp = classifyMetric('fcp', fcp);
        const ratingTtfb = classifyMetric('ttfb', ttfb);

        await tx.execute(sql`
          INSERT INTO performance_metrics (
            id, site_id, path, device, country, country_name, visitor_id, session_id,
            timestamp, lcp, inp, cls, fcp, ttfb,
            dns_duration, connection_duration, request_duration, response_duration,
            dom_loading, page_load,
            rating_lcp, rating_inp, rating_cls, rating_fcp, rating_ttfb,
            sample_rate, created_at
          ) VALUES (
            ${perfId}, ${project.site_id}, ${perfPath}, ${deviceType}, ${countryCode}, ${countryName},
            ${m.visitorId || null}, ${m.sessionId || null}, ${evTimestamp},
            ${lcp}, ${inp}, ${cls}, ${fcp}, ${ttfb},
            ${dns}, ${connection}, ${requestMs}, ${responseMs},
            ${domLoading}, ${pageLoad},
            ${ratingLcp}, ${ratingInp}, ${ratingCls}, ${ratingFcp}, ${ratingTtfb},
            ${sampleRate}, NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `);

        txIngested++;
      }
      return txIngested;
    });

    // Invalidate any cached analytics queries for this siteId
    analyticsCache.invalidateSite(siteId);

    return reply.status(200).send({
      success: true,
      status: 'ok',
      ingested,
    });
  });

  // --- Project Inspection Routes (Admin Authenticated) ---

  fastify.get(
    '/api/v1/projects/:id/pageviews',
    { preHandler: [requireAdminAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);

      const project = projectRows[0];
      if (!project) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Project with ID ${id} not found`,
          },
        });
      }

      const query = request.query as any;
      const limit = Math.max(1, Math.min(parseInt(query?.limit, 10) || 100, 1000));
      const offset = Math.max(0, parseInt(query?.offset, 10) || 0);

      const rows = await db
        .select()
        .from(pageViews)
        .where(eq(pageViews.site_id, project.site_id))
        .orderBy(desc(pageViews.timestamp))
        .limit(limit)
        .offset(offset);

      return reply.send(rows);
    }
  );

  fastify.get(
    '/api/v1/projects/:id/events',
    { preHandler: [requireAdminAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);

      const project = projectRows[0];
      if (!project) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Project with ID ${id} not found`,
          },
        });
      }

      const query = request.query as any;
      const limit = Math.max(1, Math.min(parseInt(query?.limit, 10) || 100, 1000));
      const offset = Math.max(0, parseInt(query?.offset, 10) || 0);

      const rows = await db
        .select()
        .from(events)
        .where(eq(events.site_id, project.site_id))
        .orderBy(desc(events.timestamp))
        .limit(limit)
        .offset(offset);

      return reply.send(rows);
    }
  );

  fastify.get(
    '/api/v1/projects/:id/visitors',
    { preHandler: [requireAdminAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);

      const project = projectRows[0];
      if (!project) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Project with ID ${id} not found`,
          },
        });
      }

      const query = request.query as any;
      const limit = Math.max(1, Math.min(parseInt(query?.limit, 10) || 100, 1000));
      const offset = Math.max(0, parseInt(query?.offset, 10) || 0);

      const rows = await db
        .select()
        .from(visitors)
        .where(eq(visitors.site_id, project.site_id))
        .orderBy(desc(visitors.last_seen_at))
        .limit(limit)
        .offset(offset);

      return reply.send(rows);
    }
  );

  fastify.get(
    '/api/v1/projects/:id/sessions',
    { preHandler: [requireAdminAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);

      const project = projectRows[0];
      if (!project) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `Project with ID ${id} not found`,
          },
        });
      }

      const query = request.query as any;
      const limit = Math.max(1, Math.min(parseInt(query?.limit, 10) || 100, 1000));
      const offset = Math.max(0, parseInt(query?.offset, 10) || 0);

      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.site_id, project.site_id))
        .orderBy(desc(sessions.last_seen_at))
        .limit(limit)
        .offset(offset);

      return reply.send(rows);
    }
  );
};
