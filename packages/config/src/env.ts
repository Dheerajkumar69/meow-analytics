import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Try loading .env from current directory or root if exists
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Try root of monorepo if inside an app/package
  const rootEnv = path.resolve(process.cwd(), '../../.env');
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  } else {
    dotenv.config();
  }
}

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'], {
      errorMap: () => ({ message: 'NODE_ENV must be "development", "test", or "production"' }),
    })
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .trim()
    .min(1, 'DATABASE_URL cannot be empty'),
  MEOW_SECRET: z
    .string({ required_error: 'MEOW_SECRET is required' })
    .trim()
    .min(32, 'MEOW_SECRET must be at least 32 characters long for cryptographic security'),
  ADMIN_SECRET: z
    .string({ required_error: 'ADMIN_SECRET is required' })
    .trim()
    .min(16, 'ADMIN_SECRET must be at least 16 characters long'),
  CORS_ORIGINS: z
    .string({ required_error: 'CORS_ORIGINS is required' })
    .trim()
    .min(1, 'CORS_ORIGINS cannot be empty'),
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
  RATE_LIMIT_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((val) => val === true || val === 'true')
    .default(true),
  GEOIP_DATABASE: z.string().trim().optional(),
  DATABASE_SSL: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((val) => val === true || val === 'true')
    .optional(),
  ENABLE_BACKGROUND_WORKERS: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((val) => val === true || val === 'true')
    .default(true),
});

export type RawConfig = z.infer<typeof envSchema>;

export interface Config extends RawConfig {
  corsOrigins: string[];
}

export class ConfigValidationError extends Error {
  public issues: { field: string; message: string }[];

  constructor(issues: { field: string; message: string }[]) {
    const formatted = issues.map((i) => `  - ${i.field}: ${i.message}`).join('\n');
    super(
      `Meow Analytics Configuration Error: Missing or invalid environment variables:\n${formatted}\nStartup aborted. Safe defaults were NOT used.`
    );
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

export function parseConfig(source: Record<string, unknown> = process.env): Config {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
    }));
    throw new ConfigValidationError(issues);
  }

  const raw = result.data;
  const corsOrigins = raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    ...raw,
    corsOrigins,
  };
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = parseConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
