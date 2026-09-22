# Meow Analytics — API Reference (Phase 1)

Base URL: `http://localhost:3001`

All responses follow predictable JSON structures.

---

## Authentication

All `/api/v1/*` endpoints require the admin secret configured via `ADMIN_SECRET`:

```http
Authorization: Bearer <ADMIN_SECRET>
```
or
```http
x-admin-secret: <ADMIN_SECRET>
```

Failure returns HTTP `401`:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing admin credentials"
  }
}
```

---

## Health & Readiness

### `GET /api/health`
Liveness probe.

**Response `200 OK`**:
```json
{
  "status": "ok"
}
```

### `GET /api/ready`
Readiness probe verifying database connectivity and configuration.

**Response `200 OK`**:
```json
{
  "status": "ready",
  "database": "connected",
  "timestamp": "2026-09-22T11:00:00.000Z"
}
```

**Response `503 Service Unavailable`** (when DB down):
```json
{
  "status": "error",
  "database": "disconnected",
  "timestamp": "2026-09-22T11:00:00.000Z"
}
```

---

## Projects API

### `POST /api/v1/projects`
Create a new project. Server generates secure `id` (`prj_...`) and `site_id` (`site_...`).

**Request**:
```json
{
  "name": "Meow Stream",
  "timezone": "Asia/Kolkata"
}
```

**Response `201 Created`**:
```json
{
  "id": "prj_d7281f9a0b12...",
  "name": "Meow Stream",
  "site_id": "site_k82m0a91j3f4",
  "status": "active",
  "timezone": "Asia/Kolkata",
  "created_at": "2026-09-22T11:00:00.000Z",
  "updated_at": "2026-09-22T11:00:00.000Z"
}
```

### `GET /api/v1/projects`
List all active projects.

### `GET /api/v1/projects/:id`
Get a project by ID. Returns `404` if not found or marked deleted.

### `PATCH /api/v1/projects/:id`
Update project properties.

**Request**:
```json
{
  "name": "Meow Stream Production",
  "timezone": "UTC"
}
```

### `DELETE /api/v1/projects/:id`
Delete project. Subsequent access to this project ID will return `404 NOT_FOUND`.

---

## Domains API

### `POST /api/v1/projects/:id/domains`
Add an allowed domain. URLs are normalized automatically.

**Request**:
```json
{
  "domain": "https://STREAM.MEOWANALYTICS.DEV/"
}
```

**Response `201 Created`**:
```json
{
  "id": "dom_7b8192a01c...",
  "project_id": "prj_...",
  "domain": "stream.meowanalytics.dev",
  "verified": false,
  "created_at": "2026-09-22T11:00:00.000Z"
}
```

### `GET /api/v1/projects/:id/domains`
List all domains belonging to project `:id`.

### `DELETE /api/v1/projects/:id/domains/:domainId`
Delete domain from project.

---

## API Keys API

### `POST /api/v1/projects/:id/keys`
Generate an API key. Returns the raw secret **EXACTLY ONCE**.

**Request**:
```json
{
  "name": "Production Collector"
}
```

**Response `201 Created`**:
```json
{
  "id": "key_91f820c7...",
  "project_id": "prj_...",
  "name": "Production Collector",
  "key": "mk_live_8f0a21...",
  "key_prefix": "mk_live_8f0a2134",
  "created_at": "2026-09-22T11:00:00.000Z"
}
```

### `GET /api/v1/projects/:id/keys`
List keys for project `:id`. Returns key prefix, created timestamp, and revocation status. Plaintext key and hash are NEVER returned.

### `DELETE /api/v1/projects/:id/keys/:keyId`
Revoke an API key.
