import { randomBytes } from 'node:crypto';

/**
 * Generate a random alphanumeric string of specified length using node crypto.
 */
export function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

export function generateProjectId(): string {
  return `prj_${generateRandomString(20)}`;
}

export function generateSiteId(): string {
  return `site_${generateRandomString(12)}`;
}

export function generateDomainId(): string {
  return `dom_${generateRandomString(20)}`;
}

export function generateApiKeyId(): string {
  return `key_${generateRandomString(20)}`;
}

export function generatePageViewId(): string {
  return `pv_${generateRandomString(20)}`;
}

export function generateVisitorId(): string {
  return `mv_${generateRandomString(24)}`;
}

export function generateSessionId(): string {
  return `ms_${generateRandomString(24)}`;
}

export function generateVisitorInternalId(): string {
  return `vis_${generateRandomString(20)}`;
}

export function generateSessionInternalId(): string {
  return `ses_${generateRandomString(20)}`;
}

export function generateId(prefix = 'id_'): string {
  return `${prefix}${generateRandomString(20)}`;
}

