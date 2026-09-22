export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

export type OperatingSystem =
  | 'Windows'
  | 'macOS'
  | 'Linux'
  | 'Android'
  | 'iOS'
  | 'ChromeOS'
  | 'Other'
  | 'Unknown';

export type BrowserName =
  | 'Chrome'
  | 'Firefox'
  | 'Safari'
  | 'Edge'
  | 'Opera'
  | 'Samsung Internet'
  | 'Brave'
  | 'Other'
  | 'Unknown';

export interface UserAgentParseResult {
  device: DeviceType;
  os: OperatingSystem;
  browser: BrowserName;
  isBot: boolean;
  botName?: string;
}

const BOT_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'Googlebot', regex: /googlebot/i },
  { name: 'Bingbot', regex: /bingbot|msnbot/i },
  { name: 'YandexBot', regex: /yandexbot/i },
  { name: 'DuckDuckBot', regex: /duckduckbot/i },
  { name: 'Baiduspider', regex: /baiduspider/i },
  { name: 'AhrefsBot', regex: /ahrefsbot/i },
  { name: 'SemrushBot', regex: /semrushbot/i },
  { name: 'Applebot', regex: /applebot/i },
  { name: 'Twitterbot', regex: /twitterbot/i },
  { name: 'FacebookBot', regex: /facebookexternalhit|facebot/i },
  { name: 'Discordbot', regex: /discordbot/i },
  { name: 'Slackbot', regex: /slackbot/i },
  { name: 'TelegramBot', regex: /telegrambot/i },
  { name: 'HeadlessChrome', regex: /headlesschrome/i },
  { name: 'Lighthouse', regex: /lighthouse|chrome-lighthouse/i },
  { name: 'cURL', regex: /^curl\//i },
  { name: 'Wget', regex: /^wget\//i },
  { name: 'Python', regex: /python-requests|httpx|aiohttp/i },
  { name: 'Postman', regex: /postmanruntime/i },
  { name: 'GoHttpClient', regex: /go-http-client/i },
  { name: 'Generic Crawler', regex: /bot|crawler|spider|slurp|archiver/i },
];

/**
 * Detect obvious automated bots, crawlers, and headless testing agents.
 */
export function detectBot(ua: string): { isBot: boolean; botName?: string } {
  if (!ua) return { isBot: false };
  for (const { name, regex } of BOT_PATTERNS) {
    if (regex.test(ua)) {
      return { isBot: true, botName: name };
    }
  }
  return { isBot: false };
}

/**
 * Classify device category: desktop, mobile, tablet, bot, unknown.
 */
export function detectDevice(ua: string, isBot: boolean): DeviceType {
  if (isBot) return 'bot';
  if (!ua || ua.trim() === '') return 'unknown';

  const u = ua.toLowerCase();

  // 1. Tablet check (must precede mobile check)
  if (
    u.includes('ipad') ||
    u.includes('tablet') ||
    u.includes('kindle') ||
    u.includes('silk') ||
    u.includes('playbook') ||
    u.includes('sm-t') ||
    (u.includes('android') && !u.includes('mobile'))
  ) {
    return 'tablet';
  }

  // 2. Mobile check
  if (
    u.includes('mobile') ||
    u.includes('iphone') ||
    u.includes('ipod') ||
    u.includes('android') ||
    u.includes('blackberry') ||
    u.includes('windows phone') ||
    u.includes('webos')
  ) {
    return 'mobile';
  }

  // 3. Desktop check
  if (
    u.includes('windows nt') ||
    u.includes('macintosh') ||
    u.includes('mac os x') ||
    u.includes('linux') ||
    u.includes('x11') ||
    u.includes('cros')
  ) {
    return 'desktop';
  }

  return 'unknown';
}

/**
 * Classify Operating System: Windows, macOS, Linux, Android, iOS, ChromeOS, Other, Unknown.
 */
export function detectOS(ua: string): OperatingSystem {
  if (!ua || ua.trim() === '') return 'Unknown';

  const u = ua.toLowerCase();

  if (u.includes('android')) return 'Android';
  if (u.includes('iphone') || u.includes('ipad') || u.includes('ipod')) return 'iOS';
  if (u.includes('cros')) return 'ChromeOS';
  if (u.includes('windows nt') || u.includes('windows')) return 'Windows';
  if (u.includes('mac os x') || u.includes('macintosh')) return 'macOS';
  if (u.includes('linux') || u.includes('x11')) return 'Linux';

  return 'Other';
}

/**
 * Classify Browser: Chrome, Firefox, Safari, Edge, Opera, Samsung Internet, Brave, Other, Unknown.
 * Ordering is crucial because user-agent strings contain overlapping tokens.
 */
export function detectBrowser(ua: string): BrowserName {
  if (!ua || ua.trim() === '') return 'Unknown';

  const u = ua.toLowerCase();

  // 1. Brave (explicit token or Brave UA identifier)
  if (u.includes('brave/') || u.includes(' brave')) return 'Brave';

  // 2. Samsung Internet
  if (u.includes('samsungbrowser/')) return 'Samsung Internet';

  // 3. Edge (Edg/ or Edge/)
  if (u.includes('edg/') || u.includes('edge/') || u.includes('edgios/') || u.includes('edga/')) return 'Edge';

  // 4. Opera (OPR/ or Opera/)
  if (u.includes('opr/') || u.includes('opera/')) return 'Opera';

  // 5. Firefox (Firefox/ or FxiOS/)
  if (u.includes('firefox/') || u.includes('fxios/')) return 'Firefox';

  // 6. Chrome (Chrome/ or CriOS/) - must come after Edge, Opera, Samsung, Brave
  if (u.includes('chrome/') || u.includes('crios/')) return 'Chrome';

  // 7. Safari - must come after Chrome and others
  if (u.includes('safari/') && (u.includes('version/') || u.includes('mobile/'))) return 'Safari';

  return 'Other';
}

/**
 * Master parser: parse raw user-agent string into complete structured client context.
 */
export function parseUserAgent(userAgent?: string | null): UserAgentParseResult {
  const ua = (userAgent || '').trim();

  if (!ua) {
    return {
      device: 'unknown',
      os: 'Unknown',
      browser: 'Unknown',
      isBot: false,
    };
  }

  const { isBot, botName } = detectBot(ua);
  const device = detectDevice(ua, isBot);
  const os = detectOS(ua);
  const browser = detectBrowser(ua);

  return {
    device,
    os,
    browser,
    isBot,
    botName,
  };
}
