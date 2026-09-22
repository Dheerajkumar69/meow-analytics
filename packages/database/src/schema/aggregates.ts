import { pgTable, varchar, timestamp, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const hourlyAggregates = pgTable(
  'hourly_aggregates',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    bucket_time: timestamp('bucket_time', { withTimezone: true }).notNull(),
    page_views: integer('page_views').notNull().default(0),
    visitors: integer('visitors').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
    events: integer('events').notNull().default(0),
    bounces: integer('bounces').notNull().default(0),
    duration_seconds: integer('duration_seconds').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteBucketIdx: uniqueIndex('hourly_aggregates_site_bucket_idx').on(table.site_id, table.bucket_time),
    siteIdIdx: index('hourly_aggregates_site_id_idx').on(table.site_id),
    bucketTimeIdx: index('hourly_aggregates_bucket_time_idx').on(table.bucket_time),
  })
);

export const dailyAggregates = pgTable(
  'daily_aggregates',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    bucket_date: timestamp('bucket_date', { withTimezone: true }).notNull(),
    page_views: integer('page_views').notNull().default(0),
    visitors: integer('visitors').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
    events: integer('events').notNull().default(0),
    bounces: integer('bounces').notNull().default(0),
    duration_seconds: integer('duration_seconds').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteBucketDateIdx: uniqueIndex('daily_aggregates_site_bucket_idx').on(table.site_id, table.bucket_date),
    siteIdIdx: index('daily_aggregates_site_id_idx').on(table.site_id),
    bucketDateIdx: index('daily_aggregates_bucket_date_idx').on(table.bucket_date),
  })
);

export type HourlyAggregateRow = typeof hourlyAggregates.$inferSelect;
export type NewHourlyAggregateRow = typeof hourlyAggregates.$inferInsert;

export type DailyAggregateRow = typeof dailyAggregates.$inferSelect;
export type NewDailyAggregateRow = typeof dailyAggregates.$inferInsert;
