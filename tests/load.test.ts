import { describe, it, expect } from 'vitest';
import { runLoadTest } from '../scripts/load-test.js';

describe('Meow Analytics — Phase 9 Load & Scalability Testing', () => {
  it('handles concurrent visitor load, measuring percentiles, throughput, and error rates', async () => {
    process.env.DATABASE_URL = 'memory://';
    const results = await runLoadTest({
      targetVisitors: 50,
      targetEvents: 500,
      concurrency: 5,
      batchSize: 10,
    });

    // Assertions for production grade load handling
    expect(results.errorRate).toBe(0);
    expect(results.successfulRequests).toBe(results.totalBatches);
    expect(results.totalIngested).toBe(500);

    // Latency assertions
    expect(results.latencyStats.p50).toBeGreaterThan(0);
    expect(results.latencyStats.p95).toBeLessThan(1000); // Sub-second p95 latency under concurrent load

    // Throughput assertions
    expect(results.eventThroughput).toBeGreaterThan(50); // Sustains at least 50+ events/sec
    expect(results.reqThroughput).toBeGreaterThan(5);

    // Latency stability
    expect(results.finalDbLatencyMs).toBeLessThan(500);
  }, 30000);
});
