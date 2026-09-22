# Security Policy & Hardening — Meow Analytics

This document details the security architecture, threat model, authorization mechanics, defensive headers, rate limiting, and vulnerability guidelines for Meow Analytics.

---

## 1. Authentication & API Key Security

### 1.1 Superadmin Authentication
Administrative operations (project provisioning, global configuration, system cleanup jobs) require the **Admin Secret** (`ADMIN_SECRET`).
- Authentication accepts `Authorization: Bearer <ADMIN_SECRET>` or `x-admin-secret: <ADMIN_SECRET>`.
- Tokens are evaluated using **constant-time comparisons** (`timingSafeEqual`) to prevent side-channel timing attacks.

### 1.2 Project API Keys
Project-specific data access (analytics queries, data exports) can be authenticated using scoped API keys (`mk_live_...`):
- **Cryptographic Generation**: Keys are generated using 24 random bytes (`randomBytes(24)`) with a unique `mk_live_` prefix.
- **Irreversible Hashing**: Raw secret keys are **never stored in the database**. The database stores only the SHA-256 hash (`key_hash`) and a short display prefix (`key_prefix`).
- **Single-Time Reveal**: The plaintext key is returned exactly once upon creation.
- **Revocation**: Revoked keys (`revoked_at IS NOT NULL`) are immediately rejected with `401 Unauthorized`.
- **Project Isolation**: API keys are bound to a specific `project_id`. Requests attempting cross-project access or supplying spoofed project IDs are immediately rejected with `403 Forbidden`.

---

## 2. Rate Limiting & Denial of Service (DoS) Defense

Meow Analytics implements multi-layered sliding-window rate limiting:

1. **Per-IP Rate Limit**: Up to 120 requests per minute per IP address. Exceeding this returns `HTTP 429 Too Many Requests` with a `Retry-After` header.
2. **Burst Protection**: Sliding 1-second burst window limiting clients to 30 requests/sec.
3. **Per-Site Ingestion Limit**: Ingestion on `/api/v1/collect` is capped at 600 requests per minute per `siteId` to prevent spamming single projects.
4. **Payload Size Limits**:
   - HTTP body size is capped at 64 KB at the network layer (`bodyLimit: 65536`).
   - Event batch size is capped at 50 events per request.
   - Event properties JSON is capped at 16 KB.
   - String fields enforce strict maximum lengths (path ≤ 2048, hostname ≤ 253, eventName ≤ 128).

---

## 3. Security Headers & Content Security Policy (CSP)

Meow Analytics applies strict HTTP response headers via Fastify Helmet:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
X-XSS-Protection: 0
```

- **Clickjacking Protection**: `frame-ancestors 'none'` and `X-Frame-Options: DENY` prevent embedding the dashboard in malicious iframes.
- **MIME Sniffing Prevention**: `X-Content-Type-Options: nosniff` forces browsers to honor declared MIME types.
- **Transport Security**: HSTS enforces encrypted HTTPS transport across all subdomains.

---

## 4. Cross-Origin Resource Sharing (CORS)

- **Protected Dashboard & Management Endpoints**:
  Endpoints such as `/api/v1/projects`, `/api/v1/keys`, `/api/v1/analytics`, `/api/v1/export`, and `/api/v1/system` strictly enforce configured origins (`CORS_ORIGINS`). Requests from unauthorized browser origins receive no permissive CORS headers or are rejected.
- **Public Ingestion Endpoints**:
  `/api/v1/collect`, `/api/v1/performance`, and `/meow.js` accept cross-origin requests from tracked websites, with project-level domain validation checking the database for authorized origins.

---

## 5. Input Sanitization & Injection Defenses

Meow Analytics validates and sanitizes all incoming data:

1. **SQL Injection (SQLi)**: All database interactions utilize Drizzle ORM parameterized queries or tagged template literals (`sql\`...\``). User input is never concatenated into raw SQL strings.
2. **Cross-Site Scripting (XSS)**:
   - Dashboard is rendered with React, which automatically escapes output.
   - Event paths, query strings, and custom event names are validated with strict regular expressions and length limits.
3. **Prototype Pollution**:
   - The sanitization engine explicitly drops object keys named `__proto__`, `constructor`, or `prototype`.
4. **CSV Formula Injection**:
   - All exported CSV cells starting with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) are automatically escaped with a leading single quote (`'`).
5. **Path Traversal**:
   - Static asset distribution (`/meow.js`) uses absolute resolved paths with no dynamic filesystem inputs.

---

## 6. Privacy & Logging Audit

Meow Analytics enforces strict structured logging:
- **No Sensitive Data Logged**: Loggers never print authorization headers, admin secrets, API keys, cookies, or raw IP addresses.
- **Sanitized Errors**: The centralized error handler strips database credentials, internal connection URIs, and stack traces before returning responses to clients.

---

## 7. Reporting Security Vulnerabilities

If you discover a security vulnerability in Meow Analytics, please report it privately:
- Email: `security@meowanalytics.dev` (or open a confidential security advisory on GitHub).
- Do not open public GitHub issues for undisclosed security flaws.
