import { getDatabase, migrateDatabase, closeDatabaseConnection } from '@meow-analytics/database';
import { sql } from 'drizzle-orm';

async function runExplainQueries() {
  console.log('🐾 Running Meow Analytics Query Plan Inspection (EXPLAIN)...');
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'memory://';
  process.env.NODE_ENV = 'test';
  process.env.MEOW_SECRET = process.env.MEOW_SECRET || '12345678901234567890123456789012';
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'super_secret_admin_token_12345';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || '*';

  await migrateDatabase();
  const db = getDatabase();

  const siteId = 'site_explain_test';

  // Seed minimal test project
  await db.execute(sql`
    INSERT INTO projects (id, name, site_id, status)
    VALUES ('proj_exp', 'Explain Project', ${siteId}, 'active')
    ON CONFLICT (site_id) DO NOTHING
  `);

  const queries = [
    {
      name: '1. Events by Site and Time Range',
      query: sql`EXPLAIN SELECT * FROM events WHERE site_id = ${siteId} AND timestamp >= NOW() - INTERVAL '30 days' ORDER BY timestamp DESC LIMIT 50`,
    },
    {
      name: '2. Page Views by Site and Time Range',
      query: sql`EXPLAIN SELECT * FROM page_views WHERE site_id = ${siteId} AND timestamp >= NOW() - INTERVAL '30 days' ORDER BY timestamp DESC LIMIT 50`,
    },
    {
      name: '3. Sessions Active in Range',
      query: sql`EXPLAIN SELECT COUNT(DISTINCT visitor_id) FROM sessions WHERE site_id = ${siteId} AND started_at <= NOW() AND last_seen_at >= NOW() - INTERVAL '30 days'`,
    },
    {
      name: '4. Visitors Lookup by Site & Anonymous ID',
      query: sql`EXPLAIN SELECT id FROM visitors WHERE site_id = ${siteId} AND anonymous_id = 'anon_123'`,
    },
    {
      name: '5. Hourly Aggregates Range Query',
      query: sql`EXPLAIN SELECT * FROM hourly_aggregates WHERE site_id = ${siteId} AND bucket_time >= NOW() - INTERVAL '7 days' ORDER BY bucket_time ASC`,
    },
    {
      name: '6. Daily Aggregates Range Query',
      query: sql`EXPLAIN SELECT * FROM daily_aggregates WHERE site_id = ${siteId} AND bucket_date >= NOW() - INTERVAL '90 days' ORDER BY bucket_date ASC`,
    },
  ];

  console.log('\n======================================================');
  console.log('              QUERY EXECUTION PLANS                   ');
  console.log('======================================================');

  for (const q of queries) {
    try {
      const res = await db.execute(q.query);
      console.log(`\n📋 Query: ${q.name}`);
      const lines = res.rows.map((r: any) => Object.values(r)[0]).join('\n  ');
      console.log(`  ${lines}`);
    } catch (err: any) {
      console.error(`❌ Error explaining ${q.name}:`, err.message || err);
    }
  }

  console.log('\n======================================================');
  console.log('✅ All query plans inspected successfully.');

  await closeDatabaseConnection();
}

runExplainQueries().catch((err) => {
  console.error('Fatal error in query explanation:', err);
  process.exit(1);
});
