export interface UtmParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

/**
 * Extracts and whitelists ONLY standard UTM parameters from a URL or query string.
 * Section 4 requirement: Do not store arbitrary query parameters.
 */
export function extractUtmParameters(rawUrlOrSearch?: string | null): UtmParameters {
  if (!rawUrlOrSearch) return {};

  const result: UtmParameters = {};

  try {
    let search = rawUrlOrSearch;
    if (search.includes('?')) {
      search = search.slice(search.indexOf('?') + 1);
    }
    if (search.includes('#')) {
      search = search.slice(0, search.indexOf('#'));
    }

    const params = new URLSearchParams(search);

    const source = params.get('utm_source')?.trim();
    const medium = params.get('utm_medium')?.trim();
    const campaign = params.get('utm_campaign')?.trim();
    const term = params.get('utm_term')?.trim();
    const content = params.get('utm_content')?.trim();

    if (source) result.utm_source = source.slice(0, 255);
    if (medium) result.utm_medium = medium.slice(0, 255);
    if (campaign) result.utm_campaign = campaign.slice(0, 255);
    if (term) result.utm_term = term.slice(0, 255);
    if (content) result.utm_content = content.slice(0, 255);
  } catch {
    // Malformed search string
  }

  return result;
}

/**
 * Normalizes navigator.language values.
 * e.g. "en-US,en;q=0.9" -> "en-US", "EN_us" -> "en-US", "fr" -> "fr".
 */
export function normalizeLanguage(lang?: string | null): string | null {
  if (!lang || !lang.trim()) return null;
  const primary = lang.split(',')[0]?.split(';')[0]?.trim() || '';
  if (!primary) return null;

  // Replace underscores with hyphens
  const formatted = primary.replace('_', '-');
  const parts = formatted.split('-');
  if (parts.length === 1) {
    return parts[0]!.toLowerCase();
  }
  if (parts.length >= 2) {
    return `${parts[0]!.toLowerCase()}-${parts[1]!.toUpperCase()}`;
  }
  return formatted.slice(0, 32);
}

/**
 * Formats screen width and height into a clean resolution string.
 * e.g. 1920, 1080 -> "1920x1080".
 */
export function formatScreenResolution(
  width?: number | null,
  height?: number | null
): string | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (width <= 0 || height <= 0) return null;
  return `${Math.round(width)}x${Math.round(height)}`;
}
