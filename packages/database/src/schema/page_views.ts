import { pgTable, varchar, timestamp, uniqueIndex, index, boolean } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { events } from './events.js';

export const pageViews = pgTable(
  'page_views',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    event_id: varchar('event_id', { length: 64 })
      .notNull()
      .unique()
      .references(() => events.event_id, { onDelete: 'cascade' }),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 2048 }).notNull(),
    hostname: varchar('hostname', { length: 255 }).notNull(),
    referrer: varchar('referrer', { length: 2048 }).notNull().default(''),
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
    visitor_id: varchar('visitor_id', { length: 64 }),
    session_id: varchar('session_id', { length: 64 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdIdx: uniqueIndex('page_views_event_id_idx').on(table.event_id),
    siteTimestampIdx: index('page_views_site_timestamp_idx').on(table.site_id, table.timestamp),
    sitePathIdx: index('page_views_site_path_idx').on(table.site_id, table.path),
    siteVisitorIdx: index('page_views_site_visitor_idx').on(table.site_id, table.visitor_id),
    siteSessionIdx: index('page_views_site_session_idx').on(table.site_id, table.session_id),
    siteSourceIdx: index('page_views_site_source_idx').on(table.site_id, table.referrer_source),
    siteCountryIdx: index('page_views_site_country_idx').on(table.site_id, table.country_code),
    siteDeviceIdx: index('page_views_site_device_idx').on(table.site_id, table.device_type),
    siteBrowserIdx: index('page_views_site_browser_idx').on(table.site_id, table.browser),
    siteOsIdx: index('page_views_site_os_idx').on(table.site_id, table.os),
    siteIsBotIdx: index('page_views_site_is_bot_idx').on(table.site_id, table.is_bot),
  })
);

export type PageViewRow = typeof pageViews.$inferSelect;
export type NewPageViewRow = typeof pageViews.$inferInsert;
