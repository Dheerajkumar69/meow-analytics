# Meow Analytics — Phase 3: Visitor Identity, Sessions & Privacy Architecture

## 1. Core Philosophy

Meow Analytics answers:

> *"How many estimated unique visitors are actually coming to my website?"*

without becoming a surveillance platform or pretending that web analytics can identify physical human beings with 100% certainty.

---

## 2. The "Estimated Unique Visitors" Limitation

The analytics dashboard and APIs explicitly label this metric as:

```text
Estimated Unique Visitors
```

**NEVER** "Exact People".

### Why Analytics Measures Devices & Browsers, Not People:
1. **One Person → Multiple Devices**: A person visiting from their MacBook at home and iPhone on mobile generates two distinct client identities (`mv_*`).
2. **Multiple People → Same Device / Network**: Family members or office coworkers sharing a laptop or office router share contexts.
3. **VPN & Cellular Networks**: IP addresses rotate frequently across mobile towers and VPN nodes.
4. **Private Browsing Mode**: Opening an incognito window creates a sandbox without access to existing local storage, generating a new identity.
5. **Cookie / Storage Blocking**: When first-party storage is blocked, identity is estimated using a 24-hour rotating privacy fallback.

---

## 3. Visitor ID Specification

### Client-Side First-Party Anonymous ID
- Format: `mv_<random24>` (e.g. `mv_9a2f7c81d0e45b6a38210f92`).
- Generated client-side using `crypto.getRandomValues`.
- **Zero Invasiveness**: Never derived from email, phone, name, IP address, or browser fingerprinting.
- **Storage Strategy**: Stored in `localStorage` (`_meow_vid`), with automatic fallback to first-party cookie or in-memory session.

### Server-Side Privacy-Preserving Fallback
When a client disables storage or cookies and no `visitorId` is supplied:

```text
anonymous_id = HMAC-SHA256(
  secret,
  normalizedIP + userAgent + rotatingTimeBucket + siteId
)
```

- **Rotating Time Bucket**: Default `24 hours` (`Math.floor(now / (24 * 3600 * 1000))`).
- **Prefix**: `mv_s_<hash24>`.
- **Zero IP Persistence**: The raw IP address is only inspected in memory during HMAC computation. It is **never** written to database tables or exposed over APIs.
- **Automatic Identity Expiry**: After 24 hours, the rotating bucket naturally changes, causing the hash to rotate automatically.

---

## 4. Session System & Lifecycle

### Schema
A session record (`sessions` table) tracks:
- `id`: Unique record ID (`ses_*`)
- `session_id`: Session identifier (`ms_*`)
- `site_id`: Project site identifier
- `visitor_id`: Internal visitor ID
- `started_at`: Timestamp of first event in session
- `last_seen_at`: Timestamp of most recent activity in session
- `landing_page`: First page viewed
- `exit_page`: Last page viewed
- `page_views`: Count of qualifying page views in this session
- `event_count`: Total events (page views + heartbeats)
- `is_bounce`: `true` if `page_views <= 1`, `false` otherwise
- `duration_seconds`: `max(0, round((last_seen_at - started_at) / 1000))`
- `is_returning`: `true` if visitor already had previous sessions on this site

### Session Rules
- **Activity within 30 Minutes**: Belongs to the same session. `last_seen_at`, `exit_page`, and `duration_seconds` are updated.
- **Inactivity Timeout (30 Minutes)**: If more than 30 minutes elapse without activity, subsequent requests trigger a new session.
- **Browser Context Separation**: Sessions are stored in `sessionStorage` (`_meow_sid`), ensuring new browser sessions or tab lifecycles are accurately delineated.

---

## 5. Metric Definitions

### 1. Estimated Unique Visitors
The count of distinct `visitor_id` values active in sessions within the selected time window:
$$\text{Unique Visitors} = \text{COUNT}(\text{DISTINCT } \text{visitor\_id})$$

### 2. New Visitors
The count of distinct visitors whose first session ever on the site occurred within the selected window:
$$\text{New Visitors} = \text{COUNT}(\text{DISTINCT } \text{visitor\_id}) \text{ WHERE } \text{is\_returning} = \text{false}$$

### 3. Returning Visitors
The count of distinct visitors active in the window who had at least one prior session:
$$\text{Returning Visitors} = \text{COUNT}(\text{DISTINCT } \text{visitor\_id}) \text{ WHERE } \text{is\_returning} = \text{true}$$

### 4. Returning Visitor Rate
$$\text{Returning Visitor Rate} = \frac{\text{Returning Visitors}}{\text{Unique Visitors}} \times 100\%$$
(Returns `0%` if Unique Visitors is 0).

### 5. Bounce Rate
Standard definition: sessions containing exactly one qualifying page view divided by total sessions:
$$\text{Bounce Rate} = \frac{\text{Sessions with page\_views } = 1}{\text{Total Sessions}} \times 100\%$$
(Returns `0%` if Total Sessions is 0).

### 6. Pages Per Session
$$\text{Pages / Session} = \frac{\text{Total Page Views}}{\text{Total Sessions}}$$
(Safe against division by zero: returns `0` if Total Sessions is 0).

### 7. Average Session Duration
$$\text{Avg Duration} = \frac{\sum \text{duration\_seconds}}{\text{Total Sessions}}$$
Durations are bounded: $\text{duration} \ge 0$.

### 8. Live Visitors
The count of distinct `visitor_id` values active in sessions where `last_seen_at` is within the previous 5 minutes:
$$\text{Live Visitors} = \text{COUNT}(\text{DISTINCT } \text{visitor\_id}) \text{ WHERE } \text{last\_seen\_at} \ge \text{NOW}() - 5\text{ minutes}$$

---

## 6. Lightweight Heartbeat (Live Tracking)

- SDK sends a lightweight `ping` event every **60 seconds** while the page is actively visible (`document.visibilityState !== 'hidden'`).
- **Safety**:
  - Heartbeats do **not** increment `page_views`.
  - Heartbeats do **not** clear a bounce status (a visitor reading a single article for 10 minutes still records `page_views = 1`, maintaining bounce integrity).
  - Heartbeats accurately keep `last_seen_at` and `duration_seconds` up-to-date.

---

## 7. Race Conditions & Concurrency Safety

All database mutations use atomic SQL upserts with PostgreSQL/PGlite unique constraints:

```sql
INSERT INTO visitors (...)
VALUES (...)
ON CONFLICT (site_id, anonymous_id) DO UPDATE SET
  last_seen_at = GREATEST(visitors.last_seen_at, EXCLUDED.last_seen_at),
  last_path = EXCLUDED.last_path
RETURNING id, first_seen_at;
```

```sql
INSERT INTO sessions (...)
VALUES (...)
ON CONFLICT (site_id, session_id) DO UPDATE SET
  last_seen_at = GREATEST(sessions.last_seen_at, EXCLUDED.last_seen_at),
  exit_page = EXCLUDED.exit_page,
  page_views = sessions.page_views + EXCLUDED.page_views,
  event_count = sessions.event_count + EXCLUDED.event_count,
  is_bounce = (sessions.page_views + EXCLUDED.page_views) <= 1,
  duration_seconds = GREATEST(0, CAST(EXTRACT(EPOCH FROM (GREATEST(sessions.last_seen_at, EXCLUDED.last_seen_at) - sessions.started_at)) AS INTEGER));
```

If multiple requests from the same visitor arrive simultaneously, atomic upsert locks prevent duplicate visitor rows or duplicate session records.

---

## 8. Dashboard Analytics API Reference

All endpoints accept `siteId` (or project `id`) and optional ISO timestamp strings `from` and `to`.

### `GET /analytics/visitors`
Returns unique visitors, new visitors, returning visitors, returning visitor rate, and recent visitor records.

### `GET /analytics/sessions`
Returns total sessions, total page views, bounce rate, average session duration, pages per session, and recent sessions list.

### `GET /analytics/live`
Accepts `windowMinutes` (default `5`) and returns real-time live visitors count, active sessions, and top active pages.

### `GET /analytics/overview`
Combined single-request endpoint returning all core metrics for dashboard summary widgets.
