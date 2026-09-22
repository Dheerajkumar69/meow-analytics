import { buildApp } from '../apps/api/src/app.js';
import { migrateDatabase, closeDatabaseConnection, getDatabase } from '@meow-analytics/database';
import { sql } from 'drizzle-orm';

interface LatencyStats {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}

function calculatePercentiles(latencies: number[]): LatencyStats {
  if (latencies.length === 0) {
    return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / sorted.length) * 100) / 100;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return {
    min: sorted[0],
    p50,
    p95,
    p99,
    max: sorted[sorted.length - 1],
    avg,
  };
}

export async function runLoadTest(options: {
  targetVisitors?: number;
  targetEvents?: number;
  concurrency?: number;
  batchSize?: number;
}) {
  const targetVisitors = options.targetVisitors ?? 100;
  const targetEvents = options.targetEvents ?? 1000;
  const concurrency = options.concurrency ?? 10;
  const batchSize = Math.min(options.batchSize ?? 10, 50);

  console.log(`\n🐾 ========================================================`);
  console.log(`   MEOW ANALYTICS LOAD TESTING SUITE                      `);
  console.log(`   Target Visitors:    ${targetVisitors.toLocaleString()}`);
  console.log(`   Target Events:      ${targetEvents.toLocaleString()}`);
  console.log(`   Concurrency:        ${concurrency}`);
  console.log(`   Batch Size:         ${batchSize}`);
  console.log(`==========================================================\n`);

  process.env.DATABASE_URL = process.env.DATABASE_URL || 'memory://';
  process.env.NODE_ENV = 'test';
  process.env.MEOW_SECRET = process.env.MEOW_SECRET || '12345678901234567890123456789012';
  process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'super_secret_admin_token_12345';
  process.env.CORS_ORIGINS = '*';
  process.env.RATE_LIMIT_ENABLED = 'false'; // Bypass client IP throttling during synthetic load generation

  await migrateDatabase();
  const app = await buildApp();
  const db = getDatabase();

  const siteId = `site_load_${Date.now()}`;

  // Seed project
  await db.execute(sql`
    INSERT INTO projects (id, name, site_id, status)
    VALUES ('proj_load', 'Load Test Project', ${siteId}, 'active')
    ON CONFLICT (site_id) DO NOTHING
  `);

  // Measure initial DB latency
  const dbStart = process.hrtime.bigint();
  await db.execute(sql`SELECT 1`);
  const initialDbLatencyMs = Number(process.hrtime.bigint() - dbStart) / 1_000_000;

  const startMemory = process.memoryUsage();
  const startCpu = process.cpuUsage();
  const startTime = Date.now();

  // Generate payloads in batches
  const batches: Array<{ siteId: string; events: any[] }> = [];
  let eventsCount = 0;
  let visitorIdx = 0;

  while (eventsCount < targetEvents) {
    const batchEvents: any[] = [];
    const thisBatchSize = Math.min(batchSize, targetEvents - eventsCount);

    for (let i = 0; i < thisBatchSize; i++) {
      const vId = `vis_${visitorIdx % targetVisitors}`;
      const sId = `ses_${visitorIdx % targetVisitors}_${Math.floor(eventsCount / 10)}`;
      const isPv = i % 2 === 0;

      batchEvents.push({
        eventId: `ev_${eventsCount}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: isPv ? 'page_view' : 'custom',
        eventName: isPv ? undefined : 'button_click',
        path: `/page-${(eventsCount % 20) + 1}`,
        hostname: 'loadtest.example.com',
        referrer: 'https://google.com/search',
        timestamp: Date.now() - (eventsCount % 1000) * 100,
        visitorId: vId,
        sessionId: sId,
        properties: isPv ? {} : { button: 'cta_signup', step: 2 },
      });

      eventsCount++;
      visitorIdx++;
    }

    batches.push({ siteId, events: batchEvents });
  }

  console.log(`📦 Generated ${batches.length.toLocaleString()} batches containing ${eventsCount.toLocaleString()} total events.`);
  console.log(`🚀 Executing ingestion across ${concurrency} parallel workers...`);

  const latencies: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let totalIngested = 0;

  let queueIdx = 0;

  async function worker() {
    while (queueIdx < batches.length) {
      const idx = queueIdx++;
      const batch = batches[idx];
      if (!batch) break;

      const reqStart = process.hrtime.bigint();
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/collect',
          payload: batch,
          headers: {
            'content-type': 'application/json',
          },
        });

        const reqDurationMs = Number(process.hrtime.bigint() - reqStart) / 1_000_000;
        latencies.push(reqDurationMs);

        if (res.statusCode === 200) {
          successfulRequests++;
          const data = JSON.parse(res.payload);
          totalIngested += Number(data.ingested || 0);
        } else {
          failedRequests++;
        }
      } catch (err: any) {
        failedRequests++;
        const reqDurationMs = Number(process.hrtime.bigint() - reqStart) / 1_000_000;
        latencies.push(reqDurationMs);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const durationMs = Date.now() - startTime;
  const durationSec = durationMs / 1000;
  const endCpu = process.cpuUsage(startCpu);
  const endMemory = process.memoryUsage();

  // Measure final DB latency
  const finalDbStart = process.hrtime.bigint();
  await db.execute(sql`SELECT 1`);
  const finalDbLatencyMs = Number(process.hrtime.bigint() - finalDbStart) / 1_000_000;

  const latencyStats = calculatePercentiles(latencies);
  const reqThroughput = Math.round((batches.length / durationSec) * 10) / 10;
  const eventThroughput = Math.round((totalIngested / durationSec) * 10) / 10;
  const errorRate = Math.round((failedRequests / batches.length) * 1000) / 10;

  const cpuUserSec = Math.round((endCpu.user / 1_000_000) * 100) / 100;
  const cpuSystemSec = Math.round((endCpu.system / 1_000_000) * 100) / 100;
  const memoryRssDiffMb = Math.round(((endMemory.rss - startMemory.rss) / (1024 * 1024)) * 100) / 100;
  const memoryHeapUsedMb = Math.round((endMemory.heapUsed / (1024 * 1024)) * 100) / 100;

  console.log(`\n==========================================================`);
  console.log(`                LOAD TEST RESULTS                         `);
  console.log(`==========================================================`);
  console.log(`  Duration:             ${durationSec.toFixed(2)}s`);
  console.log(`  Total Requests:       ${batches.length.toLocaleString()}`);
  console.log(`  Successful:           ${successfulRequests.toLocaleString()}`);
  console.log(`  Failed:               ${failedRequests.toLocaleString()}`);
  console.log(`  Total Events Ingested:${totalIngested.toLocaleString()}`);
  console.log(`  Error Rate:           ${errorRate}%`);
  console.log(`----------------------------------------------------------`);
  console.log(`  Request Throughput:   ${reqThroughput} req/s`);
  console.log(`  Event Throughput:     ${eventThroughput} events/s`);
  console.log(`----------------------------------------------------------`);
  console.log(`  Latency p50:          ${latencyStats.p50.toFixed(2)} ms`);
  console.log(`  Latency p95:          ${latencyStats.p95.toFixed(2)} ms`);
  console.log(`  Latency p99:          ${latencyStats.p99.toFixed(2)} ms`);
  console.log(`  Latency min / max:    ${latencyStats.min.toFixed(2)} ms / ${latencyStats.max.toFixed(2)} ms`);
  console.log(`----------------------------------------------------------`);
  console.log(`  CPU (User / System):  ${cpuUserSec}s / ${cpuSystemSec}s`);
  console.log(`  Heap Used:            ${memoryHeapUsedMb} MB (Δ RSS: ${memoryRssDiffMb} MB)`);
  console.log(`  Database Latency:     initial: ${initialDbLatencyMs.toFixed(2)}ms | post-load: ${finalDbLatencyMs.toFixed(2)}ms`);
  console.log(`==========================================================\n`);

  await app.close();
  await closeDatabaseConnection();

  return {
    durationSec,
    totalBatches: batches.length,
    successfulRequests,
    failedRequests,
    totalIngested,
    errorRate,
    reqThroughput,
    eventThroughput,
    latencyStats,
    memoryHeapUsedMb,
    initialDbLatencyMs,
    finalDbLatencyMs,
  };
}

// CLI entry point
if (process.argv[1]?.endsWith('load-test.ts')) {
  const visitorsArg = process.argv.find((a) => a.startsWith('--visitors='));
  const eventsArg = process.argv.find((a) => a.startsWith('--events='));
  const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='));

  const targetVisitors = visitorsArg ? parseInt(visitorsArg.split('=')[1], 10) : 100;
  const targetEvents = eventsArg ? parseInt(eventsArg.split('=')[1], 10) : 1000;
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 10;

  runLoadTest({ targetVisitors, targetEvents, concurrency })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Load test error:', err);
      process.exit(1);
    });
}
