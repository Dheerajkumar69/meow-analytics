# Meow Analytics

> Self-hosted, lightweight, privacy-conscious web analytics platform.

This repository contains **Phase 1: Foundation, Monorepo, API, Database & Project Management**.

---

## Architecture Overview

Meow Analytics is organized as a modular TypeScript monorepo using npm workspaces:

* **`apps/api`**: Fastify REST API providing project, domain, and API key management, health probes, centralized error handling, and structured logging.
* **`apps/dashboard`**: React 18 + Vite dashboard with a bespoke design system (dark/light mode support), project selector, and setup guidance.
* **`packages/database`**: PostgreSQL schema, Drizzle ORM queries, migration runner, and seeding scripts.
* **`packages/shared`**: Common types, Zod schemas, domain normalization, and cryptographic utilities.
* **`packages/config`**: Strict environment variable validation using Zod.

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

Ensure your `.env` contains:
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

*(Note: For isolated testing or local development without Docker, `DATABASE_URL=memory://` is natively supported via embedded PGlite).*

### 3. Local PostgreSQL (Optional)

Start PostgreSQL via Docker Compose:

```bash
docker compose up -d
```

### 4. Install Dependencies & Build

```bash
npm install
npm run build
```

### 5. Run Migrations & Seed Sample Project

```bash
npm run db:migrate
npm run db:seed
```

### 6. Start Development Servers

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
| `npm run test` | Run Vitest unit, integration, and security test suites |
| `npm run typecheck` | Run TypeScript type checks across all workspaces |
| `npm run lint` | Verify monorepo code consistency |
| `npm run db:migrate` | Execute database schema migrations |
| `npm run db:seed` | Seed initial demo project and domain |

---

## Security Highlights

* **No Plaintext API Keys**: Generated API keys (`mk_live_...`) are returned exactly once to the caller. The database stores only SHA-256 hashes and key prefixes.
* **Timing-Safe Admin Auth**: Header comparisons use constant-time algorithms to prevent timing attacks.
* **Centralized Error Handling**: Stack traces, environment variables, and database credentials are never exposed in production responses.
* **CORS Restricted**: Controlled origin whitelisting via `CORS_ORIGINS`.
