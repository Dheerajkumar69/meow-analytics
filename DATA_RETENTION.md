# Data Retention, Aggregation & Governance — Meow Analytics

This guide describes how Meow Analytics manages the data lifecycle, including configurable retention schedules, rollup aggregations, resumable cleanup jobs, checkpoints, data deletion, and exports.

---

## 1. Retention Policies Overview

Meow Analytics separates high-frequency raw telemetry from historical trends to minimize storage growth, protect visitor privacy, and maintain high query performance.

| Data Type | Default Retention | Configurable Options | Storage Layer |
| :--- | :--- | :--- | :--- |
| **Visitor Identity Data** | **24 hours** | 1 to 8760 hours (custom) | `visitors` table |
| **Raw Events & Telemetry** | **90 days** | 7, 30, 90, 180, 365 days | `events`, `page_views`, `error_events`, `performance_metrics` |
| **Hourly Aggregates** | **365 days** | Compressed into daily stats | `hourly_aggregates` table |
| **Daily Aggregates** | **Indefinite** | Preserved for historical reporting | `daily_aggregates` table |

---

## 2. Aggregation Pipeline

To prevent database bloat while maintaining long-term visibility, raw data flows through a multi-stage rollup pipeline:

```text
Raw Events & Page Views
         │
         ▼
 ┌─────────────────┐
 │ Hourly Rollup   │  --> Grouped by date_trunc('hour', timestamp)
 └─────────────────┘      Stored in `hourly_aggregates`
         │
         ▼
 ┌─────────────────┐
 │ Daily Rollup    │  --> Grouped by date_trunc('day', bucket_time)
 └─────────────────┘      Stored in `daily_aggregates`
```

### Metrics Preserved in Rollups:
- `page_views`: Total qualifying page views in the time window
- `visitors`: Maximum estimated unique visitors
- `sessions`: Total unique sessions
- `events`: Total events (custom events, errors, downloads, clicks)
- `bounces`: Total single-page sessions
- `duration_seconds`: Total accumulated session duration

Historical dashboard queries automatically query aggregate tables when viewing wide time ranges, delivering sub-millisecond response times.

---

## 3. Scheduled Cleanup Engine & Checkpoints

Cleanup operations are designed to run safely in production without blocking incoming telemetry:

### 3.1 Batch Processing
- Records are deleted in controlled batches (default: 500 records per transaction).
- Giant `DELETE FROM table` statements are avoided, preventing transaction log saturation and table locks.

### 3.2 Checkpoints & Resumability
Cleanup jobs maintain state in the `cleanup_checkpoints` table:

```sql
CREATE TABLE cleanup_checkpoints (
  job VARCHAR(64) PRIMARY KEY,
  status VARCHAR(32) NOT NULL DEFAULT 'idle',
  last_processed_id VARCHAR(128),
  last_processed_timestamp TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- **Resumable**: If a worker or container restarts during cleanup, the job inspects `last_processed_timestamp` and resumes where it left off rather than starting from zero.
- **Idempotent**: Running the cleanup job multiple times produces the exact same clean state without errors or data duplication.

### 3.3 Triggering Maintenance via API
Administrative endpoints allow triggering or monitoring cleanup on demand:
- `POST /api/v1/system/cleanup`: Runs batch retention cleanup.
- `POST /api/v1/system/aggregate`: Runs hourly and daily rollup aggregations.
- `GET /api/v1/system/cleanup/status`: Inspects checkpoint states and run timestamps.

---

## 4. On-Demand Data Deletion

Meow Analytics provides three granular data deletion capabilities via the API and dashboard:

### 4.1 Delete Project (Hard Delete)
- **Endpoint**: `DELETE /api/v1/projects/:id`
- **Behavior**: Permanently deletes the project row. PostgreSQL foreign key constraints (`ON DELETE CASCADE`) automatically purge all associated records across:
  - `visitors`
  - `sessions`
  - `events`
  - `page_views`
  - `error_events`
  - `performance_metrics`
  - `project_domains`
  - `api_keys`
  - `hourly_aggregates`
  - `daily_aggregates`

### 4.2 Delete Date Range
- **Endpoint**: `DELETE /api/v1/projects/:id/data`
- **Payload**:
  ```json
  {
    "from": "2026-09-01T00:00:00.000Z",
    "to": "2026-09-07T23:59:59.999Z"
  }
  ```
- **Behavior**: Physically deletes all events, page views, sessions, error events, and performance metrics within the specified time window for that project.

### 4.3 Delete Visitor Data
- **Endpoint**: `DELETE /api/v1/projects/:id/visitors`
- **Behavior**: Immediately purges visitor identity records matching a `visitorId`, `anonymousId`, or older than specified hours, and nullifies visitor references in session and event rows.

---

## 5. Data Export

Users can export raw and aggregated analytics data in standard formats:

- **Endpoint**: `GET /api/v1/projects/:id/export?format=json|csv&type=events|sessions|page_views|all&from=...&to=...`
- **Formats**:
  - `json`: Structured JSON array with full metadata.
  - `csv`: RFC 4180-compliant comma-separated values with column headers.
- **Privacy Guarantee**: Raw IP addresses are **never** included in export datasets.
- **Spreadsheet Security**: CSV cells starting with formula injection characters (`=`, `+`, `-`, `@`) are sanitized to prevent macro execution in Excel or Google Sheets.
