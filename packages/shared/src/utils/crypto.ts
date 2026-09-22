import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface GeneratedKey {
  key: string;
  keyPrefix: string;
  keyHash: string;
}

export const API_KEY_PREFIX = 'mk_live_';

/**
 * Generates a cryptographically random API key, its display prefix, and its SHA-256 hash.
 */
export function generateApiKey(prefix = API_KEY_PREFIX): GeneratedKey {
  const secretBytes = randomBytes(24).toString('hex');
  const key = `${prefix}${secretBytes}`;
  const keyPrefix = key.slice(0, 16); // e.g. mk_live_3f92a10b
  const keyHash = hashApiKey(key);

  return {
    key,
    keyPrefix,
    keyHash,
  };
}

/**
 * Hashes an API key using SHA-256.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Constant-time comparison between a provided key and a stored hash.
 */
export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  const computedHash = hashApiKey(rawKey);
  const a = Buffer.from(computedHash, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Normalizes an IP address for privacy calculations (strips ports, trims, standardizes localhost).
 */
export function normalizeIpForPrivacy(rawIp?: string | null): string {
  if (!rawIp) return '127.0.0.1';
  let ip = rawIp.trim();
  // Strip IPv6-mapped IPv4 prefix if present
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  // Strip port if present in IPv4 (e.g. 192.168.1.1:54321)
  if (ip.includes(':') && !ip.includes('::') && ip.split(':').length === 2) {
    ip = ip.split(':')[0]!;
  }
  return ip.toLowerCase();
}

export interface VisitorFallbackOptions {
  ip?: string | null;
  userAgent?: string | null;
  secret: string;
  siteId: string;
  timestamp?: number | Date;
  rotationHours?: number; // default 24
}

/**
 * Computes a privacy-preserving first-party anonymous fallback identifier.
 * Uses HMAC-SHA256(secret, normalizedIP + userAgent + rotatingTimeBucket + siteId).
 * Automatically rotates every 24 hours (or configured hours).
 * Never returns or stores the raw IP.
 */
export function computeVisitorFallbackHash(options: VisitorFallbackOptions): string {
  const normalizedIp = normalizeIpForPrivacy(options.ip);
  const ua = (options.userAgent || 'unknown').trim().toLowerCase().slice(0, 512);
  const rotationHours = options.rotationHours && options.rotationHours > 0 ? options.rotationHours : 24;
  const timeMs = options.timestamp
    ? options.timestamp instanceof Date
      ? options.timestamp.getTime()
      : options.timestamp
    : Date.now();
  const timeBucket = Math.floor(timeMs / (rotationHours * 3600 * 1000));

  const payload = `${normalizedIp}|${ua}|${timeBucket}|${options.siteId}`;
  const hmac = createHmac('sha256', options.secret).update(payload).digest('hex');
  return `mv_s_${hmac.slice(0, 24)}`;
}
