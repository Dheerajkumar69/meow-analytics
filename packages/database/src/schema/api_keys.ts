import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const apiKeys = pgTable(
  'api_keys',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    project_id: varchar('project_id', { length: 64 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    key_hash: varchar('key_hash', { length: 128 }).notNull(),
    key_prefix: varchar('key_prefix', { length: 32 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    keyHashIdx: index('api_key_hash_idx').on(table.key_hash),
    projectKeyIdx: index('api_key_project_idx').on(table.project_id),
  })
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
