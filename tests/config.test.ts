import { describe, it, expect } from 'vitest';
import { parseConfig, ConfigValidationError } from '@meow-analytics/config';

describe('Configuration Validation', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '3001',
    HOST: '0.0.0.0',
    DATABASE_URL: 'memory://',
    MEOW_SECRET: '12345678901234567890123456789012', // 32 chars
    ADMIN_SECRET: 'admin_secret_1234', // 16 chars
    CORS_ORIGINS: 'http://localhost:5173,http://localhost:3000',
  };

  it('successfully parses valid environment variables', () => {
    const config = parseConfig(validEnv);
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
    expect(config.DATABASE_URL).toBe('memory://');
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'http://localhost:3000']);
  });

  it('fails startup clearly when DATABASE_URL is missing', () => {
    const invalid = { ...validEnv, DATABASE_URL: '' };
    expect(() => parseConfig(invalid)).toThrow(ConfigValidationError);
    try {
      parseConfig(invalid);
    } catch (e: any) {
      expect(e.message).toContain('DATABASE_URL');
      expect(e.message).toContain('Missing or invalid environment variables');
    }
  });

  it('fails startup when MEOW_SECRET is shorter than 32 characters', () => {
    const invalid = { ...validEnv, MEOW_SECRET: 'too_short' };
    expect(() => parseConfig(invalid)).toThrow(ConfigValidationError);
    try {
      parseConfig(invalid);
    } catch (e: any) {
      expect(e.message).toContain('MEOW_SECRET');
      expect(e.message).toContain('at least 32 characters');
    }
  });

  it('fails startup when ADMIN_SECRET is shorter than 16 characters', () => {
    const invalid = { ...validEnv, ADMIN_SECRET: 'admin123' };
    expect(() => parseConfig(invalid)).toThrow(ConfigValidationError);
    try {
      parseConfig(invalid);
    } catch (e: any) {
      expect(e.message).toContain('ADMIN_SECRET');
      expect(e.message).toContain('at least 16 characters');
    }
  });

  it('fails startup when CORS_ORIGINS is missing', () => {
    const invalid = { ...validEnv, CORS_ORIGINS: '' };
    expect(() => parseConfig(invalid)).toThrow(ConfigValidationError);
    try {
      parseConfig(invalid);
    } catch (e: any) {
      expect(e.message).toContain('CORS_ORIGINS');
    }
  });
});
