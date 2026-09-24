import { BatchPayload, MeowConfig, MeowEvent } from './types.js';

export interface EventQueue {
  enqueue: (event: MeowEvent) => void;
  flush: (useBeacon?: boolean) => Promise<void>;
  drainOfflineQueue: () => void;
  destroy: () => void;
  getQueueLength: () => number;
}

export function createEventQueue(config: MeowConfig): EventQueue {
  const batchSize = config.batchSize ?? 10;
  const flushIntervalMs = config.flushIntervalMs ?? 5000;
  const maxQueueSize = config.maxQueueSize ?? 50;
  const storageKey = `__meow_queue_${config.siteId}`;

  let memoryQueue: MeowEvent[] = [];
  let retryQueue: { event: MeowEvent; attempts: number }[] = [];
  let flushTimer: any = null;
  let retryTimer: any = null;
  let isFlushing = false;
  let isDestroyed = false;

  function log(msg: string, ...args: any[]): void {
    if (config.debug) {
      console.log(`[MeowAnalytics] ${msg}`, ...args);
    }
  }

  function getEndpointUrl(): string {
    const host = config.host ? config.host.replace(/\/$/, '') : '';
    const endpoint = config.endpoint || '/api/v1/collect';
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    if (host) {
      return `${host}${cleanEndpoint}`;
    }

    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}${cleanEndpoint}`;
    }

    return cleanEndpoint;
  }

  // --- Offline Storage Management (Strictly Capped) ---

  function saveToOfflineStorage(events: MeowEvent[]): void {
    if (typeof window === 'undefined' || !window.localStorage || events.length === 0) return;

    try {
      const existingRaw = window.localStorage.getItem(storageKey);
      let existing: MeowEvent[] = existingRaw ? JSON.parse(existingRaw) : [];

      if (!Array.isArray(existing)) {
        existing = [];
      }

      // Append new events
      const combined = [...existing, ...events];

      // Enforce strict maximum queue size: retain only newest events up to maxQueueSize
      const trimmed = combined.slice(-maxQueueSize);

      window.localStorage.setItem(storageKey, JSON.stringify(trimmed));
      log(`Saved ${events.length} event(s) to offline storage. Total: ${trimmed.length}`);
    } catch (err) {
      // LocalStorage quota exceeded or disabled: fail silently
      log('Could not save to offline storage (quota or private mode):', err);
    }
  }

  function loadFromOfflineStorage(): MeowEvent[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        window.localStorage.removeItem(storageKey);
        return parsed.slice(-maxQueueSize);
      }
    } catch (err) {
      log('Error reading from offline storage:', err);
    }

    return [];
  }

  function drainOfflineQueue(): void {
    try {
      const offlineEvents = loadFromOfflineStorage();
      if (offlineEvents.length > 0) {
        log(`Restored ${offlineEvents.length} event(s) from offline storage`);
        for (const ev of offlineEvents) {
          enqueue(ev);
        }
      }
    } catch {
      // Fail silently
    }
  }

  // --- Batch Flush Logic ---

  function scheduleFlush(): void {
    if (flushTimer || isDestroyed) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, flushIntervalMs);
  }

  function clearFlushTimer(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  async function sendViaFetch(url: string, payload: BatchPayload, useKeepAlive = true): Promise<{ ok: boolean; status: number }> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => {
      try {
        controller?.abort();
      } catch {}
    }, 4000); // 4-second hard timeout for failure isolation

    try {
      // BUG-F FIX: When useKeepAlive is true (page-unload / beacon-fallback path),
      // use text/plain so the browser doesn't fire a CORS preflight on unload.
      // The server already parses text/plain (added for navigator.sendBeacon support).
      // Using application/json here would trigger a preflight that the browser
      // cancels on unload, causing the request to be silently dropped.
      const isUnload = useKeepAlive;
      const body = JSON.stringify(payload);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': isUnload ? 'text/plain;charset=UTF-8' : 'application/json',
        },
        body,
        keepalive: useKeepAlive,
        signal: controller?.signal,
      });
      clearTimeout(timeout);
      return { ok: res.ok, status: res.status };
    } catch (err: any) {
      clearTimeout(timeout);
      return { ok: false, status: 0 };
    }
  }

  function sendViaBeacon(url: string, payload: BatchPayload): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return false;
    }

    try {
      // text/plain blob avoids CORS preflight on sendBeacon
      const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=UTF-8' });
      return navigator.sendBeacon(url, blob);
    } catch {
      return false;
    }
  }

  async function flush(useBeacon = false): Promise<void> {
    if (isDestroyed || isFlushing) return;

    // Drain retry queue items ready for sending
    const eventsToSend = [...memoryQueue];
    memoryQueue = [];
    clearFlushTimer();

    if (eventsToSend.length === 0) {
      return;
    }

    // Check if browser is strictly offline
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      log('Browser is offline, routing events to offline storage');
      saveToOfflineStorage(eventsToSend);
      return;
    }

    isFlushing = true;
    const url = getEndpointUrl();
    const payload: BatchPayload = {
      siteId: config.siteId,
      events: eventsToSend,
    };

    try {
      if (useBeacon) {
        const beaconSuccess = sendViaBeacon(url, payload);
        if (beaconSuccess) {
          log(`Dispatched ${eventsToSend.length} event(s) via sendBeacon`);
          isFlushing = false;
          return;
        }
        // Fallback to fetch with keepalive if beacon returns false
        log('Beacon rejected or unsupported, falling back to fetch(keepalive)');
      }

      const result = await sendViaFetch(url, payload, useBeacon);

      if (result.ok) {
        log(`Successfully ingested batch of ${eventsToSend.length} event(s)`);
      } else {
        handleSendFailure(eventsToSend, result.status);
      }
    } catch (err) {
      handleSendFailure(eventsToSend, 0);
    } finally {
      isFlushing = false;
    }
  }

  function handleSendFailure(failedEvents: MeowEvent[], statusCode: number): void {
    // Section 8: "Do not retry permanent 4xx errors."
    // Permanent 4xx client errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable)
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      log(`Permanent error (${statusCode}) encountered; dropping ${failedEvents.length} event(s) without retry`);
      return;
    }

    // Network error (status 0), rate-limited (429), or server error (5xx)
    log(`Temporary ingestion failure (status: ${statusCode}); scheduling retry with backoff & jitter`);

    // Add to retry queue with attempt counter
    for (const ev of failedEvents) {
      const existing = retryQueue.find((r) => r.event.eventId === ev.eventId);
      if (existing) {
        existing.attempts += 1;
      } else {
        retryQueue.push({ event: ev, attempts: 1 });
      }
    }

    // Filter out items that exceeded max retries (e.g. 3 attempts)
    const validRetries: { event: MeowEvent; attempts: number }[] = [];
    for (const item of retryQueue) {
      if (item.attempts <= 3) {
        validRetries.push(item);
      } else {
        log(`Max retries exceeded for event ${item.event.eventId}; discarding`);
      }
    }
    retryQueue = validRetries;

    if (retryQueue.length === 0) return;

    // Check if offline: if offline now, save directly to offline storage
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const itemsToSave = retryQueue.map((r) => r.event);
      retryQueue = [];
      saveToOfflineStorage(itemsToSave);
      return;
    }

    // Schedule retry with exponential backoff & jitter
    scheduleRetry();
  }

  function scheduleRetry(): void {
    if (retryTimer || isDestroyed) return;

    // Find highest attempt count
    const maxAttempt = retryQueue.reduce((max, item) => Math.max(max, item.attempts), 1);

    // Exponential backoff: base 1000ms * 2^(attempts-1) with random jitter
    const baseDelay = 1000 * Math.pow(2, maxAttempt - 1);
    const jitter = Math.random() * 500;
    const delay = Math.min(baseDelay + jitter, 10000);

    log(`Scheduling retry in ${Math.round(delay)}ms (attempt ${maxAttempt})`);

    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (retryQueue.length > 0) {
        const toReEnqueue = retryQueue.map((r) => r.event);
        retryQueue = [];
        for (const ev of toReEnqueue) {
          enqueue(ev);
        }
      }
    }, delay);
  }

  function enqueue(event: MeowEvent): void {
    if (isDestroyed) return;

    // Enforce strict queue size
    if (memoryQueue.length >= maxQueueSize) {
      // Drop oldest to prevent unbounded memory usage
      memoryQueue.shift();
    }

    memoryQueue.push(event);
    log(`Enqueued event ${event.type} (${event.eventId}). Queue size: ${memoryQueue.length}`);

    // Flush immediately if batch size reached
    if (memoryQueue.length >= batchSize) {
      clearFlushTimer();
      flush().catch(() => {});
    } else {
      scheduleFlush();
    }
  }

  // --- Browser Lifecycle Listeners ---

  function handleVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      log('Page hidden; flushing pending events via beacon');
      flush(true).catch(() => {});
    }
  }

  function handlePageHide(): void {
    log('Page unload/pagehide; flushing pending events via beacon');
    flush(true).catch(() => {});
  }

  function handleOnline(): void {
    log('Network connection restored');
    drainOfflineQueue();
  }

  if (typeof window !== 'undefined') {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('online', handleOnline);

    // Drain any leftover events from previous offline sessions
    drainOfflineQueue();
  }

  function destroy(): void {
    isDestroyed = true;
    clearFlushTimer();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    if (typeof window !== 'undefined') {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('online', handleOnline);
    }

    memoryQueue = [];
    retryQueue = [];
  }

  return {
    enqueue,
    flush,
    drainOfflineQueue,
    destroy,
    getQueueLength: () => memoryQueue.length,
  };
}
