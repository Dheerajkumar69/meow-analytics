import { pgTable, varchar, timestamp, index, doublePrecision, real } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const performanceMetrics = pgTable(
  'performance_metrics',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    site_id: varchar('site_id', { length: 64 })
      .notNull()
      .references(() => projects.site_id, { onDelete: 'cascade' }),
    path: varchar('path', { length: 2048 }).notNull(),
    device: varchar('device', { length: 32 }).notNull().default('desktop'),
    country: varchar('country', { length: 8 }).notNull().default('Unknown'),
    country_name: varchar('country_name', { length: 128 }).notNull().default('Unknown'),
    visitor_id: varchar('visitor_id', { length: 64 }),
    session_id: varchar('session_id', { length: 64 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),

    // Core Web Vitals
    lcp: doublePrecision('lcp'), // milliseconds
    inp: doublePrecision('inp'), // milliseconds
    cls: doublePrecision('cls'), // score (e.g. 0.05)
    fcp: doublePrecision('fcp'), // milliseconds
    ttfb: doublePrecision('ttfb'), // milliseconds

    // Navigation Timing (all in milliseconds)
    dns_duration: doublePrecision('dns_duration'),
    connection_duration: doublePrecision('connection_duration'),
    request_duration: doublePrecision('request_duration'),
    response_duration: doublePrecision('response_duration'),
    dom_loading: doublePrecision('dom_loading'),
    page_load: doublePrecision('page_load'),

    // Classifications ('good' | 'needs-improvement' | 'poor')
    rating_lcp: varchar('rating_lcp', { length: 20 }),
    rating_inp: varchar('rating_inp', { length: 20 }),
    rating_cls: varchar('rating_cls', { length: 20 }),
    rating_fcp: varchar('rating_fcp', { length: 20 }),
    rating_ttfb: varchar('rating_ttfb', { length: 20 }),

    // Sampling Rate (e.g. 1.0 for 100%, 0.1 for 10%)
    sample_rate: real('sample_rate').notNull().default(1.0),

    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    siteTimeIdx: index('performance_metrics_site_time_idx').on(table.site_id, table.timestamp),
    sitePathIdx: index('performance_metrics_site_path_idx').on(table.site_id, table.path),
    siteDeviceIdx: index('performance_metrics_site_device_idx').on(table.site_id, table.device),
    siteCountryIdx: index('performance_metrics_site_country_idx').on(table.site_id, table.country),
  })
);

export type PerformanceMetricRow = typeof performanceMetrics.$inferSelect;
export type NewPerformanceMetricRow = typeof performanceMetrics.$inferInsert;
