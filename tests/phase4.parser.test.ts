import { describe, it, expect } from 'vitest';
import {
  parseReferrer,
  ReferrerParser,
  parseUserAgent,
  extractUtmParameters,
  normalizeLanguage,
  formatScreenResolution,
} from '@meow-analytics/shared';

describe('Phase 4 — Section 20 Parser Tests', () => {
  // --- 1. Referrer Classification ---
  describe('Referrer Parser & Classification', () => {
    it('correctly classifies Google referrers (various TLDs, subdomains, android-app)', () => {
      expect(parseReferrer('https://www.google.com/search?q=cats').source).toBe('Google');
      expect(parseReferrer('https://google.co.in/').source).toBe('Google');
      expect(parseReferrer('https://google.co.uk/search?q=meow').source).toBe('Google');
      expect(parseReferrer('https://google.de/').source).toBe('Google');
      expect(parseReferrer('https://news.google.com/articles/123').source).toBe('Google');
      expect(parseReferrer('android-app://com.google.android.googlequicksearchbox/https/www.google.com').source).toBe('Google');
    });

    it('correctly classifies Direct traffic (empty, whitespace, missing, same-host)', () => {
      expect(parseReferrer('').source).toBe('Direct');
      expect(parseReferrer('   ').source).toBe('Direct');
      expect(parseReferrer(null).source).toBe('Direct');
      expect(parseReferrer(undefined).source).toBe('Direct');
      // Internal navigation to same site
      expect(parseReferrer('https://example.com/blog', 'example.com').source).toBe('Direct');
      expect(parseReferrer('https://sub.example.com/about', 'example.com').source).toBe('Direct');
    });

    it('correctly classifies Reddit referrers', () => {
      expect(parseReferrer('https://www.reddit.com/r/webdev').source).toBe('Reddit');
      expect(parseReferrer('https://old.reddit.com/r/cats').source).toBe('Reddit');
      expect(parseReferrer('https://redd.it/abc1234').source).toBe('Reddit');
    });

    it('correctly classifies other common sources: Bing, YouTube, Facebook, Instagram, X', () => {
      expect(parseReferrer('https://www.bing.com/search?q=test').source).toBe('Bing');
      expect(parseReferrer('https://www.youtube.com/watch?v=123').source).toBe('YouTube');
      expect(parseReferrer('https://youtu.be/123').source).toBe('YouTube');
      expect(parseReferrer('https://www.facebook.com/').source).toBe('Facebook');
      expect(parseReferrer('https://l.facebook.com/l.php?u=...').source).toBe('Facebook');
      expect(parseReferrer('https://www.instagram.com/').source).toBe('Instagram');
      expect(parseReferrer('https://t.co/xyz123').source).toBe('X');
      expect(parseReferrer('https://x.com/someone/status/123').source).toBe('X');
      expect(parseReferrer('https://twitter.com/').source).toBe('X');
    });

    it('classifies unknown external referrers as "Other" and does NOT classify as Direct', () => {
      const res1 = parseReferrer('https://tech-community-blog.xyz/post/42');
      expect(res1.source).toBe('Other');
      expect(res1.referrerHostname).toBe('tech-community-blog.xyz');
      expect(res1.referrerUrl).toBe('https://tech-community-blog.xyz/post/42');

      const res2 = parseReferrer('https://news.ycombinator.com/item?id=999');
      expect(res2.source).toBe('Other');
      expect(res2.referrerHostname).toBe('news.ycombinator.com');
    });

    it('supports custom configurable parser rules without hardcoding', () => {
      const customParser = new ReferrerParser();
      customParser.registerRule({
        source: 'DuckDuckGo',
        match: (host) => host.includes('duckduckgo.com'),
      });
      customParser.registerRule({
        source: 'LinkedIn',
        match: (host) => host.includes('linkedin.com') || host.includes('lnkd.in'),
      });

      expect(customParser.parse('https://duckduckgo.com/?q=meow').source).toBe('DuckDuckGo');
      expect(customParser.parse('https://www.linkedin.com/feed').source).toBe('LinkedIn');
      expect(customParser.parse('https://www.google.com/').source).toBe('Google');
    });

    it('handles malformed referrer URLs safely without crashing', () => {
      const res = parseReferrer('htt://not a valid url;;;');
      expect(res.source).toBe('Other');
      expect(typeof res.referrerUrl).toBe('string');
    });
  });

  // --- 2. UTM Tracking & Sanitization ---
  describe('UTM Tracking & Parameter Extraction', () => {
    it('extracts and whitelists only standard utm_* parameters', () => {
      const url = 'https://example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=spring_sale&utm_term=cat_food&utm_content=hero_cta';
      const utm = extractUtmParameters(url);

      expect(utm.utm_source).toBe('newsletter');
      expect(utm.utm_medium).toBe('email');
      expect(utm.utm_campaign).toBe('spring_sale');
      expect(utm.utm_term).toBe('cat_food');
      expect(utm.utm_content).toBe('hero_cta');
    });

    it('strictly ignores and discards arbitrary non-UTM query parameters for privacy', () => {
      const url = 'https://example.com/checkout?token=secret123&fbclid=IwAR09&gclid=CjwKCA&utm_source=adwords&user_id=usr_99';
      const utm = extractUtmParameters(url);

      expect(utm.utm_source).toBe('adwords');
      expect((utm as any).token).toBeUndefined();
      expect((utm as any).fbclid).toBeUndefined();
      expect((utm as any).gclid).toBeUndefined();
      expect((utm as any).user_id).toBeUndefined();
    });

    it('handles query string only and hash fragments properly', () => {
      const query = '?utm_source=twitter&utm_medium=social#section-1';
      const utm = extractUtmParameters(query);
      expect(utm.utm_source).toBe('twitter');
      expect(utm.utm_medium).toBe('social');
      expect(utm.utm_campaign).toBeUndefined();
    });
  });

  // --- 3. Language & Screen Formatting ---
  describe('Language & Screen Display Utilities', () => {
    it('normalizes browser language tags properly', () => {
      expect(normalizeLanguage('en-US,en;q=0.9')).toBe('en-US');
      expect(normalizeLanguage('en_gb')).toBe('en-GB');
      expect(normalizeLanguage('FR')).toBe('fr');
      expect(normalizeLanguage('hi-IN')).toBe('hi-IN');
      expect(normalizeLanguage('')).toBeNull();
      expect(normalizeLanguage(null)).toBeNull();
    });

    it('formats screen resolutions safely without fingerprinting', () => {
      expect(formatScreenResolution(1920, 1080)).toBe('1920x1080');
      expect(formatScreenResolution(390, 844)).toBe('390x844');
      expect(formatScreenResolution(0, 0)).toBeNull();
      expect(formatScreenResolution(undefined, undefined)).toBeNull();
    });
  });

  // --- 4. User-Agent, Device, Browser, OS & Bot Detection ---
  describe('User-Agent & Device Parser', () => {
    it('detects desktop devices across Windows, macOS, and Linux', () => {
      const winChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
      const winRes = parseUserAgent(winChrome);
      expect(winRes.device).toBe('desktop');
      expect(winRes.os).toBe('Windows');
      expect(winRes.browser).toBe('Chrome');
      expect(winRes.isBot).toBe(false);

      const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15';
      const macRes = parseUserAgent(macSafari);
      expect(macRes.device).toBe('desktop');
      expect(macRes.os).toBe('macOS');
      expect(macRes.browser).toBe('Safari');
      expect(macRes.isBot).toBe(false);

      const linuxFirefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0';
      const linuxRes = parseUserAgent(linuxFirefox);
      expect(linuxRes.device).toBe('desktop');
      expect(linuxRes.os).toBe('Linux');
      expect(linuxRes.browser).toBe('Firefox');
      expect(linuxRes.isBot).toBe(false);

      const chromeOS = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const crosRes = parseUserAgent(chromeOS);
      expect(crosRes.device).toBe('desktop');
      expect(crosRes.os).toBe('ChromeOS');
      expect(crosRes.browser).toBe('Chrome');
      expect(crosRes.isBot).toBe(false);
    });

    it('detects mobile devices across Android and iOS', () => {
      const androidMobile = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
      const androidRes = parseUserAgent(androidMobile);
      expect(androidRes.device).toBe('mobile');
      expect(androidRes.os).toBe('Android');
      expect(androidRes.browser).toBe('Chrome');
      expect(androidRes.isBot).toBe(false);

      const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
      const iphoneRes = parseUserAgent(iphoneSafari);
      expect(iphoneRes.device).toBe('mobile');
      expect(iphoneRes.os).toBe('iOS');
      expect(iphoneRes.browser).toBe('Safari');
      expect(iphoneRes.isBot).toBe(false);
    });

    it('detects tablets (iPad and Android tablets)', () => {
      const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      const ipadRes = parseUserAgent(ipad);
      expect(ipadRes.device).toBe('tablet');
      expect(ipadRes.os).toBe('iOS');
      expect(ipadRes.browser).toBe('Safari');
      expect(ipadRes.isBot).toBe(false);

      // Android tablet: has "Android" but does NOT have "Mobile"
      const androidTablet = 'Mozilla/5.0 (Linux; Android 13; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const tabletRes = parseUserAgent(androidTablet);
      expect(tabletRes.device).toBe('tablet');
      expect(tabletRes.os).toBe('Android');
      expect(tabletRes.browser).toBe('Chrome');
      expect(tabletRes.isBot).toBe(false);
    });

    it('detects specialized browsers: Edge, Opera, Samsung Internet, Brave', () => {
      const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.2365.66';
      expect(parseUserAgent(edge).browser).toBe('Edge');

      const opera = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/107.0.0.0';
      expect(parseUserAgent(opera).browser).toBe('Opera');

      const samsung = 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36';
      expect(parseUserAgent(samsung).browser).toBe('Samsung Internet');

      const brave = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Brave/122.0.0.0';
      expect(parseUserAgent(brave).browser).toBe('Brave');
    });

    it('detects obvious bots and sets isBot = true, device = "bot"', () => {
      const googlebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
      const gRes = parseUserAgent(googlebot);
      expect(gRes.isBot).toBe(true);
      expect(gRes.device).toBe('bot');
      expect(gRes.botName).toBe('Googlebot');

      const bingbot = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
      expect(parseUserAgent(bingbot).isBot).toBe(true);

      const headless = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';
      expect(parseUserAgent(headless).isBot).toBe(true);
      expect(parseUserAgent(headless).device).toBe('bot');

      const curl = 'curl/8.4.0';
      expect(parseUserAgent(curl).isBot).toBe(true);
      expect(parseUserAgent(curl).device).toBe('bot');

      const python = 'python-requests/2.31.0';
      expect(parseUserAgent(python).isBot).toBe(true);
    });

    it('gracefully handles missing or malformed user-agents without errors', () => {
      const emptyRes = parseUserAgent('');
      expect(emptyRes.device).toBe('unknown');
      expect(emptyRes.os).toBe('Unknown');
      expect(emptyRes.browser).toBe('Unknown');
      expect(emptyRes.isBot).toBe(false);

      const nullRes = parseUserAgent(null);
      expect(nullRes.device).toBe('unknown');

      const malformed = '!@#$%^&*()_+~`|}{[]:;?><,./';
      const malformedRes = parseUserAgent(malformed);
      expect(malformedRes.device).toBe('unknown');
      expect(malformedRes.isBot).toBe(false);
    });
  });
});
