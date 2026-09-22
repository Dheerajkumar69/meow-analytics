# Meow Analytics — Analytics Semantics & Data Model Specification

This document provides the single authoritative source of truth for metric calculations, definitions, and aggregation semantics in Meow Analytics.

---

## 1. Traffic Metrics

### 1.1 Estimated Unique Visitors
* **Definition**: An estimate of unique visitors accessing the site within a given time range.
* **Privacy-Conscious Visitor Model**: Visitors are identified using a daily rotating SHA-256 hash of `(salt + client_ip + user_agent + project_secret)` or an ephemeral client anonymous ID. Raw IP addresses are **never stored** permanently.
* **Calculation**: `COUNT(DISTINCT visitor_id)` over the filtered window.
* **Caveats**: Changing networks, VPNs, private browsing windows, or daily salt rotation mean this represents an estimated analytical count, not a permanent biometric person identifier.

### 1.2 Sessions
* **Definition**: A continuous period of user activity on the website.
* **Session Timeout**: 30 minutes of inactivity terminates a session. Subsequent events from the same visitor instantiate a new session.
* **Calculation**: `COUNT(*)` from `sessions` table matching project and date criteria.

### 1.3 Page Views
* **Definition**: Non-bot visits to a web page recorded by the tracker.
* **Calculation**: `COUNT(*)` from `page_views` table filtered by `is_bot = false` and active dimension filters.
* **Zero Denominator Rule**: If `sessions = 0`, calculated rates (e.g. bounce rate, pages/session) display `0` or `—` without producing `NaN` or `Infinity`.

### 1.4 Bounce Rate
* **Standard Definition**: Percentage of sessions where the visitor viewed only a single page before terminating their visit.
* **Formula**:
  $$\text{Bounce Rate} = \frac{\text{Single-Page Sessions}}{\text{Total Sessions}} \times 100$$
* **Edge Cases**: Sessions with custom events but only 1 page view are still classified as single-page bounces unless explicitly configured otherwise. If total sessions is zero, bounce rate is reported as `0%`.

### 1.5 Average Session Duration
* **Definition**: Average time in seconds between session start and last observed interaction.
* **Formula**:
  $$\text{Avg Duration} = \frac{\sum \text{duration\_seconds}}{\text{Total Sessions}}$$
* **Single-Page Sessions**: For single-page bounces with no subsequent heartbeats, duration is recorded as `0` seconds.

### 1.6 Pages per Session
* **Formula**:
  $$\text{Pages / Session} = \frac{\text{Total Page Views}}{\text{Total Sessions}}$$

---

## 2. Acquisition & Content Classification

### 2.1 Acquisition Channels
Classified deterministically based on `referrer`, `referrer_source`, and UTM parameters:
1. **Direct**: No referrer or direct navigation.
2. **Organic Search**: Known search engine referrers (e.g. Google, Bing, DuckDuckGo, Yahoo, Ecosia, Baidu).
3. **Social**: Known social networks (e.g. Twitter/X, LinkedIn, Facebook, Instagram, Reddit, Threads, Mastodon).
4. **Email**: Webmail providers or links with `utm_medium` matching `email` or `newsletter`.
5. **Paid**: Referrers or UTM parameters indicating paid campaigns (`utm_medium` in `cpc`, `ppc`, `paid`, `sponsored`).
6. **Referral**: All other external referrer domains.

### 2.2 Content Classifications
* **Top Pages**: Most frequently visited paths sorted by views or visitors.
* **Landing Pages**: The path where a session started (`sessions.landing_page`).
* **Exit Pages**: The last recorded path in a session (`sessions.exit_page`).
* **Hostnames**: Distinct domain names/subdomains serving the page views (`page_views.hostname`).

---

## 3. Real-Time Analytics

* **Definition of "Active"**: Visitors or sessions with recorded activity within the selected sliding window (5, 15, or 30 minutes relative to the server's clock).
* **Pulse Timeline**: Minute-by-minute sparkline of recorded pageviews and events across the last 30 minutes.
* **Truth in Realtime**: Never uses simulated traffic or hardcoded visitor counts. When zero hits occurred, it reports `0 active visitors` honestly.

---

## 4. Conversion Funnels & Cohort Retention

### 4.1 Conversion Funnels
* **Sequential Ordering**: Steps must be completed in order with non-decreasing timestamps for a given visitor.
* **Step Conversion Rate**: Percentage of visitors who completed Step $N$ relative to Step $N-1$:
  $$\text{Conversion Rate}_N = \frac{\text{Visitors}_N}{\text{Visitors}_{N-1}} \times 100$$
* **Drop-off**: $\text{Visitors}_{N-1} - \text{Visitors}_N$.
* **Overall Conversion Rate**: $\frac{\text{Visitors}_{\text{final}}}{\text{Visitors}_1} \times 100$.

### 4.2 Cohort Retention
* **Cohort Assignment**: Visitors are assigned to cohorts based on the date/week/month of their initial session (`visitors.first_seen_at`).
* **Returning Session Activity**: A visitor is considered retained in Period $P$ if they initiated at least one session in that subsequent period window.
* **Heatmap Matrix**: Displays retention percentage relative to cohort size ($P_0 = 100\%$).

---

## 5. Real User Performance & Web Vitals

* **Core Web Vitals Thresholds**:
  - **LCP (Largest Contentful Paint)**: Good $\le 2500\text{ms}$, Needs Improvement $\le 4000\text{ms}$, Poor $> 4000\text{ms}$.
  - **INP (Interaction to Next Paint)**: Good $\le 200\text{ms}$, Needs Improvement $\le 500\text{ms}$, Poor $> 500\text{ms}$.
  - **CLS (Cumulative Layout Shift)**: Good $\le 0.1$, Needs Improvement $\le 0.25$, Poor $> 0.25$.
  - **FCP (First Contentful Paint)**: Good $\le 1800\text{ms}$, Needs Improvement $\le 3000\text{ms}$, Poor $> 3000\text{ms}$.
  - **TTFB (Time to First Byte)**: Good $\le 800\text{ms}$, Needs Improvement $\le 1800\text{ms}$, Poor $> 1800\text{ms}$.
* **Statistical Defensibility**:
  - Percentiles (P50, P75, P90, P95, P99) are computed using continuous percentile interpolation (`PERCENTILE_CONT`) directly over raw measurement samples.
  - Percentiles are never averaged together.
