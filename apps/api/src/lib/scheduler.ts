import { runHourlyAggregation, runDailyAggregation } from './aggregation.js';
import { runRetentionCleanup } from './cleanup.js';
import { getConfig } from '@meow-analytics/config';

let hourlyTimer: NodeJS.Timeout | null = null;
let dailyTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;
let isRunning = false;

export function startScheduler(): void {
  const config = getConfig();

  if (isRunning) return;
  if (config.ENABLE_BACKGROUND_WORKERS === false) {
    console.log('⏸️ Background scheduler disabled by configuration.');
    return;
  }

  isRunning = true;
  console.log('⏰ Starting Meow Analytics Background Scheduler...');

  // 1. Hourly Aggregation Worker (Runs every 15 minutes)
  const HOURLY_INTERVAL = 15 * 60 * 1000;
  hourlyTimer = setInterval(async () => {
    try {
      const count = await runHourlyAggregation();
      if (count > 0 && config.NODE_ENV !== 'test') {
        console.log(`[Scheduler] Hourly aggregation completed: ${count} buckets processed`);
      }
    } catch (err: any) {
      console.error('[Scheduler] Hourly aggregation error:', err.message || err);
    }
  }, HOURLY_INTERVAL);

  // 2. Daily Aggregation Worker (Runs every 60 minutes)
  const DAILY_INTERVAL = 60 * 60 * 1000;
  dailyTimer = setInterval(async () => {
    try {
      const count = await runDailyAggregation();
      if (count > 0 && config.NODE_ENV !== 'test') {
        console.log(`[Scheduler] Daily aggregation completed: ${count} buckets processed`);
      }
    } catch (err: any) {
      console.error('[Scheduler] Daily aggregation error:', err.message || err);
    }
  }, DAILY_INTERVAL);

  // 3. Retention Cleanup Worker (Runs every 24 hours, default)
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
  cleanupTimer = setInterval(async () => {
    try {
      const report = await runRetentionCleanup();
      if (config.NODE_ENV !== 'test') {
        console.log(`[Scheduler] Retention cleanup completed:`, {
          visitorsCleaned: report.visitorsCleaned,
          eventsCleaned: report.eventsCleaned,
        });
      }
    } catch (err: any) {
      console.error('[Scheduler] Retention cleanup error:', err.message || err);
    }
  }, CLEANUP_INTERVAL);

  // Unref timers so they don't block process exit if unhandled
  hourlyTimer.unref();
  dailyTimer.unref();
  cleanupTimer.unref();
}

export function stopScheduler(): void {
  if (!isRunning) return;

  if (hourlyTimer) {
    clearInterval(hourlyTimer);
    hourlyTimer = null;
  }
  if (dailyTimer) {
    clearInterval(dailyTimer);
    dailyTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  isRunning = false;
  console.log('🛑 Background scheduler stopped.');
}
