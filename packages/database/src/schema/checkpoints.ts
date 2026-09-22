import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core';

export const cleanupCheckpoints = pgTable('cleanup_checkpoints', {
  job: varchar('job', { length: 64 }).primaryKey(),
  status: varchar('status', { length: 32 }).notNull().default('idle'),
  last_processed_id: varchar('last_processed_id', { length: 128 }),
  last_processed_timestamp: timestamp('last_processed_timestamp', { withTimezone: true }),
  started_at: timestamp('started_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CleanupCheckpointRow = typeof cleanupCheckpoints.$inferSelect;
export type NewCleanupCheckpointRow = typeof cleanupCheckpoints.$inferInsert;
