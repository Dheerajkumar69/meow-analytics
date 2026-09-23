import { getDatabase, projects, cleanupCheckpoints, visitors, events, sessions } from '@meow-analytics/database';
import { sql, eq, ne, inArray } from 'drizzle-orm';
import { runHourlyAggregation, runDailyAggregation } from './aggregation.js';

export interface CleanupOptions {
  batchSize?: number;
  dryRun?: boolean;
}

export interface CleanupReport {
  visitorsCleaned: number;
  eventsCleaned: number;
  sessionsCleaned: number;
  pageViewsCleaned: number;
  errorsCleaned: number;
  performanceCleaned: number;
  checkpoints: Record<string, any>;
  startedAt: string;
  completedAt: string;
}

export async function getCleanupCheckpoint(jobName = 'retention_cleanup') {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(cleanupCheckpoints)
    .where(eq(cleanupCheckpoints.job, jobName))
    .limit(1);
  return rows[0] || null;
}

/**
 * Resumable, idempotent, batch-oriented cleanup job.
 * Avoids giant transactions by chunking deletions and recording checkpoints.
 */
export async function runRetentionCleanup(options: CleanupOptions = {}): Promise<CleanupReport> {
  const db = getDatabase();
  const batchSize = Math.max(10, Math.min(options.batchSize || 500, 5000));
  const jobName = 'retention_cleanup';
  const startedAt = new Date();

  // 1. Check or initialize checkpoint
  const existing = await getCheckpointState(jobName);

  await db.execute(sql`
    INSERT INTO cleanup_checkpoints (job, status, started_at, updated_at)
    VALUES (${jobName}, 'running', ${startedAt}, ${startedAt})
    ON CONFLICT (job) DO UPDATE SET
      status = 'running',
      started_at = EXCLUDED.started_at,
      updated_at = EXCLUDED.updated_at
  `);

  let visitorsCleaned = 0;
  let eventsCleaned = 0;
  let sessionsCleaned = 0;
  let pageViewsCleaned = 0;
  let errorsCleaned = 0;
  let performanceCleaned = 0;

  try {
    // 2. Run aggregations first so data is safely summarized before raw events are pruned
    await runHourlyAggregation();
    await runDailyAggregation();

    // 3. Load projects
    const allProjects = await db
      .select({
        id: projects.id,
        site_id: projects.site_id,
        visitor_retention_hours: projects.visitor_retention_hours,
        event_retention_days: projects.event_retention_days,
      })
      .from(projects)
      .where(ne(projects.status, 'deleted'));

    for (const proj of allProjects) {
      const now = new Date();

      // --- 3A. Visitor Identity Retention (Default 24 hours) ---
      const visitorHours = proj.visitor_retention_hours && proj.visitor_retention_hours > 0
        ? proj.visitor_retention_hours
        : 24;
      const visitorCutoff = new Date(now.getTime() - visitorHours * 3600 * 1000);

      let moreVisitors = true;
      while (moreVisitors) {
        // Query IDs in batches to avoid locking tables
        const candidateRows = await db.execute(sql`
          SELECT id FROM visitors
          WHERE site_id = ${proj.site_id}
            AND last_seen_at < ${visitorCutoff}
          LIMIT ${batchSize}
        `);

        const ids = (candidateRows.rows as any[]).map((r) => r.id);
        if (ids.length === 0) {
          moreVisitors = false;
          break;
        }

        // Anonymize visitor_id in events and sessions first, then delete visitor records
        if (ids.length > 0) {
          await db
            .update(events)
            .set({ visitor_id: null })
            .where(inArray(events.visitor_id, ids))
            .catch(() => {});

          await db
            .update(sessions)
            .set({ visitor_id: null })
            .where(inArray(sessions.visitor_id, ids))
            .catch(() => {});

          await db
            .delete(visitors)
            .where(inArray(visitors.id, ids));
        }

        visitorsCleaned += ids.length;

        // Update checkpoint progress
        await updateCheckpointProgress(jobName, ids[ids.length - 1], visitorCutoff);

        if (ids.length < batchSize) {
          moreVisitors = false;
        }
      }

      // --- 3B. Event Retention (Default 90 days, or admin configured) ---
      const eventDays = proj.event_retention_days && proj.event_retention_days > 0
        ? proj.event_retention_days
        : 90;
      const eventCutoff = new Date(now.getTime() - eventDays * 24 * 3600 * 1000);

      // Prune events
      let moreEvents = true;
      while (moreEvents) {
        const candidateEvents = await db.execute(sql`
          SELECT event_id FROM events
          WHERE site_id = ${proj.site_id}
            AND timestamp < ${eventCutoff}
          LIMIT ${batchSize}
        `);

        const eventIds = (candidateEvents.rows as any[]).map((r) => r.event_id);
        if (eventIds.length === 0) {
          moreEvents = false;
          break;
        }

        await db
          .delete(events)
          .where(inArray(events.event_id, eventIds));

        eventsCleaned += eventIds.length;
        await updateCheckpointProgress(jobName, eventIds[eventIds.length - 1], eventCutoff);

        if (eventIds.length < batchSize) {
          moreEvents = false;
        }
      }

      // Prune orphaned page_views
      const pvRes = await db.execute(sql`
        DELETE FROM page_views
        WHERE site_id = ${proj.site_id} AND timestamp < ${eventCutoff}
      `);
      pageViewsCleaned += (pvRes as any).rowCount || 0;

      // Prune sessions older than retention
      const sessRes = await db.execute(sql`
        DELETE FROM sessions
        WHERE site_id = ${proj.site_id} AND last_seen_at < ${eventCutoff}
      `);
      sessionsCleaned += (sessRes as any).rowCount || 0;

      // Prune error_events older than retention
      const errRes = await db.execute(sql`
        DELETE FROM error_events
        WHERE site_id = ${proj.site_id} AND timestamp < ${eventCutoff}
      `);
      errorsCleaned += (errRes as any).rowCount || 0;

      // Prune performance_metrics older than retention
      const perfRes = await db.execute(sql`
        DELETE FROM performance_metrics
        WHERE site_id = ${proj.site_id} AND timestamp < ${eventCutoff}
      `);
      performanceCleaned += (perfRes as any).rowCount || 0;
    }

    // Mark completed
    const completedAt = new Date();
    await db.execute(sql`
      UPDATE cleanup_checkpoints
      SET status = 'completed', updated_at = ${completedAt}
      WHERE job = ${jobName}
    `);

    const finalCheckpoint = await getCheckpointState(jobName);

    return {
      visitorsCleaned,
      eventsCleaned,
      sessionsCleaned,
      pageViewsCleaned,
      errorsCleaned,
      performanceCleaned,
      checkpoints: finalCheckpoint || {},
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  } catch (error: any) {
    await db.execute(sql`
      UPDATE cleanup_checkpoints
      SET status = 'failed', updated_at = NOW()
      WHERE job = ${jobName}
    `).catch(() => {});
    throw error;
  }
}

async function getCheckpointState(jobName: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(cleanupCheckpoints)
    .where(eq(cleanupCheckpoints.job, jobName))
    .limit(1);
  return rows[0] || null;
}

async function updateCheckpointProgress(jobName: string, lastId: string, lastTimestamp: Date) {
  const db = getDatabase();
  await db.execute(sql`
    UPDATE cleanup_checkpoints
    SET
      last_processed_id = ${lastId},
      last_processed_timestamp = ${lastTimestamp},
      updated_at = NOW()
    WHERE job = ${jobName}
  `).catch(() => {});
}
