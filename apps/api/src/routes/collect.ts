import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getDatabase, projects, projectDomains, events, pageViews, visitors, sessions } from '@meow-analytics/database';
import {
  collectRequestSchema,
  normalizeDomain,
  generatePageViewId,
  generateVisitorInternalId,
  generateSessionInternalId,
  generateSessionId,
  computeVisitorFallbackHash,
  normalizeIpForPrivacy,
  defaultGeoService,
  parseUserAgent,
  parseReferrer,
  extractUtmParameters,
  normalizeLanguage,
  formatScreenResolution,
  createErrorGroup,
  performanceIngestRequestSchema,
  classifyMetric,
  generatePerformanceId,
  sanitizeEventProperties,
} from '@meow-analytics/shared';
import { getConfig } from '@meow-analytics/config';
import { requireAdminAuth } from '../plugins/auth.js';
import { analyticsCache, projectValidationCache } from '../lib/cache.js';
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

    // 5. Ingestion with Deduplication, Visitor Identity & Session Resolution (Wrapped in Transaction)
    const { ingested, duplicates } = await (db as any).transaction(async (tx: any) => {
      let txIngested = 0;
      let txDuplicates = 0;

      // In-batch resolution cache to avoid redundant roundtrips across events in the same batch
      const batchVisitors = new Map<string, { visitorDbId: string; firstSeenAt: Date }>();
      const batchSessions = new Map<string, { sessionId: string; isReturning: boolean }>();

      for (const ev of incomingEvents) {
        const evTimestamp = new Date(ev.timestamp);

        // Section 2 & 3: Configurable Referrer Classification
        const referrerInfo = parseReferrer(ev.referrer, ev.hostname);
        const referrerSource = referrerInfo.source;
        const referrerHostname = referrerInfo.referrerHostname;
        // Strict mode strips query strings and fragments from referrers
        const referrerUrl = privacyMode === 'strict'
          ? (referrerInfo.referrerUrl.split('?')[0]?.split('#')[0] || '')
          : referrerInfo.referrerUrl;

        // Section 4: UTM Tracking (Whitelisted utm_* only, never arbitrary params)
        const pathUtm = extractUtmParameters(ev.path);
        const utmSource = ev.utmSource || pathUtm.utm_source || null;
        const utmMedium = ev.utmMedium || pathUtm.utm_medium || null;
        const utmCampaign = ev.utmCampaign || pathUtm.utm_campaign || null;
        const utmTerm = ev.utmTerm || pathUtm.utm_term || null;
        const utmContent = ev.utmContent || pathUtm.utm_content || null;

        // Section 10 & 11: Display context (screen, language)
        // Strict mode hides screen resolution
        const screenResolution = privacyMode === 'strict'
          ? 'Unknown'
          : formatScreenResolution(ev.screenWidth, ev.screenHeight);
        const language = normalizeLanguage(ev.language || (request.headers['accept-language'] as string) || null);

        const eventName = (ev.eventName || ev.type).trim().slice(0, 128);
        const sanitizedProps = sanitizeEventProperties(ev.properties || {});
        const propertiesJson = JSON.stringify(sanitizedProps.properties);

        // --- 5A. Resolve Visitor Identity ---
        // In Strict mode: client cookies/storage are ignored, 24h rotating hash is enforced
        const rotationHours = (project as any).visitor_retention_hours || 24;
        let anonymousId: string;
        if (privacyMode === 'strict') {
          anonymousId = computeVisitorFallbackHash({
            ip: rawIp,
            userAgent: rawUserAgent,
            secret: meowSecret,
            siteId: project.site_id,
            timestamp: evTimestamp,
            rotationHours,
          });
        } else {
          anonymousId = ev.visitorId?.trim() || computeVisitorFallbackHash({
            ip: rawIp,
            userAgent: rawUserAgent,
            secret: meowSecret,
            siteId: project.site_id,
            timestamp: evTimestamp,
            rotationHours,
          });
        }

        let visitorDbId: string;
        const cachedVis = batchVisitors.get(anonymousId);
        if (cachedVis) {
          visitorDbId = cachedVis.visitorDbId;
        } else {
          // Atomic Visitor Upsert: Race-condition safe
          const newVisId = generateVisitorInternalId();
          const visitorResult = await tx.execute(sql`
            INSERT INTO visitors (
              id, site_id, anonymous_id, first_seen_at, last_seen_at,
              first_path, last_path, first_referrer, last_referrer, created_at
            ) VALUES (
              ${newVisId}, ${project.site_id}, ${anonymousId}, ${evTimestamp}, ${evTimestamp},
              ${ev.path}, ${ev.path}, ${ev.referrer || ''}, ${ev.referrer || ''}, NOW()
            )
            ON CONFLICT (site_id, anonymous_id) DO UPDATE SET
              last_seen_at = GREATEST(visitors.last_seen_at, EXCLUDED.last_seen_at),
              last_path = EXCLUDED.last_path,
              last_referrer = CASE WHEN EXCLUDED.last_referrer <> '' THEN EXCLUDED.last_referrer ELSE visitors.last_referrer END
            RETURNING id, first_seen_at, last_seen_at
          `);

          const visitorRow = visitorResult.rows[0] as any;
          visitorDbId = visitorRow.id;
          batchVisitors.set(anonymousId, { visitorDbId, firstSeenAt: new Date(visitorRow.first_seen_at) });
        }

        // --- 5B. Resolve Session & 30-Minute Inactivity Window ---
        let targetSessionId = ev.sessionId?.trim();
        let isReturning = false;

        const sessionCacheKey = targetSessionId ? `${visitorDbId}:${targetSessionId}` : '';
        const cachedSess = sessionCacheKey ? batchSessions.get(sessionCacheKey) : null;

        if (cachedSess) {
          targetSessionId = cachedSess.sessionId;
          isReturning = cachedSess.isReturning;
        } else {
          if (!targetSessionId) {
            const activeSessions = await tx.execute(sql`
              SELECT session_id, last_seen_at
              FROM sessions
              WHERE site_id = ${project.site_id} AND visitor_id = ${visitorDbId}
              ORDER BY last_seen_at DESC
              LIMIT 1
            `);

            if (activeSessions.rows.length > 0) {
              const lastActive = new Date((activeSessions.rows[0] as any).last_seen_at).getTime();
              if (evTimestamp.getTime() - lastActive <= SESSION_INACTIVITY_TIMEOUT_MS) {
                targetSessionId = (activeSessions.rows[0] as any).session_id;
              }
            }

            if (!targetSessionId) {
              targetSessionId = generateSessionId();
            }
          } else {
            // BUG-2 FIX: When the client sends a session ID that has expired (>30 min
            // inactivity), generate a brand-new session ID instead of mangling the old
            // one with a timestamp suffix. The old approach created orphan sessions because
            // the client would keep sending the old ID, causing every subsequent event to
            // produce a different mangled ID and a separate orphan session.
            const existingSession = await tx.execute(sql`
              SELECT session_id, last_seen_at
              FROM sessions
              WHERE site_id = ${project.site_id} AND session_id = ${targetSessionId}
              LIMIT 1
            `);

            if (existingSession.rows.length > 0) {
              const lastActive = new Date((existingSession.rows[0] as any).last_seen_at).getTime();
              if (evTimestamp.getTime() - lastActive > SESSION_INACTIVITY_TIMEOUT_MS) {
                targetSessionId = generateSessionId();
              }
            }
          }

          const priorSessions = await tx.execute(sql`
            SELECT 1
            FROM sessions
            WHERE site_id = ${project.site_id}
              AND visitor_id = ${visitorDbId}
              AND session_id <> ${targetSessionId}
            LIMIT 1
          `);
          isReturning = priorSessions.rows.length > 0;

          if (sessionCacheKey) {
            batchSessions.set(sessionCacheKey, {
              sessionId: targetSessionId,
              isReturning,
            });
          }
        }

        // --- 5C. Deduplication Insert into events with visitor_id & session_id ALREADY POPULATED ---
        const initialInsert = await tx.execute(sql`
          INSERT INTO events (
            event_id, site_id, type, event_name, properties, path, hostname, referrer,
            referrer_source, referrer_hostname, referrer_url,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            country_code, country_name, region,
            device_type, browser, os, language, screen_resolution, is_bot,
            user_agent, origin, visitor_id, session_id, timestamp, created_at
          ) VALUES (
            ${ev.eventId}, ${project.site_id}, ${ev.type}, ${eventName}, ${propertiesJson}, ${ev.path}, ${ev.hostname}, ${ev.referrer || ''},
            ${referrerSource}, ${referrerHostname}, ${referrerUrl},
            ${utmSource}, ${utmMedium}, ${utmCampaign}, ${utmTerm}, ${utmContent},
            ${countryCode}, ${countryName}, ${region},
            ${deviceType}, ${browser}, ${os}, ${language}, ${screenResolution}, ${isBot},
            ${userAgent}, ${originHeader}, ${visitorDbId}, ${targetSessionId}, ${evTimestamp}, NOW()
          )
          ON CONFLICT (event_id) DO NOTHING
          RETURNING event_id
        `);

        if (!initialInsert.rows || initialInsert.rows.length === 0) {
          txDuplicates++;
          continue;
        }

        // --- 5D. Upsert Session & Specific Event Tables (Only for non-duplicate events) ---
        const isPageView = ev.type === 'page_view';
        const isPing = ev.type === 'ping';
        const pvIncrement = isPageView ? 1 : 0;
        // BUG-23 FIX: Ping events are keep-alive signals; don't count them as interactions.
        const evIncrement = isPing ? 0 : 1;
        const newSesId = generateSessionInternalId();

        // BUG-12 FIX: Skip visitor/session upsert for confirmed bots.
        // Bot data is stored in events for audit purposes but should not
        // pollute the visitors/sessions tables with bot-generated records.
        if (!isBot) {
        await tx.execute(sql`
          INSERT INTO sessions (
            id, session_id, site_id, visitor_id, started_at, last_seen_at,
            landing_page, exit_page, page_views, event_count, is_bounce, duration_seconds, is_returning,
            referrer_source, referrer_hostname, referrer_url,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            country_code, country_name, region,
            device_type, browser, os, language, screen_resolution, is_bot, created_at
          ) VALUES (
            ${newSesId}, ${targetSessionId}, ${project.site_id}, ${visitorDbId}, ${evTimestamp}, ${evTimestamp},
            ${ev.path}, ${ev.path}, ${pvIncrement}, ${evIncrement},
            ${isPageView ? sql`TRUE` : sql`FALSE`},
            0, ${isReturning},
            ${referrerSource}, ${referrerHostname}, ${referrerUrl},
            ${utmSource}, ${utmMedium}, ${utmCampaign}, ${utmTerm}, ${utmContent},
            ${countryCode}, ${countryName}, ${region},
            ${deviceType}, ${browser}, ${os}, ${language}, ${screenResolution}, ${isBot}, NOW()
          )
          ON CONFLICT (site_id, session_id) DO UPDATE SET
            last_seen_at = GREATEST(sessions.last_seen_at, EXCLUDED.last_seen_at),
            exit_page = CASE WHEN EXCLUDED.exit_page <> '' THEN EXCLUDED.exit_page ELSE sessions.exit_page END,
            page_views = sessions.page_views + ${pvIncrement},
            event_count = sessions.event_count + ${evIncrement},
            -- BUG-1 FIX: A session is a bounce only when it has exactly 1 page_view total.
            -- We compute from the updated page_views value, not the EXCLUDED row, to avoid
            -- the old bug where pvIncrement=0 (custom event) incorrectly kept is_bounce=TRUE.
            is_bounce = (sessions.page_views + ${pvIncrement}) <= 1,
            duration_seconds = GREATEST(0, CAST(EXTRACT(EPOCH FROM (GREATEST(sessions.last_seen_at, EXCLUDED.last_seen_at) - sessions.started_at)) AS INTEGER))
        `);
        } // end !isBot guard

        // If page_view, insert into page_views table
        if (isPageView && !isBot) {
          const pageViewId = generatePageViewId();
          await tx.execute(sql`
            INSERT INTO page_views (
              id, event_id, site_id, visitor_id, session_id, path, hostname, referrer,
              referrer_source, referrer_hostname, referrer_url,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              country_code, country_name, region,
              device_type, browser, os, language, screen_resolution, is_bot,
              timestamp, created_at
            ) VALUES (
              ${pageViewId}, ${ev.eventId}, ${project.site_id}, ${visitorDbId}, ${targetSessionId},
              ${ev.path}, ${ev.hostname}, ${ev.referrer || ''},
              ${referrerSource}, ${referrerHostname}, ${referrerUrl},
              ${utmSource}, ${utmMedium}, ${utmCampaign}, ${utmTerm}, ${utmContent},
              ${countryCode}, ${countryName}, ${region},
              ${deviceType}, ${browser}, ${os}, ${language}, ${screenResolution}, ${isBot},
              ${evTimestamp}, NOW()
            )
            ON CONFLICT (event_id) DO NOTHING
          `);
        }

        // BUG-18 FIX: Use ev.type (the event type field) exclusively to decide which
        // specialised table to insert into. Previously, checking 'eventName === "error"'
        // caused any custom event named "error" (e.g. meowAnalytics.track("error", {...}))
        // to be double-inserted into error_events. The type field is set by the SDK and
        // reflects the actual event category, not the user-defined name.
        if (ev.type === 'error') {
          const errorProps = (ev.properties || {}) as Record<string, any>;
          const rawType = String(errorProps.errorType || 'Error');
          const rawMsg = String(errorProps.message || 'Unknown error');
          const errorGroup = createErrorGroup(rawType, rawMsg);
          const errorEventId = `err_${ev.eventId}`;

          await tx.execute(sql`
            INSERT INTO error_events (
              id, site_id, error_group, error_type, message, path,
              browser, os, visitor_id, session_id, timestamp, created_at
            ) VALUES (
              ${errorEventId}, ${project.site_id}, ${errorGroup}, ${rawType.slice(0, 128)}, ${rawMsg.slice(0, 1024)}, ${ev.path},
              ${browser}, ${os}, ${visitorDbId}, ${targetSessionId}, ${evTimestamp}, NOW()
            )
            ON CONFLICT (id) DO NOTHING
          `);
        }

        // If performance event, insert into performance_metrics table (Phase 7)
        // BUG-18 FIX: Same as above - use ev.type only.
        if (ev.type === 'performance') {
          const perfProps = (ev.properties || {}) as Record<string, any>;
          const perfId = `perf_${ev.eventId}`;
          const lcp = typeof perfProps.lcp === 'number' ? perfProps.lcp : null;
          const inp = typeof perfProps.inp === 'number' ? perfProps.inp : null;
          const cls = typeof perfProps.cls === 'number' ? perfProps.cls : null;
          const fcp = typeof perfProps.fcp === 'number' ? perfProps.fcp : null;
          const ttfb = typeof perfProps.ttfb === 'number' ? perfProps.ttfb : null;

          const dns = typeof perfProps.dns === 'number' ? perfProps.dns : null;
          const connection = typeof perfProps.connection === 'number' ? perfProps.connection : null;
          const requestMs = typeof perfProps.request === 'number' ? perfProps.request : null;
          const responseMs = typeof perfProps.response === 'number' ? perfProps.response : null;
          const domLoading = typeof perfProps.domLoading === 'number' ? perfProps.domLoading : null;
          const pageLoad = typeof perfProps.pageLoad === 'number' ? perfProps.pageLoad : null;

          const sampleRate = typeof perfProps.sampleRate === 'number' ? perfProps.sampleRate : 1.0;
          const perfDevice = (perfProps.device as string) || deviceType;

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
              ${perfId}, ${project.site_id}, ${ev.path}, ${perfDevice}, ${countryCode}, ${countryName},
              ${visitorDbId}, ${targetSessionId}, ${evTimestamp},
              ${lcp}, ${inp}, ${cls}, ${fcp}, ${ttfb},
              ${dns}, ${connection}, ${requestMs}, ${responseMs},
              ${domLoading}, ${pageLoad},
              ${ratingLcp}, ${ratingInp}, ${ratingCls}, ${ratingFcp}, ${ratingTtfb},
              ${sampleRate}, NOW()
            )
            ON CONFLICT (id) DO NOTHING
          `);
        }

        txIngested++;
      }

      return { ingested: txIngested, duplicates: txDuplicates };
    });

    // Invalidate any cached analytics queries for this siteId
    analyticsCache.invalidateSite(siteId);

    return reply.status(200).send({
      success: true,
      status: 'ok',
      ingested,
      duplicates,
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
