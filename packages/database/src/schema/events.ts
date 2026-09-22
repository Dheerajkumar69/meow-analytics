import { pgTable, varchar, timestamp, index, boolean, jsonb } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const events = pgTable(
  'events',
  {
    event_id: varchar('event_id', { length: 64 }).primaryKey(),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    event_name: varchar('event_name', { length: 128 }),
    properties: jsonb('properties').default({}),
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
    user_agent: varchar('user_agent', { length: 512 }),
    origin: varchar('origin', { length: 255 }),
    visitor_id: varchar('visitor_id', { length: 64 }),
    session_id: varchar('session_id', { length: 64 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteTimestampIdx: index('events_site_timestamp_idx').on(table.site_id, table.timestamp),
    siteTypeIdx: index('events_site_type_idx').on(table.site_id, table.type),
    siteEventNameIdx: index('events_site_event_name_idx').on(table.site_id, table.event_name),
    sitePathIdx: index('events_site_path_idx').on(table.site_id, table.path),
    siteVisitorIdx: index('events_site_visitor_idx').on(table.site_id, table.visitor_id),
    siteSessionIdx: index('events_site_session_idx').on(table.site_id, table.session_id),
  })
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
