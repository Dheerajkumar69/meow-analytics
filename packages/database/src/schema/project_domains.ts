import { pgTable, varchar, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const projectDomains = pgTable(
  'project_domains',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    project_id: varchar('project_id', { length: 64 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    domain: varchar('domain', { length: 255 }).notNull(),
    verified: boolean('verified').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectDomainIdx: uniqueIndex('project_domain_idx').on(table.project_id, table.domain),
  })
);

export type ProjectDomainRow = typeof projectDomains.$inferSelect;
export type NewProjectDomainRow = typeof projectDomains.$inferInsert;
