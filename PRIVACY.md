# Privacy Policy & Data Governance — Meow Analytics

Meow Analytics is an open-source, privacy-first, self-hosted web analytics platform designed to answer:

> *"What is happening on my website?"*

without becoming:

> *"A surveillance system for everyone visiting my website."*

This document provides a comprehensive technical overview of what data is collected, how visitor identity is preserved anonymously, data retention policies, and data subject rights (deletion and export).

---

## 1. Core Privacy Architecture

1. **Zero Raw IP Persistence**: Meow Analytics **never** stores raw IP addresses in any database table, cache, log, or export file. Raw IP addresses are used strictly in-memory during request processing for server-side geolocation (country and coarse region) and immediate HMAC-SHA256 anonymous hashing with a 24-hour rotating salt. The raw IP is discarded immediately after processing.
2. **No Invasive Fingerprinting**: Meow Analytics explicitly rejects:
   - Canvas fingerprinting
   - Audio fingerprinting
   - WebGL fingerprinting
   - Font fingerprinting
   - Battery status fingerprinting
   - Hardware / GPU profiling
   - Covert storage identifiers (supercookies, HSTS flags)
   - Cross-site tracking
3. **First-Party Data Ownership**: All data stays on your infrastructure. No analytics data is ever transmitted to third-party ad networks, data brokers, or external cloud providers.

---

## 2. Privacy Modes

Meow Analytics supports three configurable privacy modes per project:

| Feature | Strict Mode | Balanced Mode (Default) | Detailed Mode |
| :--- | :--- | :--- | :--- |
| **Visitor Identifier** | 24-hour rolling server HMAC hash (no persistent client cookies or localStorage) | Anonymous first-party UUID stored in localStorage or 24h fallback hash | Anonymous first-party UUID stored in localStorage or 24h fallback hash |
| **Geolocation** | Country code and Country name only | Country code and Country name | Country code, Country name, and Region |
| **Device & Browser** | Generalized browser and OS family (e.g. "Chrome on Linux") | Standard parsed browser family, OS family, and device type | Standard parsed browser, OS, and device type |
| **Screen Resolution** | Masked / set to `Unknown` | Screen width & height format (e.g. `1920x1080`) | Screen width & height format |
| **Referrer URLs** | Query parameters and URL fragments stripped | Query parameters stripped; domain and clean path preserved | Full referrer path preserved |
| **UTM Tracking** | Whitelisted UTM tags only (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`) | Whitelisted UTM tags only | Whitelisted UTM tags only |
| **Custom Properties** | Sanitized, sensitive keys dropped, nested depth ≤ 2 | Sanitized, sensitive keys dropped, nested depth ≤ 2 | Sanitized, sensitive keys dropped, nested depth ≤ 2 |
| **Performance Vitals** | Disabled or aggregated | Core Web Vitals (LCP, INP, CLS, FCP, TTFB) | Core Web Vitals + detailed navigation timings |

---

## 3. How Visitor Estimation Works

Meow Analytics calculates **Estimated Unique Visitors** using privacy-preserving techniques:

### Primary Method (Client-side UUID)
In **Balanced** and **Detailed** modes, the lightweight client SDK generates a random UUID v4 stored in `localStorage` under `_meow_vid`. This identifier is strictly scoped to your domain as a first-party cookie/storage value and never shared across different websites.

### Fallback Method (24-Hour Rotating HMAC Hash)
When cookies/localStorage are disabled or when running in **Strict** mode:
```text
Visitor ID = HMAC-SHA256(
  MEOW_SECRET,
  Normalized_IP + User_Agent + 24Hour_Time_Bucket + Site_ID
)
```
- The secret key (`MEOW_SECRET`) is known only to your server.
- The 24-hour time bucket ensures the identifier automatically expires and rotates every 24 hours.
- It is cryptographically impossible to reverse the hash to discover the visitor's IP address.

### Technical Limitations
- **Estimated Browser & Device Identifiers**: Unique visitors measure unique browsers and devices, not physical human beings.
- A user visiting from their laptop in the morning and their smartphone in the evening is counted as two visitors.
- A user switching to Private Browsing mode or clearing site data will receive a new identifier on their next session.

---

## 4. Data Retention & Automatic Purging

Data retention periods are fully configurable per project:

- **Visitor Identity Retention**: Default is **24 hours**. After this period, visitor identity records are deleted, and historical session/event references are anonymized.
- **Raw Event Retention**: Configurable to **7 days**, **30 days**, **90 days** (default), **180 days**, or **365 days**.
- **Scheduled Cleanup Jobs**: Automated cleanup processes run in batches with state checkpoints (`cleanup_checkpoints`), ensuring safe, idempotent, and resumable execution without database lockups.
- **Historical Aggregation**: Before raw events expire, they are summarized into `hourly_aggregates` and `daily_aggregates`, preserving long-term analytical trends without retaining raw individual events.

---

## 5. Data Subject Rights & Data Governance

Meow Analytics provides built-in tools to support GDPR, ePrivacy, and CCPA compliance:

### 1. Data Deletion
- **Delete Project**: Permanently removes the project and cascades deletion across all associated visitors, sessions, events, page views, error events, performance metrics, and API keys.
- **Delete Date Range**: Removes all telemetry within a specified time window (`from` to `to`) without affecting data outside the window.
- **Delete Visitor Data**: Purges visitor identity records on demand or based on retention age.

### 2. Data Export
- Export telemetry as **JSON** or **CSV** directly from the API or dashboard.
- Exports include page views, custom events, sessions, and device metadata.
- **Zero Raw IP Export**: Raw IP addresses are never included in export files.
- CSV cells are automatically sanitized against spreadsheet formula injection (OWASP CSV Injection).

---

## 6. Regulatory Compliance Summary

- **GDPR (EU)**: No personal identifiable information (PII) is permanently stored without consent. First-party analytics with anonymized identifiers and configurable retention comply with GDPR data minimization principles.
- **ePrivacy Directive**: Strict mode operates without persistent cookies or local storage, eliminating the need for invasive cookie consent banners in many jurisdictions.
- **CCPA / CPRA (California)**: Meow Analytics does not sell or share personal data with third parties.
