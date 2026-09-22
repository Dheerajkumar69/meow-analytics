import { describe, it, expect } from 'vitest';
import {
  defaultGeoService,
  GeoService,
  GeoProvider,
  GeoLocation,
  HeaderGeoProvider,
  LocalGeoProvider,
  getCountryName,
} from '@meow-analytics/shared';

describe('Phase 4 — Section 5 & 6 Geolocation Tests', () => {
  it('correctly maps ISO alpha-2 country codes to official country names', () => {
    expect(getCountryName('IN')).toBe('India');
    expect(getCountryName('US')).toBe('USA');
    expect(getCountryName('DE')).toBe('Germany');
    expect(getCountryName('GB')).toBe('United Kingdom');
    expect(getCountryName('FR')).toBe('France');
    expect(getCountryName(null)).toBeNull();
  });

  it('resolves country from edge CDN headers via HeaderGeoProvider', () => {
    const provider = new HeaderGeoProvider();

    const cfHeaders = { 'cf-ipcountry': 'IN', 'cf-region': 'Maharashtra' };
    const res1 = provider.lookup('1.2.3.4', cfHeaders);
    expect(res1.countryCode).toBe('IN');
    expect(res1.countryName).toBe('India');
    expect(res1.region).toBe('Maharashtra');

    const awsHeaders = { 'cloudfront-viewer-country': 'US' };
    const res2 = provider.lookup('1.2.3.4', awsHeaders);
    expect(res2.countryCode).toBe('US');
    expect(res2.countryName).toBe('USA');

    const genericHeaders = { 'x-country-code': 'DE' };
    const res3 = provider.lookup('1.2.3.4', genericHeaders);
    expect(res3.countryCode).toBe('DE');
    expect(res3.countryName).toBe('Germany');
  });

  it('resolves offline test IP prefixes via LocalGeoProvider', () => {
    const local = new LocalGeoProvider();

    const inRes = local.lookup('103.21.124.1');
    expect(inRes.countryCode).toBe('IN');
    expect(inRes.countryName).toBe('India');

    const usRes = local.lookup('8.8.8.8');
    expect(usRes.countryCode).toBe('US');
    expect(usRes.countryName).toBe('USA');

    const deRes = local.lookup('85.115.1.1');
    expect(deRes.countryCode).toBe('DE');
    expect(deRes.countryName).toBe('Germany');

    const unknownRes = local.lookup('127.0.0.1');
    expect(unknownRes.countryCode).toBeNull();
  });

  it('supports replaceable geo provider architecture (Section 6: Make geo provider replaceable)', async () => {
    const geoService = new GeoService();

    // Create a mock vendor provider
    const mockVendorProvider: GeoProvider = {
      name: 'VendorMaxGeo',
      lookup: (ip: string): GeoLocation => {
        if (ip === '99.88.77.66') {
          return { countryCode: 'JP', countryName: 'Japan', region: 'Tokyo' };
        }
        return { countryCode: null, countryName: null, region: null };
      },
    };

    geoService.setProvider(mockVendorProvider);
    expect(geoService.getProviderName()).toBe('VendorMaxGeo');

    const res = await geoService.lookup('99.88.77.66');
    expect(res.countryCode).toBe('JP');
    expect(res.countryName).toBe('Japan');
    expect(res.region).toBe('Tokyo');
  });

  it('guarantees the application works safely when geo lookup is unavailable or fails (Section 6)', async () => {
    const geoService = new GeoService();

    // Provider that throws an error
    const brokenProvider: GeoProvider = {
      name: 'BrokenProvider',
      lookup: () => {
        throw new Error('Database connection timed out');
      },
    };

    geoService.setProvider(brokenProvider);

    // Must not throw: returns graceful fallback
    const res = await geoService.lookup('192.168.1.1');
    expect(res.countryCode).toBe('UNKNOWN');
    expect(res.countryName).toBe('Unknown');
    expect(res.region).toBeNull();
  });
});
