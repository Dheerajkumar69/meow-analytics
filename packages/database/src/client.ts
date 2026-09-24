import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema/index.js';
import { getConfig } from '@meow-analytics/config';
import { sql } from 'drizzle-orm';

const { Pool } = pg;

export type DatabaseInstance = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

let poolInstance: pg.Pool | null = null;
let pgliteInstance: PGlite | null = null;
let dbInstance: any = null;
let currentDbUrl: string | null = null;

export function getDatabase(connectionUrl?: string): DatabaseInstance {
  const url = connectionUrl || process.env.DATABASE_URL || getConfig().DATABASE_URL;

  // Phase 9: Render Rule — Never allow in-memory or ephemeral local storage as production database
  const isProduction = process.env.NODE_ENV === 'production';
  const isEphemeralUrl = url.startsWith('memory://') || url.startsWith('pglite://') || url.includes('sqlite') || url.includes('database.sqlite');

  if (isProduction && isEphemeralUrl) {
    throw new Error(
      '[FATAL] Production database error: In NODE_ENV=production, Meow Analytics requires an external persistent database connection (e.g. PostgreSQL). Local filesystem SQLite or in-memory databases are not persistent on Render Free and will cause data loss on spin-down or restart. Please configure a valid external DATABASE_URL.'
    );
  }

  if (dbInstance && currentDbUrl === url) {
    return dbInstance;
  }

  if (dbInstance && currentDbUrl !== url) {
    if (poolInstance) {
      poolInstance.end().catch(() => {});
      poolInstance = null;
    }
    if (pgliteInstance) {
      pgliteInstance.close().catch(() => {});
      pgliteInstance = null;
    }
    dbInstance = null;
  }

  currentDbUrl = url;

  if (url.startsWith('memory://') || url.startsWith('pglite://')) {
    pgliteInstance = new PGlite();
    dbInstance = drizzlePglite(pgliteInstance, { schema });
    return dbInstance;
  }

  const isSslRequired =
    process.env.DATABASE_SSL === 'true' ||
    url.includes('sslmode=require') ||
    url.includes('ssl=true') ||
    (isProduction && !url.includes('localhost') && !url.includes('127.0.0.1'));

  const maxPool = process.env.DATABASE_POOL_MAX
    ? parseInt(process.env.DATABASE_POOL_MAX, 10)
    : (isProduction ? 25 : 10);

  poolInstance = new Pool({
    connectionString: url,
    max: maxPool,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: isSslRequired ? { rejectUnauthorized: false } : undefined,
  });

  poolInstance.on('error', (err) => {
    console.error('[DATABASE POOL ERROR] Unexpected error on idle client:', err);
  });

  dbInstance = drizzlePg(poolInstance, { schema });
  return dbInstance;
}

export async function checkDatabaseHealth(connectionUrl?: string): Promise<boolean> {
  try {
    if (connectionUrl) {
      if (connectionUrl.startsWith('memory://') || connectionUrl.startsWith('pglite://')) {
        const pglite = new PGlite();
        await pglite.query('SELECT 1');
        await pglite.close();
        return true;
      }
      const client = new pg.Client({
        connectionString: connectionUrl,
        connectionTimeoutMillis: 1000,
      });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    }
    const db = getDatabase();
    // Execute a simple ping query
    await db.execute(sql`SELECT 1 as healthy`);
    return true;
  } catch (error) {
    return false;
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (poolInstance) {
    try {
      await poolInstance.end();
    } catch (err) {
      console.warn('[DATABASE POOL ERROR] Error closing pool:', err);
    }
    poolInstance = null;
  }
  if (pgliteInstance) {
    try {
      await pgliteInstance.close();
    } catch (err) {
      console.warn('[DATABASE PGLITE ERROR] Error closing pglite:', err);
    }
    pgliteInstance = null;
  }
  dbInstance = null;
  currentDbUrl = null;
}

export async function migrateDatabase(connectionUrl?: string): Promise<void> {
  const db = getDatabase(connectionUrl);

  // Core schema DDL with idempotency executed sequentially
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      site_id VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS project_domains (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      domain VARCHAR(255) NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS project_domain_idx ON project_domains(project_id, domain)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(128) NOT NULL,
      key_prefix VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS api_key_hash_idx ON api_keys(key_hash)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS api_key_project_idx ON api_keys(project_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events (
      event_id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      type VARCHAR(64) NOT NULL,
      path VARCHAR(2048) NOT NULL,
      hostname VARCHAR(255) NOT NULL,
      referrer VARCHAR(2048) NOT NULL DEFAULT '',
      user_agent VARCHAR(512),
      origin VARCHAR(255),
      timestamp TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS events_site_timestamp_idx ON events(site_id, timestamp)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS events_site_type_idx ON events(site_id, type)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS events_site_path_idx ON events(site_id, path)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS page_views (
      id VARCHAR(64) PRIMARY KEY,
      event_id VARCHAR(64) NOT NULL UNIQUE REFERENCES events(event_id) ON DELETE CASCADE,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      path VARCHAR(2048) NOT NULL,
      hostname VARCHAR(255) NOT NULL,
      referrer VARCHAR(2048) NOT NULL DEFAULT '',
      timestamp TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS page_views_event_id_idx ON page_views(event_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_views_site_timestamp_idx ON page_views(site_id, timestamp)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_views_site_path_idx ON page_views(site_id, path)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS visitors (
      id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      anonymous_id VARCHAR(128) NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      first_path VARCHAR(2048) NOT NULL DEFAULT '/',
      last_path VARCHAR(2048) NOT NULL DEFAULT '/',
      first_referrer VARCHAR(2048) NOT NULL DEFAULT '',
      last_referrer VARCHAR(2048) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS visitors_site_anonymous_idx ON visitors(site_id, anonymous_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS visitors_site_id_idx ON visitors(site_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS visitors_anonymous_id_idx ON visitors(anonymous_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS visitors_site_first_seen_idx ON visitors(site_id, first_seen_at)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS visitors_site_last_seen_idx ON visitors(site_id, last_seen_at)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      visitor_id VARCHAR(64) REFERENCES visitors(id) ON DELETE SET NULL,
      started_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      landing_page VARCHAR(2048) NOT NULL,
      exit_page VARCHAR(2048) NOT NULL,
      page_views INTEGER NOT NULL DEFAULT 1,
      event_count INTEGER NOT NULL DEFAULT 1,
      is_bounce BOOLEAN NOT NULL DEFAULT TRUE,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      is_returning BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Ensure sessions.visitor_id is nullable and cascades with SET NULL on existing tables
  await db.execute(sql`ALTER TABLE sessions ALTER COLUMN visitor_id DROP NOT NULL`).catch(() => {});
  await db.execute(sql`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_visitor_id_visitors_id_fk`).catch(() => {});
  await db.execute(sql`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_visitor_id_fkey`).catch(() => {});
  await db.execute(sql`ALTER TABLE sessions ADD CONSTRAINT sessions_visitor_id_visitors_id_fk FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL`).catch(() => {});

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_site_session_idx ON sessions(site_id, session_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_session_id_idx ON sessions(session_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_site_id_idx ON sessions(site_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_visitor_id_idx ON sessions(visitor_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_site_started_idx ON sessions(site_id, started_at)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_site_last_seen_idx ON sessions(site_id, last_seen_at)
  `);

  await db.execute(sql`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64)
  `);

  await db.execute(sql`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS events_site_visitor_idx ON events(site_id, visitor_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS events_site_session_idx ON events(site_id, session_id)
  `);

  await db.execute(sql`
    ALTER TABLE page_views ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64)
  `);

  await db.execute(sql`
    ALTER TABLE page_views ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_views_site_visitor_idx ON page_views(site_id, visitor_id)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_views_site_session_idx ON page_views(site_id, session_id)
  `);

  // --- Phase 4: Referrers, UTM, Geography, Devices, Browsers, OS & Bots ---
  const phase4Columns = [
    sql`referrer_source VARCHAR(64) NOT NULL DEFAULT 'Direct'`,
    sql`referrer_hostname VARCHAR(255) NOT NULL DEFAULT ''`,
    sql`referrer_url VARCHAR(2048) NOT NULL DEFAULT ''`,
    sql`utm_source VARCHAR(255)`,
    sql`utm_medium VARCHAR(255)`,
    sql`utm_campaign VARCHAR(255)`,
    sql`utm_term VARCHAR(255)`,
    sql`utm_content VARCHAR(255)`,
    sql`country_code VARCHAR(8)`,
    sql`country_name VARCHAR(128)`,
    sql`region VARCHAR(128)`,
    sql`device_type VARCHAR(32) NOT NULL DEFAULT 'unknown'`,
    sql`browser VARCHAR(64) NOT NULL DEFAULT 'Unknown'`,
    sql`os VARCHAR(64) NOT NULL DEFAULT 'Unknown'`,
    sql`language VARCHAR(32)`,
    sql`screen_resolution VARCHAR(32)`,
    sql`is_bot BOOLEAN NOT NULL DEFAULT FALSE`,
  ];

  for (const col of phase4Columns) {
    await db.execute(sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ${col}`);
    await db.execute(sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS ${col}`);
    await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS ${col}`);
  }

  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_source_idx ON sessions(site_id, referrer_source)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_country_idx ON sessions(site_id, country_code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_device_idx ON sessions(site_id, device_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_browser_idx ON sessions(site_id, browser)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_os_idx ON sessions(site_id, os)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_is_bot_idx ON sessions(site_id, is_bot)`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_site_source_idx ON page_views(site_id, referrer_source)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_site_country_idx ON page_views(site_id, country_code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_site_device_idx ON page_views(site_id, device_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_site_browser_idx ON page_views(site_id, browser)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_site_os_idx ON page_views(site_id, os)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_site_is_bot_idx ON page_views(site_id, is_bot)`);

  // --- Phase 6: Custom Events, Event Properties & Error Events ---
  await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name VARCHAR(128)`);
  await db.execute(sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS events_site_event_name_idx ON events(site_id, event_name)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS error_events (
      id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      error_group VARCHAR(255) NOT NULL,
      error_type VARCHAR(128) NOT NULL,
      message VARCHAR(1024) NOT NULL,
      path VARCHAR(2048) NOT NULL,
      browser VARCHAR(64) NOT NULL DEFAULT 'Unknown',
      os VARCHAR(64) NOT NULL DEFAULT 'Unknown',
      visitor_id VARCHAR(64),
      session_id VARCHAR(64),
      timestamp TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS error_events_site_group_idx ON error_events(site_id, error_group)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS error_events_site_time_idx ON error_events(site_id, timestamp)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS error_events_site_type_idx ON error_events(site_id, error_type)`);

  // --- Phase 7: Web Performance / Speed Insights ---
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS performance_metrics (
      id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      path VARCHAR(2048) NOT NULL,
      device VARCHAR(32) NOT NULL DEFAULT 'desktop',
      country VARCHAR(8) NOT NULL DEFAULT 'Unknown',
      country_name VARCHAR(128) NOT NULL DEFAULT 'Unknown',
      visitor_id VARCHAR(64),
      session_id VARCHAR(64),
      timestamp TIMESTAMPTZ NOT NULL,
      lcp DOUBLE PRECISION,
      inp DOUBLE PRECISION,
      cls DOUBLE PRECISION,
      fcp DOUBLE PRECISION,
      ttfb DOUBLE PRECISION,
      dns_duration DOUBLE PRECISION,
      connection_duration DOUBLE PRECISION,
      request_duration DOUBLE PRECISION,
      response_duration DOUBLE PRECISION,
      dom_loading DOUBLE PRECISION,
      page_load DOUBLE PRECISION,
      rating_lcp VARCHAR(20),
      rating_inp VARCHAR(20),
      rating_cls VARCHAR(20),
      rating_fcp VARCHAR(20),
      rating_ttfb VARCHAR(20),
      sample_rate REAL NOT NULL DEFAULT 1.0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS performance_metrics_site_time_idx ON performance_metrics(site_id, timestamp)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS performance_metrics_site_path_idx ON performance_metrics(site_id, path)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS performance_metrics_site_device_idx ON performance_metrics(site_id, device)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS performance_metrics_site_country_idx ON performance_metrics(site_id, country)`);

  // --- Phase 8: Privacy Modes, Retention, Aggregates & Checkpoints ---
  await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS privacy_mode VARCHAR(32) NOT NULL DEFAULT 'balanced'`);
  await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS visitor_retention_hours INTEGER NOT NULL DEFAULT 24`);
  await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS event_retention_days INTEGER NOT NULL DEFAULT 90`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS hourly_aggregates (
      id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      bucket_time TIMESTAMPTZ NOT NULL,
      page_views INTEGER NOT NULL DEFAULT 0,
      visitors INTEGER NOT NULL DEFAULT 0,
      sessions INTEGER NOT NULL DEFAULT 0,
      events INTEGER NOT NULL DEFAULT 0,
      bounces INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS hourly_aggregates_site_bucket_idx ON hourly_aggregates(site_id, bucket_time)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hourly_aggregates_site_id_idx ON hourly_aggregates(site_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hourly_aggregates_bucket_time_idx ON hourly_aggregates(bucket_time)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS daily_aggregates (
      id VARCHAR(64) PRIMARY KEY,
      site_id VARCHAR(64) NOT NULL REFERENCES projects(site_id) ON DELETE CASCADE,
      bucket_date TIMESTAMPTZ NOT NULL,
      page_views INTEGER NOT NULL DEFAULT 0,
      visitors INTEGER NOT NULL DEFAULT 0,
      sessions INTEGER NOT NULL DEFAULT 0,
      events INTEGER NOT NULL DEFAULT 0,
      bounces INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS daily_aggregates_site_bucket_idx ON daily_aggregates(site_id, bucket_date)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_aggregates_site_id_idx ON daily_aggregates(site_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_aggregates_bucket_date_idx ON daily_aggregates(bucket_date)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cleanup_checkpoints (
      job VARCHAR(64) PRIMARY KEY,
      status VARCHAR(32) NOT NULL DEFAULT 'idle',
      last_processed_id VARCHAR(128),
      last_processed_timestamp TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // --- Phase 9: Scaling & Compound Query Indexes ---
  await db.execute(sql`CREATE INDEX IF NOT EXISTS events_site_time_desc_idx ON events(site_id, timestamp DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS page_views_site_time_desc_idx ON page_views(site_id, timestamp DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_started_desc_idx ON sessions(site_id, started_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_last_seen_desc_idx ON sessions(site_id, last_seen_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS sessions_site_visitor_last_seen_idx ON sessions(site_id, visitor_id, last_seen_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hourly_aggregates_site_bucket_asc_idx ON hourly_aggregates(site_id, bucket_time ASC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_aggregates_site_bucket_asc_idx ON daily_aggregates(site_id, bucket_date ASC)`);
}

