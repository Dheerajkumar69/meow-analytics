import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getDatabase,
  checkDatabaseHealth,
  migrateDatabase,
  closeDatabaseConnection,
  projects,
} from '@meow-analytics/database';
import { generateProjectId, generateSiteId } from '@meow-analytics/shared';
import { eq } from 'drizzle-orm';

describe('Database Connection & Schema', () => {
  beforeAll(async () => {
    // Set in-memory database URL for test isolation
    process.env.DATABASE_URL = 'memory://';
    process.env.MEOW_SECRET = '12345678901234567890123456789012';
    process.env.ADMIN_SECRET = 'admin_secret_12345';
    process.env.CORS_ORIGINS = 'http://localhost:5173';
    await migrateDatabase('memory://');
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('verifies database health probe returns true', async () => {
    const isHealthy = await checkDatabaseHealth('memory://');
    expect(isHealthy).toBe(true);
  });

  it('inserts and queries a project record successfully', async () => {
    const db = getDatabase('memory://');
    const id = generateProjectId();
    const siteId = generateSiteId();

    await db.insert(projects).values({
      id,
      name: 'Test DB Project',
      site_id: siteId,
      status: 'active',
      timezone: 'UTC',
    });

    const rows = await db.select().from(projects).where(eq(projects.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Test DB Project');
    expect(rows[0]?.site_id).toBe(siteId);
    expect(rows[0]?.status).toBe('active');
  });
});
