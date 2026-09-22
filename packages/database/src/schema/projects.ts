import { pgTable, varchar, timestamp, integer } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  site_id: varchar('site_id', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  privacy_mode: varchar('privacy_mode', { length: 32 }).notNull().default('balanced'),
  visitor_retention_hours: integer('visitor_retention_hours').notNull().default(24),
  event_retention_days: integer('event_retention_days').notNull().default(90),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
