import {
  generatePageViewId,
  generateVisitorInternalId,
  generateSessionInternalId,
  generateSessionId,
  computeVisitorFallbackHash,
  parseReferrer,
  extractUtmParameters,
  normalizeLanguage,
  formatScreenResolution,
  createErrorGroup,
  classifyMetric,
  sanitizeEventProperties,
} from '@meow-analytics/shared';
import { sql } from 'drizzle-orm';
import { analyticsCache } from './cache.js';

const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface IngestionBatchContext {
  rawIp: string;
  rawUserAgent: string;
  originHeader: string | null;
  meowSecret: string;
  countryCode: string;
  countryName: string;
  region: string | null;
  deviceType: string;
  browser: string;
  os: string;
  isBot: boolean;
  userAgent: string;
  screenResolution: string;
}

export async function executeEventBatchIngestion(
  db: any,
  project: any,
  incomingEvents: any[],
  context: IngestionBatchContext
): Promise<{ ingested: number; duplicates: number }> {
  const {
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
    screenResolution,
  } = context;

  const privacyMode = project.privacy_mode || 'balanced';

  const result = await db.transaction(async (tx: any) => {
    let txIngested = 0;
    let txDuplicates = 0;

    const batchVisitors = new Map<string, { visitorDbId: string; firstSeenAt: Date }>();
    const batchSessions = new Map<string, { sessionId: string; isReturning: boolean }>();

    for (const ev of incomingEvents) {
      const evTimestamp = new Date(ev.timestamp);

      const referrerInfo = parseReferrer(ev.referrer, ev.hostname);
      const referrerSource = referrerInfo.source;
      const referrerHostname = referrerInfo.referrerHostname;
      const referrerUrl = privacyMode === 'strict'
        ? (referrerInfo.referrerUrl.split('?')[0]?.split('#')[0] || '')
        : referrerInfo.referrerUrl;

      const pathUtm = extractUtmParameters(ev.path);
      const utmSource = ev.utmSource || pathUtm.utm_source || null;
      const utmMedium = ev.utmMedium || pathUtm.utm_medium || null;
      const utmCampaign = ev.utmCampaign || pathUtm.utm_campaign || null;
      const utmTerm = ev.utmTerm || pathUtm.utm_term || null;
      const utmContent = ev.utmContent || pathUtm.utm_content || null;

      const eventScreenRes = privacyMode === 'strict'
        ? 'Unknown'
        : (ev.screenWidth && ev.screenHeight ? formatScreenResolution(ev.screenWidth, ev.screenHeight) : screenResolution);

      const language = normalizeLanguage(ev.language || null);
      const eventName = (ev.eventName || ev.type).trim().slice(0, 128);
      const sanitizedProps = sanitizeEventProperties(ev.properties || {});
      const propertiesJson = JSON.stringify(sanitizedProps.properties);

      // 1. Visitor Identity Resolution
      const rotationHours = project.visitor_retention_hours || 24;
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

      // 2. Session Resolution
      let targetSessionId = ev.sessionId?.trim();
      let isReturning = false;

      const sessionCacheKey = targetSessionId
        ? `${visitorDbId}:${targetSessionId}`
        : `visitor:${visitorDbId}`;
      const cachedSess = batchSessions.get(sessionCacheKey);

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

        batchSessions.set(sessionCacheKey, {
          sessionId: targetSessionId,
          isReturning,
        });
      }

      // 3. Deduplication Insert into events
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
          ${deviceType}, ${browser}, ${os}, ${language}, ${eventScreenRes}, ${isBot},
          ${userAgent}, ${originHeader}, ${visitorDbId}, ${targetSessionId}, ${evTimestamp}, NOW()
        )
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `);

      if (!initialInsert.rows || initialInsert.rows.length === 0) {
        txDuplicates++;
        continue;
      }

      // 4. Upsert Session & Specific Event Tables
      const isPageView = ev.type === 'page_view';
      const isPing = ev.type === 'ping';
      const pvIncrement = isPageView ? 1 : 0;
      const evIncrement = isPing ? 0 : 1;
      const newSesId = generateSessionInternalId();

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
            ${deviceType}, ${browser}, ${os}, ${language}, ${eventScreenRes}, ${isBot}, NOW()
          )
          ON CONFLICT (site_id, session_id) DO UPDATE SET
            last_seen_at = GREATEST(sessions.last_seen_at, EXCLUDED.last_seen_at),
            exit_page = CASE WHEN EXCLUDED.exit_page <> '' THEN EXCLUDED.exit_page ELSE sessions.exit_page END,
            page_views = sessions.page_views + ${pvIncrement},
            event_count = sessions.event_count + ${evIncrement},
            is_bounce = (sessions.page_views + ${pvIncrement}) <= 1,
            duration_seconds = GREATEST(0, CAST(EXTRACT(EPOCH FROM (GREATEST(sessions.last_seen_at, EXCLUDED.last_seen_at) - sessions.started_at)) AS INTEGER))
        `);
      }

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
            ${deviceType}, ${browser}, ${os}, ${language}, ${eventScreenRes}, ${isBot},
            ${evTimestamp}, NOW()
          )
          ON CONFLICT (event_id) DO NOTHING
        `);
      }

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

  // Invalidate query cache for this site when new events are committed
  analyticsCache.invalidateSite(project.site_id);

  return result;
}
