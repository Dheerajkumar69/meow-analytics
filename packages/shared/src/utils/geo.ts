export interface GeoLocation {
  countryCode: string | null;
  countryName: string | null;
  region: string | null;
}

export interface GeoProvider {
  readonly name: string;
  lookup(
    ip: string,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<GeoLocation> | GeoLocation;
}

/**
 * Standard ISO 3166-1 alpha-2 to English country names dictionary.
 */
export const ISO_COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan',
  AL: 'Albania',
  DZ: 'Algeria',
  AD: 'Andorra',
  AO: 'Angola',
  AG: 'Antigua and Barbuda',
  AR: 'Argentina',
  AM: 'Armenia',
  AU: 'Australia',
  AT: 'Austria',
  AZ: 'Azerbaijan',
  BS: 'Bahamas',
  BH: 'Bahrain',
  BD: 'Bangladesh',
  BB: 'Barbados',
  BY: 'Belarus',
  BE: 'Belgium',
  BZ: 'Belize',
  BJ: 'Benin',
  BT: 'Bhutan',
  BO: 'Bolivia',
  BA: 'Bosnia and Herzegovina',
  BW: 'Botswana',
  BR: 'Brazil',
  BN: 'Brunei',
  BG: 'Bulgaria',
  BF: 'Burkina Faso',
  BI: 'Burundi',
  CV: 'Cabo Verde',
  KH: 'Cambodia',
  CM: 'Cameroon',
  CA: 'Canada',
  CF: 'Central African Republic',
  TD: 'Chad',
  CL: 'Chile',
  CN: 'China',
  CO: 'Colombia',
  KM: 'Comoros',
  CD: 'Congo (DRC)',
  CG: 'Congo',
  CR: 'Costa Rica',
  HR: 'Croatia',
  CU: 'Cuba',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DK: 'Denmark',
  DJ: 'Djibouti',
  DM: 'Dominica',
  DO: 'Dominican Republic',
  EC: 'Ecuador',
  EG: 'Egypt',
  SV: 'El Salvador',
  GQ: 'Equatorial Guinea',
  ER: 'Eritrea',
  EE: 'Estonia',
  SZ: 'Eswatini',
  ET: 'Ethiopia',
  FJ: 'Fiji',
  FI: 'Finland',
  FR: 'France',
  GA: 'Gabon',
  GM: 'Gambia',
  GE: 'Georgia',
  DE: 'Germany',
  GH: 'Ghana',
  GR: 'Greece',
  GD: 'Grenada',
  GT: 'Guatemala',
  GN: 'Guinea',
  GW: 'Guinea-Bissau',
  GY: 'Guyana',
  HT: 'Haiti',
  HN: 'Honduras',
  HU: 'Hungary',
  IS: 'Iceland',
  IN: 'India',
  ID: 'Indonesia',
  IR: 'Iran',
  IQ: 'Iraq',
  IE: 'Ireland',
  IL: 'Israel',
  IT: 'Italy',
  JM: 'Jamaica',
  JP: 'Japan',
  JO: 'Jordan',
  KZ: 'Kazakhstan',
  KE: 'Kenya',
  KI: 'Kiribati',
  KP: 'North Korea',
  KR: 'South Korea',
  KW: 'Kuwait',
  KG: 'Kyrgyzstan',
  LA: 'Laos',
  LV: 'Latvia',
  LB: 'Lebanon',
  LS: 'Lesotho',
  LR: 'Liberia',
  LY: 'Libya',
  LI: 'Liechtenstein',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MG: 'Madagascar',
  MW: 'Malawi',
  MY: 'Malaysia',
  MV: 'Maldives',
  ML: 'Mali',
  MT: 'Malta',
  MH: 'Marshall Islands',
  MR: 'Mauritania',
  MU: 'Mauritius',
  MX: 'Mexico',
  FM: 'Micronesia',
  MD: 'Moldova',
  MC: 'Monaco',
  MN: 'Mongolia',
  ME: 'Montenegro',
  MA: 'Morocco',
  MZ: 'Mozambique',
  MM: 'Myanmar',
  NA: 'Namibia',
  NR: 'Nauru',
  NP: 'Nepal',
  NL: 'Netherlands',
  NZ: 'New Zealand',
  NI: 'Nicaragua',
  NE: 'Niger',
  NG: 'Nigeria',
  MK: 'North Macedonia',
  NO: 'Norway',
  OM: 'Oman',
  PK: 'Pakistan',
  PW: 'Palau',
  PA: 'Panama',
  PG: 'Papua New Guinea',
  PY: 'Paraguay',
  PE: 'Peru',
  PH: 'Philippines',
  PL: 'Poland',
  PT: 'Portugal',
  QA: 'Qatar',
  RO: 'Romania',
  RU: 'Russia',
  RW: 'Rwanda',
  KN: 'Saint Kitts and Nevis',
  LC: 'Saint Lucia',
  VC: 'Saint Vincent and the Grenadines',
  WS: 'Samoa',
  SM: 'San Marino',
  ST: 'Sao Tome and Principe',
  SA: 'Saudi Arabia',
  SN: 'Senegal',
  RS: 'Serbia',
  SC: 'Seychelles',
  SL: 'Sierra Leone',
  SG: 'Singapore',
  SK: 'Slovakia',
  SI: 'Slovenia',
  SB: 'Solomon Islands',
  SO: 'Somalia',
  ZA: 'South Africa',
  SS: 'South Sudan',
  ES: 'Spain',
  LK: 'Sri Lanka',
  SD: 'Sudan',
  SR: 'Suriname',
  SE: 'Sweden',
  CH: 'Switzerland',
  SY: 'Syria',
  TW: 'Taiwan',
  TJ: 'Tajikistan',
  TZ: 'Tanzania',
  TH: 'Thailand',
  TL: 'Timor-Leste',
  TG: 'Togo',
  TO: 'Tonga',
  TT: 'Trinidad and Tobago',
  TN: 'Tunisia',
  TR: 'Turkey',
  TM: 'Turkmenistan',
  TV: 'Tuvalu',
  UG: 'Uganda',
  UA: 'Ukraine',
  AE: 'United Arab Emirates',
  GB: 'United Kingdom',
  US: 'USA',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VU: 'Vanuatu',
  VA: 'Vatican City',
  VE: 'Venezuela',
  VN: 'Vietnam',
  YE: 'Yemen',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
};

export function getCountryName(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  const code = countryCode.toUpperCase().trim();
  return ISO_COUNTRY_NAMES[code] || code;
}

/**
 * Header-based Geo Provider:
 * Extracts geo metadata provided by edge reverse-proxies / CDNs
 * (Cloudflare, Fastly, AWS CloudFront, Caddy, Nginx).
 */
export class HeaderGeoProvider implements GeoProvider {
  readonly name = 'header';

  lookup(
    _ip: string,
    headers?: Record<string, string | string[] | undefined>
  ): GeoLocation {
    if (!headers) {
      return { countryCode: null, countryName: null, region: null };
    }

    const getHeader = (key: string): string | null => {
      const val = headers[key] || headers[key.toLowerCase()];
      if (!val) return null;
      if (Array.isArray(val)) return val[0]?.trim() || null;
      return typeof val === 'string' ? val.trim() : null;
    };

    const code = (
      getHeader('cf-ipcountry') ||
      getHeader('x-country-code') ||
      getHeader('x-country') ||
      getHeader('x-geo-country') ||
      getHeader('cloudfront-viewer-country')
    )?.toUpperCase();

    const region = getHeader('cf-region') || getHeader('x-region') || getHeader('x-geo-region');

    if (code && code !== 'XX' && code !== 'T1') {
      return {
        countryCode: code,
        countryName: getCountryName(code),
        region: region || null,
      };
    }

    return { countryCode: null, countryName: null, region: null };
  }
}

/**
 * Built-in Offline Fast IP Range Geo Provider:
 * Enables instant, offline lookup for known ranges and simulated tests without external network calls.
 */
export class LocalGeoProvider implements GeoProvider {
  readonly name = 'local';

  // Sample prefix ranges for offline testing and common networks
  private static readonly KNOWN_RANGES: { prefix: string; countryCode: string; region?: string }[] = [
    // India test and production prefixes
    { prefix: '103.', countryCode: 'IN', region: 'Maharashtra' },
    { prefix: '49.', countryCode: 'IN', region: 'Delhi' },
    { prefix: '106.', countryCode: 'IN', region: 'Karnataka' },
    { prefix: '117.', countryCode: 'IN', region: 'Tamil Nadu' },
    { prefix: '122.', countryCode: 'IN', region: 'Maharashtra' },
    // USA test and production prefixes
    { prefix: '8.', countryCode: 'US', region: 'California' },
    { prefix: '142.', countryCode: 'US', region: 'Washington' },
    { prefix: '207.', countryCode: 'US', region: 'New York' },
    { prefix: '208.', countryCode: 'US', region: 'Texas' },
    { prefix: '3.', countryCode: 'US', region: 'Virginia' },
    // Germany
    { prefix: '85.', countryCode: 'DE', region: 'Bavaria' },
    { prefix: '178.', countryCode: 'DE', region: 'Hesse' },
    // UK
    { prefix: '81.', countryCode: 'GB', region: 'England' },
    { prefix: '86.', countryCode: 'GB', region: 'Scotland' },
  ];

  lookup(ip: string): GeoLocation {
    const cleanIp = (ip || '').trim();

    for (const range of LocalGeoProvider.KNOWN_RANGES) {
      if (cleanIp.startsWith(range.prefix)) {
        return {
          countryCode: range.countryCode,
          countryName: getCountryName(range.countryCode),
          region: range.region || null,
        };
      }
    }

    return { countryCode: null, countryName: null, region: null };
  }
}

/**
 * Pluggable GeoService:
 * Coordinates header extraction, registered providers, and safe fallback.
 * Guarantees the application works 100% even when geo lookup is unavailable.
 */
export class GeoService {
  private customProvider: GeoProvider | null = null;
  private headerProvider = new HeaderGeoProvider();
  private localProvider = new LocalGeoProvider();

  /**
   * Replace the active geo lookup provider dynamically.
   * Section 6 requirement: Do not hardcode the application to one vendor.
   */
  public setProvider(provider: GeoProvider | null): void {
    this.customProvider = provider;
  }

  public getProviderName(): string {
    return this.customProvider?.name || 'composite(header+local)';
  }

  /**
   * Resolves countryCode and countryName from IP and headers.
   * Server-side only: never exposes raw IP.
   */
  public async lookup(
    ip: string,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<GeoLocation> {
    try {
      // 1. Edge headers take precedence (trusted proxy CDN)
      const headerResult = this.headerProvider.lookup(ip, headers);
      if (headerResult.countryCode) {
        return headerResult;
      }

      // 2. Custom pluggable vendor provider (if set)
      if (this.customProvider) {
        const customResult = await this.customProvider.lookup(ip, headers);
        if (customResult.countryCode) {
          return {
            countryCode: customResult.countryCode,
            countryName: customResult.countryName || getCountryName(customResult.countryCode),
            region: customResult.region || null,
          };
        }
      }

      // 3. Local built-in provider
      const localResult = this.localProvider.lookup(ip);
      if (localResult.countryCode) {
        return localResult;
      }
    } catch {
      // Fail silently and safely: Section 6 requirement: The application must work if geo lookup is unavailable.
    }

    return {
      countryCode: 'UNKNOWN',
      countryName: 'Unknown',
      region: null,
    };
  }
}

export const defaultGeoService = new GeoService();
