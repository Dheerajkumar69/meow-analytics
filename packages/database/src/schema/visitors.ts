import { pgTable, varchar, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const visitors = pgTable(
  'visitors',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    anonymous_id: varchar('anonymous_id', { length: 128 }).notNull(),
    first_seen_at: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    first_path: varchar('first_path', { length: 2048 }).notNull().default('/'),
    last_path: varchar('last_path', { length: 2048 }).notNull().default('/'),
    first_referrer: varchar('first_referrer', { length: 2048 }).notNull().default(''),
    last_referrer: varchar('last_referrer', { length: 2048 }).notNull().default(''),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteAnonymousIdx: uniqueIndex('visitors_site_anonymous_idx').on(table.site_id, table.anonymous_id),
    siteIdIdx: index('visitors_site_id_idx').on(table.site_id),
    anonymousIdIdx: index('visitors_anonymous_id_idx').on(table.anonymous_id),
    siteFirstSeenIdx: index('visitors_site_first_seen_idx').on(table.site_id, table.first_seen_at),
    siteLastSeenIdx: index('visitors_site_last_seen_idx').on(table.site_id, table.last_seen_at),
  })
);

export type VisitorRow = typeof visitors.$inferSelect;
export type NewVisitorRow = typeof visitors.$inferInsert;
