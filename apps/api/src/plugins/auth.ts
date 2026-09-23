import { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { getConfig } from '@meow-analytics/config';
import { getDatabase, apiKeys, projects } from '@meow-analytics/database';
import { hashApiKey } from '@meow-analytics/shared';
import { eq, sql } from 'drizzle-orm';
import { UnauthorizedError, ForbiddenError, NotFoundError } from './error-handler.js';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Extract auth token from Authorization header or custom headers.
 */
function extractToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization;
  const customAdminHeader = request.headers['x-admin-secret'];
  const customApiKeyHeader = request.headers['x-api-key'];

  if (typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer') {
      return parts[1];
    }
    return authHeader;
  } else if (typeof customAdminHeader === 'string') {
    return customAdminHeader;
  } else if (typeof customApiKeyHeader === 'string') {
    return customApiKeyHeader;
  }
  return undefined;
}

/**
 * Pre-handler hook to authenticate admin dashboard API requests.
 */
export async function requireAdminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const config = getConfig();
  const adminSecret = config.ADMIN_SECRET;
  const token = extractToken(request);

  if (!token || !safeCompare(token, adminSecret)) {
    throw new UnauthorizedError('Invalid or missing admin credentials');
  }
}

/**
 * Pre-handler hook to authenticate project-level access.
 * Accepts:
 * 1. Admin secret (access to all projects)
 * 2. Valid, non-revoked project API key (access strictly to authorized project)
 */
export async function requireProjectAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const config = getConfig();
  const token = extractToken(request);

  if (!token) {
    throw new UnauthorizedError('Authentication credentials required');
  }

  // Check superadmin secret first
  if (safeCompare(token, config.ADMIN_SECRET)) {
    (request as any).auth = { type: 'admin' };
    return;
  }

  // Check API Key
  if (token.startsWith('mk_live_')) {
    const db = getDatabase();
    const computedHash = hashApiKey(token);

    const keyRows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key_hash, computedHash))
      .limit(1);

    if (keyRows.length === 0) {
      throw new UnauthorizedError('Invalid API key');
    }

    const keyRow = keyRows[0]!;
    if (keyRow.revoked_at !== null) {
      throw new UnauthorizedError('API key has been revoked');
    }

    // Determine target project identifier from params, query, or body
    const targetIdentifier =
      (request.params as any)?.id ||
      (request.query as any)?.siteId ||
      (request.query as any)?.projectId ||
      (request.body as any)?.siteId;

    if (targetIdentifier) {
      const projRows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(sql`${projects.id} = ${targetIdentifier} OR ${projects.site_id} = ${targetIdentifier}`)
        .limit(1);

      if (projRows.length === 0) {
        throw new NotFoundError(`Project "${targetIdentifier}" not found`);
      }

      if (projRows[0]!.id !== keyRow.project_id) {
        throw new ForbiddenError(`API key is not authorized for project "${targetIdentifier}"`);
      }
    }

    // Update last_used_at
    await db
      .update(apiKeys)
      .set({ last_used_at: new Date() })
      .where(eq(apiKeys.id, keyRow.id))
      .catch(() => {});

    (request as any).auth = { type: 'api_key', projectId: keyRow.project_id, keyId: keyRow.id };
    return;
  }

  throw new UnauthorizedError('Invalid authentication credentials');
}

/**
 * Pre-handler hook for analytics queries.
 * If any auth credentials are provided, they are strictly validated.
 * If no credentials are provided:
 *   - In production (NODE_ENV=production), access is DENIED unless ALLOW_PUBLIC_ANALYTICS=true
 *   - If ENFORCE_ANALYTICS_AUTH=true, access is always DENIED without credentials
 *   - Otherwise (development), access is allowed for convenience
 *
 * BUG-9 FIX: Previously, analytics data was publicly readable without configuration.
 * Now production environments are secure by default.
 */
export async function requireAnalyticsAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractToken(request);

  // If credentials are provided, always validate them strictly
  if (token) {
    return requireProjectAuth(request, reply);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const enforceAuth = process.env.ENFORCE_ANALYTICS_AUTH === 'true';
  const allowPublic = process.env.ALLOW_PUBLIC_ANALYTICS === 'true';

  // Block unauthenticated requests in production or when explicitly enforced,
  // unless the operator has opted-in to public analytics access.
  if ((isProduction || enforceAuth) && !allowPublic) {
    throw new UnauthorizedError('Authentication credentials required to access analytics. Set ALLOW_PUBLIC_ANALYTICS=true to disable this check.');
  }
}

