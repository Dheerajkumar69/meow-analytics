# Meow Analytics — Production Deployment Guide

This guide provides step-by-step instructions for deploying Meow Analytics to production using **Render Free** with an external persistent PostgreSQL database.

---

## Architecture Overview

```text
┌─────────────────────────┐          ┌───────────────────────────┐
│       Host Website      │          │     Analytics Dashboard   │
│  (Loads meow.js async)  │          │  (React SPA / Static Site)│
└────────────┬────────────┘          └─────────────┬─────────────┘
             │                                     │
   POST /api/v1/collect                    GET /analytics/*
   (Batched & non-blocking)                (Cached & Token Auth)
             │                                     │
             ▼                                     ▼
      ┌──────────────────────────────────────────────────┐
      │          Meow Analytics API (Fastify)            │
      │   - Rate limiting, Backpressure & Deduplication  │
      │   - Periodic Aggregations & Checkpointed Cleanup │
      └────────────────────────┬─────────────────────────┘
                               │
                               ▼
      ┌──────────────────────────────────────────────────┐
      │           External PostgreSQL Database           │
      │       (Neon, Supabase, or Render Postgres)       │
      └──────────────────────────────────────────────────┘
```

---

## 1. Create database

> [!IMPORTANT]
> **Render Free Rule**: Do **NOT** use local filesystem storage (`./data/database.sqlite` or in-memory `memory://`) as the production database. Render Free instances spin down during inactivity and their local filesystem is ephemeral. Local data will be lost on spin-down or restart. You **must** use an external persistent PostgreSQL database.

### Recommended Providers (Free Tier available):
1. **Neon Serverless Postgres** (https://neon.tech) — Recommended:
   - Sign up and click **Create Project**.
   - Copy your connection string:
     ```text
     postgresql://username:password@ep-cool-snowflake-123456.us-east-2.aws.neon.tech/meow_analytics?sslmode=require
     ```
2. **Supabase** (https://supabase.com):
   - Create a project and retrieve the direct connection string under **Database Settings**.
3. **Render Managed PostgreSQL**:
   - In Render Dashboard, click **New +** -> **PostgreSQL**.
   - Copy the **External Connection String**.

---

## 2. Configure environment variables

Prepare the following production environment variables:

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | Must be set to `production`. Activates production safeguards, disables debug logs, and enforces external DB. | `production` |
| `PORT` | **Yes** | Port for Fastify to bind. Render sets this to `10000` automatically. | `10000` |
| `HOST` | No | Host bind address. Defaults to `0.0.0.0`. | `0.0.0.0` |
| `DATABASE_URL` | **Yes** | Connection string for external PostgreSQL with SSL. | `postgresql://user:pass@ep-xyz.neon.tech/meow?sslmode=require` |
| `DATABASE_SSL` | No | Forces SSL verification mode for managed Postgres. Defaults to `true` in production. | `true` |
| `MEOW_SECRET` | **Yes** | Cryptographic salt (minimum 32 characters) for rotating visitor privacy hashes. | `c48f87a0304a08bc74e2d3bbef99b0c78912e` |
| `ADMIN_SECRET` | **Yes** | Bearer authentication secret (minimum 16 characters) for admin & project creation APIs. | `adm_sec_f9823b49e018a47cd` |
| `CORS_ORIGINS` | **Yes** | Comma-delimited list of allowed dashboard/tracking domains, or `*`. | `https://dashboard.meowanalytics.dev,https://yourdomain.com` |
| `LOG_LEVEL` | No | Structured log level (`info`, `warn`, `error`). Defaults to `info`. | `info` |
| `RATE_LIMIT_ENABLED`| No | Enables rate limiting and burst protection. Defaults to `true`. | `true` |

Generate secure secrets via terminal:
```bash
# Generate MEOW_SECRET (32+ characters)
openssl rand -hex 32

# Generate ADMIN_SECRET (16+ characters)
openssl rand -hex 24
```

---

## 3. Deploy API

### Option A: Automatic Blueprint Deployment (Recommended)
1. Push your Meow Analytics repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **Blueprint**.
3. Connect your repository. Render will automatically discover [`render.yaml`](file:///mnt/slow/actualprojects/meow-analytics/render.yaml).
4. Fill in `DATABASE_URL` with your external Postgres connection string.
5. Render will generate `MEOW_SECRET` and `ADMIN_SECRET` automatically.
6. Click **Apply**.

### Option B: Manual Web Service Setup
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository:
   - **Environment**: `Node`
   - **Plan**: `Free`
   - **Build Command**: `npm install && npm run build:api`
   - **Start Command**: `npm run start -w @meow-analytics/api`
   - **Health Check Path**: `/api/health`
3. Under **Environment Variables**, add the variables from Step 2.
4. Click **Create Web Service**.

When the deployment finishes, verify health:
```bash
curl https://meow-analytics-api.onrender.com/api/health
# {"status":"ok"}

curl https://meow-analytics-api.onrender.com/api/ready
# {"status":"ready","database":"connected","timestamp":"..."}
```

---

## 4. Deploy dashboard

1. In Render Dashboard, click **New +** -> **Static Site**.
2. Select the repository:
   - **Name**: `meow-analytics-dashboard`
   - **Build Command**: `npm install && npm run build:dashboard`
   - **Publish Directory**: `apps/dashboard/dist`
3. Under **Environment Variables**:
   - `VITE_API_URL`: `https://meow-analytics-api.onrender.com` (your API service URL)
4. Under **Redirects/Rewrites**:
   - Add a rewrite rule for Single Page Application routing:
     - **Type**: `Rewrite`
     - **Source**: `/*`
     - **Destination**: `/index.html`
5. Click **Create Static Site**.

---

## 5. Configure domain

1. In Render Web Service settings, navigate to **Settings** -> **Custom Domains**.
2. Add your custom tracking domain, e.g. `analytics.yourcompany.com`.
3. In your DNS provider (Cloudflare, Namecheap, Route53), create a `CNAME` record pointing to Render's supplied target (e.g. `meow-analytics-api.onrender.com`).
4. Render automatically provisions a free Let's Encrypt TLS certificate.
5. Update `CORS_ORIGINS` on the API service to include your dashboard domain:
   ```text
   CORS_ORIGINS=https://dashboard.yourcompany.com,https://yourcompany.com
   ```

---

## 6. Create project

Create your first project using the API:

```bash
curl -X POST https://analytics.yourcompany.com/api/v1/projects \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Website",
    "privacyMode": "balanced",
    "visitorRetentionHours": 24,
    "eventRetentionDays": 90
  }'
```

Response:
```json
{
  "id": "proj_01j7abc...",
  "site_id": "site_8f19da...",
  "name": "Production Website",
  "privacy_mode": "balanced",
  "status": "active"
}
```

Save the `site_id`.

Create an API key for queries and dashboard:
```bash
curl -X POST https://analytics.yourcompany.com/api/v1/projects/proj_01j7abc.../keys \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name": "Dashboard Key"}'
```

---

## 7. Install SDK

Add the lightweight, non-blocking snippet into the `<head>` of your website:

```html
<!-- Meow Analytics -->
<script
  defer
  src="https://analytics.yourcompany.com/meow.js"
  data-site-id="site_8f19da..."
  data-auto-track="true">
</script>
```

### Cold Start Tolerance:
- The script uses `defer` and asynchronous batch transmission via `sendBeacon` and `fetch(keepalive)`.
- If the Render Free API is spinning up from a cold start (15-40s delay or 503 response), the SDK fails silently without throwing exceptions, holds events in bounded local storage, and retries with exponential backoff and jitter once the server wakes up.
- **Your website load and user experience are never blocked.**

### Custom Event Tracking:
```javascript
// Track custom actions
window.meowAnalytics.track('signup_completed', {
  plan: 'pro',
  referral_code: 'twitter2026'
});
```

---

## 8. Verify events

1. **Check Network Tab**:
   - Open your website in a browser.
   - In Developer Tools -> Network tab, observe:
     `POST https://analytics.yourcompany.com/api/v1/collect` -> Status `200 OK`
     Response: `{"success":true,"status":"ok","ingested":1,"duplicates":0}`
2. **Verify Real-Time Traffic**:
   - Open the Meow Analytics Dashboard.
   - Observe the **Live Traffic** card showing 1 active visitor on your page.
3. **Trigger Aggregations**:
   - Hourly and daily aggregates run automatically via background scheduler.
   - You can also manually trigger aggregation via API:
     ```bash
     curl -X POST https://analytics.yourcompany.com/api/v1/system/aggregate \
       -H "Authorization: Bearer YOUR_ADMIN_SECRET"
     ```
4. **Inspect Database Checkpoints**:
   ```bash
   curl https://analytics.yourcompany.com/api/v1/system/cleanup/status \
     -H "Authorization: Bearer YOUR_ADMIN_SECRET"
   ```

---

## Production Readiness Checklist (Definition of Done)

- [x] External PostgreSQL configured (Render Postgres, Neon, or Supabase).
- [x] Ephemeral local storage explicitly blocked in `NODE_ENV=production`.
- [x] `render.yaml` checked into source control.
- [x] Health checks `/api/health` and `/api/ready` passing.
- [x] Rate limiting, backpressure, and 64 KB payload limits active.
- [x] SDK failure isolation verified (website runs uninterrupted even if API is completely offline).
- [x] Exponential backoff with jitter on cold start responses.
- [x] Batch deduplication preventing double counting.
- [x] In-memory query caching accelerating historical analytics.
- [x] Database compound indexes inspected and verified with `EXPLAIN`.
- [x] Automated hourly and daily aggregation worker active.
- [x] Idempotent checkpointed data retention cleanup active.
