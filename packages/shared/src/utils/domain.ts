/**
 * Domain normalization and validation utilities.
 */

const HOSTNAME_REGEX =
  /^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})$/i;

export function normalizeDomain(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Domain must be a string');
  }

  let cleaned = input.trim().toLowerCase();

  if (cleaned.length === 0) {
    throw new Error('Domain cannot be empty');
  }

  if (cleaned.length > 253) {
    throw new Error('Domain cannot exceed 253 characters');
  }

  // Remove protocol if present (http://, https://, or //)
  cleaned = cleaned.replace(/^(?:https?:)?\/\//i, '');

  // Remove any auth (user:pass@)
  if (cleaned.includes('@')) {
    cleaned = cleaned.split('@').pop() || '';
  }

  // Remove path, query string, and fragments
  cleaned = cleaned.split(/[/?#]/)[0] ?? '';

  // Remove port if present (e.g., example.com:443 or localhost:3000)
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    cleaned = parts[0] ?? '';
  }

  // Strip trailing dot if present (FQDN)
  if (cleaned.endsWith('.')) {
    cleaned = cleaned.slice(0, -1);
  }

  if (!isValidDomain(cleaned)) {
    throw new Error(`Invalid domain name: "${input}"`);
  }

  return cleaned;
}

export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string' || domain.length > 253) {
    return false;
  }
  return HOSTNAME_REGEX.test(domain);
}
