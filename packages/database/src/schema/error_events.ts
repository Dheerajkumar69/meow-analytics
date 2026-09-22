import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const errorEvents = pgTable(
  'error_events',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    error_group: varchar('error_group', { length: 255 }).notNull(),
    error_type: varchar('error_type', { length: 128 }).notNull(),
    message: varchar('message', { length: 1024 }).notNull(),
    path: varchar('path', { length: 2048 }).notNull(),
    browser: varchar('browser', { length: 64 }).notNull().default('Unknown'),
    os: varchar('os', { length: 64 }).notNull().default('Unknown'),
    visitor_id: varchar('visitor_id', { length: 64 }),
    session_id: varchar('session_id', { length: 64 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteGroupIdx: index('error_events_site_group_idx').on(table.site_id, table.error_group),
    siteTimeIdx: index('error_events_site_time_idx').on(table.site_id, table.timestamp),
    siteTypeIdx: index('error_events_site_type_idx').on(table.site_id, table.error_type),
  })
);

export type ErrorEventRow = typeof errorEvents.$inferSelect;
export type NewErrorEventRow = typeof errorEvents.$inferInsert;
