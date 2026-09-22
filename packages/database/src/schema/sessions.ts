import { pgTable, varchar, timestamp, uniqueIndex, index, integer, boolean } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { visitors } from './visitors.js';

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    session_id: varchar('session_id', { length: 64 }).notNull(),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    visitor_id: varchar('visitor_id', { length: 64 })
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    started_at: timestamp('started_at', { withTimezone: true }).notNull(),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    landing_page: varchar('landing_page', { length: 2048 }).notNull(),
    exit_page: varchar('exit_page', { length: 2048 }).notNull(),
    page_views: integer('page_views').notNull().default(1),
    event_count: integer('event_count').notNull().default(1),
    is_bounce: boolean('is_bounce').notNull().default(true),
    duration_seconds: integer('duration_seconds').notNull().default(0),
    is_returning: boolean('is_returning').notNull().default(false),
    referrer_source: varchar('referrer_source', { length: 64 }).notNull().default('Direct'),
    referrer_hostname: varchar('referrer_hostname', { length: 255 }).notNull().default(''),
    referrer_url: varchar('referrer_url', { length: 2048 }).notNull().default(''),
    utm_source: varchar('utm_source', { length: 255 }),
    utm_medium: varchar('utm_medium', { length: 255 }),
    utm_campaign: varchar('utm_campaign', { length: 255 }),
    utm_term: varchar('utm_term', { length: 255 }),
    utm_content: varchar('utm_content', { length: 255 }),
    country_code: varchar('country_code', { length: 8 }),
    country_name: varchar('country_name', { length: 128 }),
    region: varchar('region', { length: 128 }),
    device_type: varchar('device_type', { length: 32 }).notNull().default('unknown'),
    browser: varchar('browser', { length: 64 }).notNull().default('Unknown'),
    os: varchar('os', { length: 64 }).notNull().default('Unknown'),
    language: varchar('language', { length: 32 }),
    screen_resolution: varchar('screen_resolution', { length: 32 }),
    is_bot: boolean('is_bot').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteSessionIdx: uniqueIndex('sessions_site_session_idx').on(table.site_id, table.session_id),
    sessionIdIdx: index('sessions_session_id_idx').on(table.session_id),
    siteIdIdx: index('sessions_site_id_idx').on(table.site_id),
    visitorIdIdx: index('sessions_visitor_id_idx').on(table.visitor_id),
    siteStartedIdx: index('sessions_site_started_idx').on(table.site_id, table.started_at),
    siteLastSeenIdx: index('sessions_site_last_seen_idx').on(table.site_id, table.last_seen_at),
    siteSourceIdx: index('sessions_site_source_idx').on(table.site_id, table.referrer_source),
    siteCountryIdx: index('sessions_site_country_idx').on(table.site_id, table.country_code),
    siteDeviceIdx: index('sessions_site_device_idx').on(table.site_id, table.device_type),
    siteBrowserIdx: index('sessions_site_browser_idx').on(table.site_id, table.browser),
    siteOsIdx: index('sessions_site_os_idx').on(table.site_id, table.os),
    siteIsBotIdx: index('sessions_site_is_bot_idx').on(table.site_id, table.is_bot),
  })
);

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
