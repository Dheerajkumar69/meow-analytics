export interface ReferrerRule {
  source: string;
  match: (hostname: string, parsedUrl?: URL) => boolean;
}

export interface ReferrerParseResult {
  source: string;
  referrerHostname: string;
  referrerUrl: string;
}

export class ReferrerParser {
  private rules: ReferrerRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  /**
   * Register default classification rules for major search engines and social platforms.
   */
  private registerDefaultRules(): void {
    // 1. Google (search, news, app links)
    this.registerRule({
      source: 'Google',
      match: (host, url) => {
        if (/^(?:[a-z0-9-]+\.)?google\.(?:[a-z]{2,3}(?:\.[a-z]{2})?)$/i.test(host)) return true;
        if (host === 'news.google.com') return true;
        if (url && (url.protocol === 'android-app:' || url.href.includes('googlequicksearchbox'))) return true;
        return false;
      },
    });

    // 2. Bing
    this.registerRule({
      source: 'Bing',
      match: (host) => /^(?:[a-z0-9-]+\.)?bing\.(?:com|net)$/i.test(host),
    });

    // 3. YouTube
    this.registerRule({
      source: 'YouTube',
      match: (host) => /^(?:[a-z0-9-]+\.)?(?:youtube\.com|youtu\.be)$/i.test(host),
    });

    // 4. Reddit
    this.registerRule({
      source: 'Reddit',
      match: (host) => /^(?:[a-z0-9-]+\.)?(?:reddit\.com|redd\.it)$/i.test(host),
    });

    // 5. Facebook
    this.registerRule({
      source: 'Facebook',
      match: (host) => /^(?:[a-z0-9-]+\.)?(?:facebook\.com|fb\.com|fb\.watch)$/i.test(host),
    });

    // 6. Instagram
    this.registerRule({
      source: 'Instagram',
      match: (host) => /^(?:[a-z0-9-]+\.)?instagram\.com$/i.test(host),
    });

    // 7. X (formerly Twitter)
    this.registerRule({
      source: 'X',
      match: (host) => /^(?:[a-z0-9-]+\.)?(?:twitter\.com|x\.com|t\.co)$/i.test(host),
    });
  }

  /**
   * Allow dynamic registration of custom referrer source classification rules.
   */
  public registerRule(rule: ReferrerRule): void {
    this.rules.unshift(rule); // Prepend so custom rules can take precedence
  }

  /**
   * Parse a raw referrer string against registered rules and current host.
   */
  public parse(referrer?: string | null, currentHost?: string | null): ReferrerParseResult {
    const raw = (referrer || '').trim();

    // Section 3: If there is no usable referrer, classify as Direct.
    if (!raw) {
      return {
        source: 'Direct',
        referrerHostname: '',
        referrerUrl: '',
      };
    }

    let parsedUrl: URL | null = null;
    let hostname = '';

    try {
      parsedUrl = new URL(raw.startsWith('http') || raw.startsWith('android-app:') ? raw : `https://${raw}`);
      hostname = parsedUrl.hostname.toLowerCase();
    } catch {
      // Malformed referrer string
      return {
        source: 'Other',
        referrerHostname: '',
        referrerUrl: raw.slice(0, 2048),
      };
    }

    // Direct traffic / Internal navigation check:
    // If referrer hostname matches current host or same domain, it is internal / direct traffic
    if (currentHost) {
      const cleanCurrent = currentHost.toLowerCase().replace(/:\d+$/, '');
      if (hostname === cleanCurrent || hostname.endsWith(`.${cleanCurrent}`)) {
        return {
          source: 'Direct',
          referrerHostname: hostname,
          referrerUrl: raw.slice(0, 2048),
        };
      }
    }

    // Match against registered rules
    for (const rule of this.rules) {
      if (rule.match(hostname, parsedUrl)) {
        return {
          source: rule.source,
          referrerHostname: hostname,
          referrerUrl: raw.slice(0, 2048),
        };
      }
    }

    // Section 3: Do not classify every unknown request as direct without considering browser privacy behavior.
    // If it has a valid external hostname but did not match known sources, it is 'Other'.
    return {
      source: 'Other',
      referrerHostname: hostname,
      referrerUrl: raw.slice(0, 2048),
    };
  }
}

export const defaultReferrerParser = new ReferrerParser();

export function parseReferrer(referrer?: string | null, currentHost?: string | null): ReferrerParseResult {
  return defaultReferrerParser.parse(referrer, currentHost);
}
