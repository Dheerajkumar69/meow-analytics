import { getDatabase } from '@meow-analytics/database';
import { executeEventBatchIngestion, IngestionBatchContext } from './ingest-batch.js';

export interface QueuedBatch {
  siteId: string;
  project: any;
  events: any[];
  context: IngestionBatchContext;
  resolve?: (result: { ingested: number; duplicates: number }) => void;
  reject?: (err: any) => void;
}

export class IngestionBuffer {
  private queue: QueuedBatch[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private maxBatchSize = 100;
  private flushIntervalMs = 1000;

  constructor(options?: { maxBatchSize?: number; flushIntervalMs?: number }) {
    if (options?.maxBatchSize) this.maxBatchSize = options.maxBatchSize;
    if (options?.flushIntervalMs) this.flushIntervalMs = options.flushIntervalMs;
  }

  public getQueueLength(): number {
    return this.queue.reduce((acc, b) => acc + b.events.length, 0);
  }

  public enqueue(batch: QueuedBatch): Promise<{ ingested: number; duplicates: number }> {
    return new Promise((resolve, reject) => {
      batch.resolve = resolve;
      batch.reject = reject;
      this.queue.push(batch);

      if (this.getQueueLength() >= this.maxBatchSize) {
        this.flush().catch(() => {});
      } else {
        this.scheduleFlush();
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch((err) => {
        console.error('[IngestionBuffer] Error during scheduled flush:', err);
      });
    }, this.flushIntervalMs);
    this.flushTimer.unref();
  }

  public async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Drain current queue
    const batchesToProcess = this.queue.splice(0, this.queue.length);
    const db = getDatabase();

    try {
      for (const batch of batchesToProcess) {
        try {
          const result = await executeEventBatchIngestion(db, batch.project, batch.events, batch.context);
          batch.resolve?.(result);
        } catch (err) {
          console.error(`[IngestionBuffer] Failed to ingest batch for site ${batch.siteId}:`, err);
          batch.reject?.(err);
        }
      }
    } finally {
      this.isFlushing = false;
      // If new events arrived while flushing, schedule another flush
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  public stop(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export const ingestionBuffer = new IngestionBuffer();
