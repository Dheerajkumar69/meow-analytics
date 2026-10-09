# Meow Analytics

> Production-grade, privacy-conscious, lightweight web analytics platform.

Meow Analytics is an enterprise-ready, open-source analytics platform featuring a robust analytical query engine, privacy-conscious visitor hashing, Core Web Vitals performance tracking, conversion funnels, cohort retention, and an intuitive, dense dashboard interface.

---

## Key Features

* **Authoritative Analytics Engine**: Standardized definitions for Visitors, Sessions, Page Views, Bounce Rate, and Duration across API, charts, and exports.
* **Real-Time Pulse**: Live online visitors, 30-minute minute-by-minute activity timeline sparkline, and real-time incoming pageview/event stream.
* **Traffic & Acquisition**: Organic, Direct, Referral, Social, Email, and Paid channels with full UTM campaign drilldown.
* **Audience Demographics**: Privacy-preserving country geography, device type, operating systems, and browsers.
* **Content Performance**: Top pages, landing pages (session entry), exit pages (session termination), and domain hostnames.
* **Conversion Funnels**: Multi-step sequential conversion analysis with step-to-step drop-off rates.
* **Cohort Retention**: Day, week, and month cohort retention heatmaps tracking longitudinal visitor return rates.
* **Real User Performance (Core Web Vitals)**: P50, P75, P90, P95, and P99 percentiles for LCP, INP, CLS, FCP, and TTFB.
* **Frontend Error Tracking**: Error fingerprinting, occurrence counts, affected visitors, and stack diagnostics.
* **Analytics Explorer**: Ad-hoc query builder across any analytical dimension with instant CSV export.
* **Multi-Format Export**: Full JSON and CSV export respecting all active filters and date ranges.
* **Strict Project Isolation**: Multi-tenant authorization boundaries guaranteeing zero data leakage between projects.

---

## Monorepo Architecture

```
meow-analytics/
├── apps/
│   ├── api/          # Fastify REST API, ingestion collector, aggregation & analytics routes
│   └── dashboard/    # React 18 + Vite SPA with bespoke design system & charts
├── packages/
│   ├── shared/       # Shared TypeScript schemas, Zod validators, and analytics types
│   ├── config/       # Environment variable validation and defaults
│   ├── database/     # PostgreSQL schema, Drizzle ORM queries, migrations & seeds
│   └── sdk/          # Lightweight (<23KB) browser tracking script (sendBeacon/fetch)
└── tests/            # 29 test suites with 185 unit, integration, and load tests
```

---

## Quickstart

### 1. Prerequisites
* Node.js v20+
* npm v9+
* Docker & Docker Compose (optional for local PostgreSQL)

### 2. Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `.env` contains:
```env
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
DATABASE_URL=postgres://meow:meow_secret@localhost:5432/meow_analytics
MEOW_SECRET=meow_dev_secret_at_least_32_characters_long_for_security_123
ADMIN_SECRET=meow_admin_super_secret_key_12345
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
LOG_LEVEL=info
```

*(Note: For isolated testing without PostgreSQL, `DATABASE_URL=memory://` is natively supported via embedded PGlite).*

### 3. Build & Run Tests

```bash
npm install
npm run build
npm test
```

### 4. Run Migrations & Seed Sample Project

```bash
npm run db:migrate
npm run db:seed
```

### 5. Start Development Servers

```bash
npm run dev
```

* API will run at `http://localhost:3001`
* Dashboard will run at `http://localhost:5173`

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start API and Dashboard dev servers concurrently |
| `npm run build` | Build all packages and applications |
| `npm test` | Run all 29 test suites across the monorepo |
| `npm run typecheck` | Run TypeScript type checks across all workspaces |
| `npm run lint` | Verify monorepo code consistency |
| `npm run db:migrate` | Execute database schema migrations |
| `npm run db:seed` | Seed initial demo project and domain |

---

## Documentation

* [Analytics Semantics & Calculations](file:///mnt/slow/actualprojects/meow-analytics/ANALYTICS_SEMANTICS.md)
* [Data Retention & Cleanup Policy](file:///mnt/slow/actualprojects/meow-analytics/DATA_RETENTION.md)
* [Privacy & IP Minimization Policy](file:///mnt/slow/actualprojects/meow-analytics/PRIVACY.md)
* [Security Model & Threat Defenses](file:///mnt/slow/actualprojects/meow-analytics/SECURITY.md)
* [24/7 VM Production Deployment Guide](file:///mnt/slow/actualprojects/meow-analytics/VM_DEPLOYMENT.md) — Self-hosted 24/7 continuous uptime (No waker required)
* [Production Deployment Blueprint (Render Free)](file:///mnt/slow/actualprojects/meow-analytics/DEPLOYMENT.md)
