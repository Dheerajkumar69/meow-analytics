// Meow Analytics — Event & Error Sanitization, Property Limits & Grouping

export const PROPERTY_LIMITS = {
  MAX_EVENT_NAME_LENGTH: 128,
  MAX_KEY_LENGTH: 64,
  MAX_VALUE_LENGTH: 512,
  MAX_PROPERTY_COUNT: 50,
  MAX_PAYLOAD_BYTES: 16 * 1024, // 16 KB
  MAX_NESTING_DEPTH: 2,
} as const;

// Common sensitive key name patterns (Section 4 & 14)
const SENSITIVE_KEY_REGEX =
  /(password|passwd|pass|token|secret|authorization|auth|cookie|session|bearer|apikey|api_key|access_token|refresh_token|credit_card|card_number|cvv|cvc|ssn|pin)/i;

const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Check if a key attempts prototype pollution.
 */
export function isPrototypePollutionKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  return PROTOTYPE_POLLUTION_KEYS.has(key.trim().toLowerCase());
}

// JWT or Bearer token regex
const SENSITIVE_VALUE_REGEX =
  /(^ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}|bearer\s+[a-z0-9._~+/-]+=*)/i;

/**
 * Check if a property key contains sensitive names or prototype pollution vectors.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (isPrototypePollutionKey(key)) return true;
  return SENSITIVE_KEY_REGEX.test(key);
}

/**
 * Check if a value appears to contain tokens or secrets.
 */
export function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return SENSITIVE_VALUE_REGEX.test(value);
}

/**
 * Sanitizes a cell value for safe CSV export:
 * - Neutralizes formula injection vulnerabilities (OWASP: values starting with =, +, -, @, \t, \r)
 * - Escapes double quotes
 * - Wraps in double quotes if string contains commas, quotes, or newlines
 */
export function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  let str = String(val);
  // Formula injection protection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface SanitizeResult {
  properties: Record<string, any>;
  hasSensitiveData: boolean;
  exceededLimits: boolean;
  errors: string[];
}

/**
 * Deeply sanitizes event properties:
 * - Drops sensitive keys (passwords, tokens, cookies, auth headers)
 * - Redacts sensitive values (JWTs, Bearer tokens)
 * - Enforces property key length (<= 64 chars)
 * - Enforces property value length (<= 512 chars for strings)
 * - Enforces max property count (<= 50)
 * - Enforces max nesting depth (<= 2)
 * - Enforces max payload size (<= 16 KB)
 */
export function sanitizeEventProperties(raw: unknown): SanitizeResult {
  const result: SanitizeResult = {
    properties: {},
    hasSensitiveData: false,
    exceededLimits: false,
    errors: [],
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }

  const entries = Object.entries(raw as Record<string, any>);
  if (entries.length > PROPERTY_LIMITS.MAX_PROPERTY_COUNT) {
    result.exceededLimits = true;
    result.errors.push(`Exceeded maximum property count of ${PROPERTY_LIMITS.MAX_PROPERTY_COUNT}`);
  }

  function processValue(val: any, currentDepth: number): any {
    if (val === null || val === undefined) {
      return null;
    }

    if (typeof val === 'string') {
      if (isSensitiveValue(val)) {
        result.hasSensitiveData = true;
        return '[REDACTED]';
      }
      return val.slice(0, PROPERTY_LIMITS.MAX_VALUE_LENGTH);
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      return val;
    }

    if (Array.isArray(val)) {
      if (currentDepth >= PROPERTY_LIMITS.MAX_NESTING_DEPTH) {
        return undefined; // Drop arrays exceeding depth
      }
      return val
        .slice(0, 20)
        .map((item) => (typeof item === 'object' ? null : processValue(item, currentDepth + 1)))
        .filter((item) => item !== undefined);
    }

    if (typeof val === 'object') {
      if (currentDepth >= PROPERTY_LIMITS.MAX_NESTING_DEPTH) {
        return undefined; // Drop objects exceeding max nesting depth
      }

      const nestedObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        if (isSensitiveKey(k)) {
          result.hasSensitiveData = true;
          continue;
        }
        const cleanK = k.trim().slice(0, PROPERTY_LIMITS.MAX_KEY_LENGTH);
        if (!cleanK) continue;

        const processed = processValue(v, currentDepth + 1);
        if (processed !== undefined) {
          nestedObj[cleanK] = processed;
        }
      }
      return nestedObj;
    }

    return undefined;
  }

  let count = 0;
  for (const [key, val] of entries) {
    if (count >= PROPERTY_LIMITS.MAX_PROPERTY_COUNT) {
      break;
    }

    if (isSensitiveKey(key)) {
      result.hasSensitiveData = true;
      continue;
    }

    const cleanKey = key.trim().slice(0, PROPERTY_LIMITS.MAX_KEY_LENGTH);
    if (!cleanKey) continue;

    const processed = processValue(val, 1);
    if (processed !== undefined) {
      result.properties[cleanKey] = processed;
      count++;
    }
  }

  // Check payload size
  try {
    const serialized = JSON.stringify(result.properties);
    if (serialized && serialized.length > PROPERTY_LIMITS.MAX_PAYLOAD_BYTES) {
      result.exceededLimits = true;
      result.errors.push(`Properties payload exceeded ${PROPERTY_LIMITS.MAX_PAYLOAD_BYTES} bytes`);
    }
  } catch {
    result.properties = {};
  }

  return result;
}

/**
 * Normalizes error messages to enable grouping similar errors (Section 13).
 * Examples:
 * "Cannot read properties of undefined (reading 'foo') at line 123" ->
 * "Cannot read properties of undefined (reading 'foo')"
 */
export function normalizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return 'Unknown error';

  let cleaned = msg.trim();

  // Strip query parameters from any URLs or relative paths (e.g. ?token=..., ?v=...)
  cleaned = cleaned.replace(/\?[^\s)]+/g, '');

  // Strip " at ..." stack trace suffixes (e.g. " at /assets/app.js:42:15", " at Object.render")
  cleaned = cleaned.replace(/\s+at\s+.*$/i, '');

  // Strip line and column numbers like :12:34 or line 42
  cleaned = cleaned.replace(/:\d+:\d+/g, '');
  cleaned = cleaned.replace(/\bline \d+\b/gi, '');

  // Strip memory addresses (0x...)
  cleaned = cleaned.replace(/0x[0-9a-fA-F]+/g, '0x...');

  // Strip UUIDs / GUIDs
  cleaned = cleaned.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');

  // Strip hex hashes (> 16 chars) or build chunk hashes
  cleaned = cleaned.replace(/-[0-9a-fA-F]{8,}\./g, '.');
  cleaned = cleaned.replace(/\b[0-9a-fA-F]{16,}\b/g, '<hash>');

  // Normalize excessive whitespaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned.slice(0, 255);
}

/**
 * Formats a consistent grouping key for errors.
 * Example: "TypeError: Cannot read properties of undefined (reading 'foo')"
 */
export function createErrorGroup(errorType: string, message: string): string {
  const type = (errorType || 'Error').trim().slice(0, 64);
  const normalizedMsg = normalizeErrorMessage(message);
  return `${type}: ${normalizedMsg}`.slice(0, 255);
}
