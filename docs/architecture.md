# Meow Analytics — Architecture (Phase 1)

Meow Analytics is a self-hosted, privacy-conscious web analytics platform.
Phase 1 establishes the foundational infrastructure, monorepo, API, database layer, configuration, and project management.

---

## Monorepo Layout

```text
meow-analytics/
├── apps/
│   ├── api/                     # Fastify REST API server
│   └── dashboard/               # React 18 + Vite dashboard
│
├── packages/
│   ├── database/                # Drizzle ORM schemas, migrations, connection pool
│   ├── shared/                  # Common domain types, Zod schemas, ID & key generators
│   └── config/                  # Strict environment configuration with Zod validation
│
├── docs/                        # Architecture and API references
├── scripts/                     # Seed and operational scripts
├── tests/                       # Vitest integration and security suites
│
├── .env.example                 # Template for required environment variables
├── docker-compose.yml           # PostgreSQL 16 container definition for local dev
└── README.md                    # Getting started guide
```

---

## Core Tenets

1. **Security & Privacy First**:
   - API keys are NEVER stored in plaintext. Raw keys are returned exactly once upon creation. Only SHA-256 hashes and display prefixes (`mk_live_...`) are persisted.
   - Admin routes require timing-safe secret authentication.
   - Centralized error handling guarantees stack traces, SQL errors, and environment secrets are never exposed in API replies.

2. **Domain Normalization**:
   - Domains are stripped of protocols (`http://`, `https://`), trailing slashes, paths, and casing before persistence.
   - Only clean, validated hostnames are stored.

3. **Storage Decoupling**:
   - Drizzle ORM provides a typed abstraction over PostgreSQL.
   - Dual-driver support enables containerized PostgreSQL (`pg.Pool`) in production and local dev, with seamless in-memory PGlite support for isolated unit and integration testing.

4. **Honest UX**:
   - In Phase 1, analytics charts are not faked. Instead, informative empty states and copyable setup snippets (`<script defer ...>`) guide users through integration.
