# MEOW ANALYTICS

## Self-Hosted, Vercel-Style Web Analytics + Real Visitor Counting

You are building **Meow Analytics**, a self-hosted first-party web analytics platform inspired by the capabilities and UX of modern deployment-platform analytics dashboards such as Vercel Web Analytics and Speed Insights.

The goal is NOT to copy Vercel's proprietary implementation or branding.

The goal is to build an independent analytics system that gives me a comparable or better understanding of traffic, visitors, pages, referrers, devices, browsers, operating systems, geography, events, sessions, and real-world visitor counts.

The system must be production-minded, privacy-conscious, lightweight, resilient, and extremely easy to integrate into my websites.

---

# 1. CORE OBJECTIVE

Build a system consisting of:

1. **Meow Analytics JavaScript SDK**
2. **Analytics ingestion API**
3. **Analytics database**
4. **Analytics aggregation/query layer**
5. **Meow Analytics dashboard**
6. **Real visitor / unique-person estimation**
7. **Custom event tracking**
8. **Performance tracking**
9. **Traffic/source analysis**
10. **Project/site management**
11. **Privacy controls**
12. **Data retention controls**
13. **API authentication**
14. **Rate limiting and abuse protection**
15. **Export functionality**
16. **Health monitoring**
17. **Self-hosted deployment configuration**

The system should work with:

* React
* Next.js
* Vite
* plain HTML
* JavaScript
* TypeScript
* Vue
* Svelte
* Astro
* static websites
* any website capable of loading a JavaScript file

The first integration should be extremely simple.

Example:

```html
<script
  defer
  src="https://analytics.example.com/meow.js"
  data-site-id="SITE_ID">
</script>
```

For React:

```tsx
import { MeowAnalytics } from "@meow-analytics/react";

<MeowAnalytics siteId="SITE_ID" />
```

Do not make the integration unnecessarily complicated.

---

# 2. IMPORTANT DESIGN PRINCIPLE

Do NOT blindly reproduce Vercel's implementation.

Build an independent analytics architecture.

Vercel's publicly documented analytics capabilities should be treated as the feature baseline, not as implementation instructions.

The dashboard should provide comparable categories of information including:

* page views
* visitors
* unique visitors
* routes
* paths
* hostnames
* countries
* devices
* operating systems
* browsers
* referrers
* event names
* event properties
* time-series traffic
* filtering
* grouping
* custom events
* performance information

Additionally, Meow Analytics should provide functionality that is useful for a personal/self-hosted analytics platform.

---

# 3. ARCHITECTURE

Use a simple architecture.

Recommended:

```text
                    WEBSITE
                       |
                       |
                 meow.js SDK
                       |
                       v
              Analytics Collector
                       |
              -------------------
              |                 |
              v                 v
        Event Validation     Visitor ID
              |                 |
              -----------+-------
                         |
                         v
                    Database
                         |
                         v
                 Query/Aggregation
                         |
                         v
                 Meow Dashboard
```

Recommended deployment:

```text
Frontend Dashboard
        |
        v
Vercel / Cloudflare Pages / static hosting

API
        |
        v
Render Free Web Service

Database
        |
        v
Persistent external database
```

Do NOT rely on Render's local filesystem for analytics storage.

The Render Free service can restart or spin down, and local filesystem data is not persistent.

The database must therefore be external/persistent.

Prefer a free/low-cost PostgreSQL-compatible database.

Make the database layer abstract enough that it can later be switched to:

* PostgreSQL
* Neon
* Supabase
* Turso
* SQLite for local development
* another PostgreSQL-compatible provider

Do not tightly couple the application to one provider.

---

# 4. TECHNOLOGY STACK

Use a practical TypeScript-first stack.

Preferred:

### SDK

TypeScript

Bundled into a very small browser script.

### Backend

Node.js + TypeScript.

Prefer:

* Fastify
* or another lightweight HTTP framework

### Database

PostgreSQL.

Use:

* Drizzle ORM
* or another lightweight typed ORM/query layer

### Dashboard

React + TypeScript.

Use Vite if possible.

### Styling

Use a proper design system.

Do not create a generic AI-generated dashboard.

The UI must feel like a polished developer product.

---

# 5. PROJECT STRUCTURE

Use a monorepo.

Suggested:

```text
meow-analytics/
│
├── apps/
│   ├── dashboard/
│   │   ├── src/
│   │   └── ...
│   │
│   └── api/
│       ├── src/
│       └── ...
│
├── packages/
│   ├── sdk/
│   ├── react/
│   ├── shared/
│   ├── database/
│   └── config/
│
├── docs/
│
├── scripts/
│
├── tests/
│
├── docker/
│
├── .env.example
├── docker-compose.yml
├── package.json
├── README.md
└── ...
```

Keep responsibilities separated.

---

# 6. SITE / PROJECT MODEL

Meow Analytics must support multiple websites.

A user should be able to create:

```text
Project
  |
  ├── Name
  ├── Site ID
  ├── Domain
  ├── Created At
  ├── Status
  └── API credentials
```

Example:

```text
Meow Stream
meow-stream.example.com

Meowify
meowify.example.com

CollabNotes
collabnotes.example.com
```

Each site must have completely isolated analytics.

Never allow one project's analytics to leak into another project.

---

# 7. SITE IDENTIFICATION

Every analytics request must contain a site/project identifier.

Example:

```json
{
  "siteId": "site_abc123"
}
```

Validate this server-side.

Never trust a site ID alone as authorization.

The collector must verify:

* site exists
* site is active
* request origin/domain is allowed when configured
* payload is valid
* request rate is acceptable

---

# 8. PAGE VIEW TRACKING

Automatically track page views.

Every page view should capture, when available:

```text
timestamp
siteId
requestId
sessionId
visitorId
path
route
full URL where appropriate
hostname
referrer
UTM parameters
country
region if available
device
browser
operating system
screen size
viewport
language
timezone
user agent-derived information
connection information when available
```

Do not collect unnecessary information.

Do not collect:

* passwords
* form contents
* authentication tokens
* cookies from other systems
* URL query parameters containing obvious secrets
* arbitrary DOM contents
* keystrokes

---

# 9. SPA ROUTING

This is mandatory.

The SDK must correctly detect navigation in:

* React Router
* Next.js
* Vue Router
* SvelteKit
* normal browser navigation

Support:

```text
pushState
replaceState
popstate
hashchange
```

Avoid double-counting page views.

For SPAs:

```text
/home
/about
/dashboard
/settings
```

each route transition should produce the correct page-view event.

---

# 10. PAGE VIEW EVENT FORMAT

Internally normalize every page view into a common event.

Example:

```json
{
  "type": "pageview",
  "siteId": "site_x",
  "timestamp": 1770000000000,
  "path": "/movies",
  "hostname": "meowstream.example",
  "referrer": "https://google.com/",
  "sessionId": "...",
  "visitorId": "...",
  "device": "desktop",
  "browser": "Chrome",
  "os": "Linux",
  "screenWidth": 1920,
  "screenHeight": 1080,
  "language": "en-US"
}
```

The server should enrich this with server-side information.

---

# 11. UNIQUE VISITOR SYSTEM

This is one of the most important parts.

I want Meow Analytics to answer:

> "How many actual people are coming to my website?"

However, understand that analytics cannot perfectly determine physical human beings.

Two people can share an IP.

One person can use multiple IPs.

VPNs can change IPs.

Mobile networks can change IPs.

Multiple devices can belong to one person.

Therefore the dashboard must call this:

**Estimated Unique Visitors**

rather than claiming it is literally the number of human beings.

---

# 12. VISITOR IDENTIFICATION

Use multiple signals.

Primary approach:

```text
server-observed IP
+
user agent/device characteristics
+
first-party anonymous visitor identifier
+
session information
```

Do NOT permanently store raw IP addresses unless explicitly enabled by the administrator.

Instead:

```text
visitorHash =
HMAC_SHA256(
    serverSecret,
    normalizedIP + userAgent + timeBucket
)
```

Use a rotating time bucket.

For example:

```text
daily
```

or configurable:

```text
24 hours
7 days
30 days
```

Default:

```text
24 hours
```

This prevents Meow Analytics from becoming a permanent IP-tracking database.

---

# 13. FIRST-PARTY VISITOR ID

Generate an anonymous random identifier.

Example:

```text
mv_7e9f...
```

Store it in a first-party cookie or another privacy-conscious browser storage mechanism where appropriate.

The identifier must:

* be random
* not contain the IP
* not contain personal information
* not be derived directly from email
* not be reversible

Example:

```text
meow_visitor_id=mv_01J...
```

---

# 14. RETURNING VISITOR DETECTION

The system should distinguish:

```text
New Visitor
Returning Visitor
Active Visitor
Unique Visitor
Session
Page View
```

Example:

User A:

```text
Day 1:
visitor_id = X

Day 2:
visitor_id = X

=> returning visitor
```

User B:

```text
visitor_id = Y

=> different visitor
```

If cookies are unavailable, fall back to a privacy-preserving server-derived visitor signal.

Do not pretend fallback identification is perfectly accurate.

---

# 15. "ACTUAL PEOPLE" DASHBOARD

Create a prominent dashboard card:

```text
Estimated Unique Visitors
```

Example:

```text
1,284
+12.4%
vs previous period
```

Also display:

```text
New Visitors
Returning Visitors
Returning Visitor Rate
Unique Sessions
Page Views
Pages / Visitor
```

Example:

```text
Visitors

1,284 unique visitors

New
1,012

Returning
272

Returning rate
21.2%
```

Allow the user to choose:

```text
Today
Yesterday
7 days
14 days
30 days
90 days
Custom
```

---

# 16. SESSION TRACKING

Implement sessions.

A session should expire after configurable inactivity.

Default:

```text
30 minutes
```

Track:

```text
sessionId
visitorId
startedAt
lastSeenAt
landingPage
exitPage
pageViews
events
duration
referrer
device
country
```

Dashboard:

```text
Sessions
Average Session Duration
Pages / Session
Bounce Rate
```

---

# 17. BOUNCE RATE

Calculate bounce rate carefully.

Default definition:

```text
sessions with one qualifying pageview / total sessions
```

Document the definition.

Do not silently change the calculation.

Allow future support for configurable bounce definitions.

---

# 18. TRAFFIC OVER TIME

Main dashboard graph.

Support:

```text
Page Views
Visitors
Sessions
Events
```

Time resolutions:

```text
hour
day
week
month
```

Automatically choose an appropriate resolution.

Example:

Today:

```text
hourly
```

Last 30 days:

```text
daily
```

Last year:

```text
monthly
```

---

# 19. LIVE VISITORS

Add:

```text
Live Visitors
```

A visitor is considered live if they have generated activity within the last configurable period.

Default:

```text
5 minutes
```

Display:

```text
● 17 visitors online
```

Do not use WebSockets unless necessary.

Heartbeat requests can be lightweight.

Avoid excessive traffic.

---

# 20. TOP PAGES

Dashboard:

```text
Top Pages

/                       12,431
/movies                  8,921
/search                  5,322
/watch                    4,121
/about                    931
```

Metrics:

```text
Views
Unique Visitors
Average Time
Entry Rate
Exit Rate
```

Allow sorting.

---

# 21. ROUTES

Distinguish between:

```text
raw path
normalized route
```

For example:

```text
/watch/123
/watch/456
/watch/789
```

can optionally be normalized to:

```text
/watch/:id
```

Do not destroy the raw path.

Store both when possible.

---

# 22. HOSTNAMES

Support multiple hostnames.

Example:

```text
www.example.com
app.example.com
api.example.com
```

Dashboard:

```text
Hostname
Visitors
Views
Sessions
```

---

# 23. REFERRERS

Track:

```text
Direct
Google
Bing
YouTube
Reddit
Facebook
Instagram
Twitter/X
Other
```

Do not hardcode only these.

Build a referrer parser.

Store:

```text
referrer URL
referrer hostname
referrer source
```

Normalize sources.

Example:

```text
https://www.google.com/search?q=x
```

becomes:

```text
Google
```

---

# 24. UTM TRACKING

Support:

```text
utm_source
utm_medium
utm_campaign
utm_term
utm_content
```

Dashboard:

```text
Campaign
Visitors
Sessions
Views
Conversions
```

UTM parameters must never accidentally expose sensitive query parameters.

Only explicitly recognized UTM parameters should be stored.

---

# 25. DEVICE ANALYTICS

Detect:

```text
Desktop
Mobile
Tablet
Bot
Unknown
```

Dashboard:

```text
Desktop 61%
Mobile 34%
Tablet 5%
```

---

# 26. OPERATING SYSTEM

Detect common operating systems:

```text
Windows
macOS
Linux
Android
iOS
ChromeOS
Other
Unknown
```

Do not attempt invasive fingerprinting.

Use user-agent/device hints.

---

# 27. BROWSER

Detect:

```text
Chrome
Firefox
Safari
Edge
Opera
Samsung Internet
Brave
Other
Unknown
```

Include versions only where useful.

Avoid storing unnecessary high-cardinality data.

---

# 28. COUNTRY / GEOLOCATION

Derive approximate geography from the request IP using a suitable IP-to-location database/service.

At minimum:

```text
Country
Country Code
```

Optionally:

```text
Region
City
```

Do NOT attempt precise physical location.

Do not request browser GPS.

Do not use:

```text
navigator.geolocation
```

for analytics.

Dashboard:

```text
India       43%
USA         21%
UK           7%
Germany      5%
...
```

---

# 29. MAP VIEW

If feasible, create a world/country visualization.

Do not use exact user coordinates.

Only show approximate country/region aggregation.

Example:

```text
India
1,821 visitors

United States
934 visitors
```

---

# 30. CUSTOM EVENTS

Provide an extremely simple API.

Example:

```javascript
meowAnalytics.track("Signup");
```

or:

```javascript
meowAnalytics.track("Play Movie", {
    movieId: "123",
    category: "action"
});
```

Events must support:

```text
eventName
timestamp
visitorId
sessionId
path
properties
```

---

# 31. EVENT PROPERTY LIMITS

Prevent abuse.

Limit:

```text
event name length
property key length
property value length
number of properties
payload size
nested object depth
```

Reject:

```text
passwords
tokens
authorization headers
obvious secrets
massive payloads
```

Do not silently accept 5 MB event payloads.

---

# 32. AUTOMATIC EVENTS

Provide optional automatic events:

```text
page_view
session_start
session_end
outbound_click
download
404
search
error
```

Make automatic event tracking configurable.

---

# 33. OUTBOUND LINK TRACKING

Optional:

```text
user clicked external link
```

Capture:

```text
destination hostname
current path
timestamp
```

Do not capture arbitrary DOM contents.

---

# 34. DOWNLOAD TRACKING

Allow:

```javascript
meowAnalytics.trackDownload(...)
```

Track:

```text
filename
extension
path
```

Do not capture private document contents.

---

# 35. SEARCH TRACKING

Support:

```javascript
meowAnalytics.trackSearch("spiderman");
```

However:

DO NOT automatically collect arbitrary search terms from websites unless explicitly configured.

Search queries can contain personal or sensitive information.

Provide an explicit opt-in.

---

# 36. ERROR TRACKING

Track anonymous frontend errors.

Example:

```text
TypeError
ReferenceError
Unhandled Promise Rejection
```

Store:

```text
error type
message
path
browser
OS
timestamp
```

Do not store:

* tokens
* cookies
* form data
* localStorage contents
* full request headers

Sanitize error messages where necessary.

---

# 37. PERFORMANCE ANALYTICS

Build a lightweight equivalent of Speed Insights.

Track:

```text
TTFB
FCP
LCP
CLS
INP
```

Where supported by the browser APIs.

Also track:

```text
navigation duration
DNS duration
connection duration
request duration
DOM loading
page load
```

Dashboard:

```text
Performance

LCP       1.8s
INP       120ms
CLS       0.03
FCP       1.2s
TTFB      280ms
```

Use percentile calculations.

At minimum:

```text
p50
p75
p90
p95
```

The primary displayed value can be p75.

---

# 38. PERFORMANCE BY PAGE

Allow:

```text
Performance
   |
   ├── All Pages
   ├── /home
   ├── /movies
   ├── /watch
   └── /search
```

Show:

```text
LCP
INP
CLS
FCP
TTFB
```

per route.

---

# 39. PERFORMANCE BY DEVICE

Allow comparison:

```text
Desktop
Mobile
Tablet
```

---

# 40. PERFORMANCE BY COUNTRY

Allow:

```text
India
USA
Germany
UK
...
```

Show performance metrics by country.

---

# 41. FILTER SYSTEM

Build a powerful filter system.

Filters should include:

```text
Path
Route
Hostname
Country
Device
OS
Browser
Referrer
Event
Event property
UTM source
UTM medium
UTM campaign
```

Support:

```text
equals
not equals
contains
starts with
ends with
```

Multiple filters:

```text
Country = India
AND
Device = Mobile
AND
Path contains /watch
```

---

# 42. GROUP-BY SYSTEM

Allow grouping by:

```text
Path
Route
Hostname
Country
Device
OS
Browser
Referrer
Event
Event property
UTM parameters
```

The backend must perform aggregation rather than sending massive raw datasets to the browser.

---

# 43. DATE RANGE

Support:

```text
Today
Yesterday
7D
14D
30D
90D
6M
12M
Custom
```

Compare:

```text
Previous period
Previous year
```

Example:

```text
Visitors
12,421

+14.2%
vs previous period
```

Do not fabricate percentages when there is insufficient data.

---

# 44. DASHBOARD LAYOUT

Create a polished developer-oriented analytics dashboard.

Navigation:

```text
Meow Analytics

Overview
Traffic
Pages
Visitors
Sources
Geography
Devices
Events
Performance
Errors
Projects
Settings
```

Top bar:

```text
Project selector
Date selector
Filters
Refresh
```

Overview:

```text
--------------------------------------------------
Visitors       Sessions       Page Views    Events
12,421         15,293         48,291        9,431
--------------------------------------------------

Traffic graph

--------------------------------------------------

Top Pages              Traffic Sources
/pages                 Google
/watch                  Direct
/search                 Reddit
--------------------------------------------------

Countries               Devices
India                   Desktop
USA                     Mobile
Germany                 Tablet
--------------------------------------------------

Performance             Live
LCP                     ● 18
INP
CLS
--------------------------------------------------
```

---

# 45. LIVE DASHBOARD

Add a live view.

Show:

```text
Current visitors
Current sessions
Recent page views
Recent events
Top live pages
Top live countries
```

Example:

```text
LIVE

23 visitors

/home       8
/watch      7
/search     4
/movies     4
```

Refresh automatically.

Use efficient polling or SSE/WebSocket only where justified.

---

# 46. VISITOR EXPLORER

Create a visitor explorer without exposing unnecessary personal information.

Example:

```text
Visitor #A7F2

First seen:
Today 09:21

Last seen:
Today 10:42

Sessions:
4

Page views:
17

Country:
India

Device:
Desktop

Browser:
Chrome

First page:
/home

Recent pages:
/movies
/watch
/search
```

Do NOT show raw IP by default.

Instead:

```text
Network identifier:
Anonymous
```

Optionally show a short non-reversible hash if needed for debugging.

---

# 47. IP HANDLING

This is extremely important.

The server can inspect the incoming IP for:

* approximate geo lookup
* rate limiting
* anonymous visitor estimation

But raw IP addresses should NOT become a permanent analytics identifier by default.

Preferred:

```text
raw IP
   |
   v
HMAC with secret + rotation period
   |
   v
anonymous identifier
   |
   v
discard raw IP
```

Never expose the raw IP in the dashboard by default.

Never expose raw IP through the public analytics API.

---

# 48. DATA RETENTION

Implement configurable retention.

Example:

```text
7 days
30 days
90 days
180 days
365 days
Forever
```

Default:

```text
90 days
```

For privacy-sensitive visitor identification:

```text
visitor identity data:
24 hours
```

or another short configurable period.

Aggregated statistics can survive longer.

Run scheduled cleanup jobs.

The cleanup must be resumable and safe to run repeatedly.

---

# 49. PRIVACY MODE

Create settings:

```text
Privacy Mode

Strict
Balanced
Detailed
```

Strict:

```text
No persistent visitor cookies
Short visitor retention
No city-level geo
No detailed user-agent data
```

Balanced:

```text
Anonymous visitor ID
Country
Device
Browser
OS
```

Detailed:

```text
More analytics metadata
```

The system must clearly explain what each mode collects.

---

# 50. DO NOT IMPLEMENT INVASIVE FINGERPRINTING

Do NOT implement:

```text
canvas fingerprinting
audio fingerprinting
WebGL fingerprinting
font fingerprinting
battery fingerprinting
hardware fingerprinting
covert storage identifiers
cross-site tracking
```

Do not attempt to circumvent browser privacy protections.

The objective is analytics, not surveillance.

---

# 51. CONSENT SUPPORT

Provide configuration for jurisdictions where consent may be required.

Support:

```text
analytics enabled
analytics disabled
consent required
consent granted
consent denied
```

The SDK should support:

```javascript
meowAnalytics.enable()
meowAnalytics.disable()
```

Do not bypass a site's consent mechanism.

---

# 52. BOT DETECTION

Detect obvious bots.

Identify:

```text
Googlebot
Bingbot
crawler
spider
bot
headless browser signals
```

Provide:

```text
Include bots
Exclude bots
```

Default:

```text
Exclude obvious bots
```

Do not claim bot detection is perfect.

---

# 53. RATE LIMITING

The collector is a public endpoint.

Protect it.

Implement:

```text
per-IP rate limiting
per-site rate limiting
payload-size limits
event limits
burst protection
```

Example:

```text
100 requests/minute/IP
```

Make limits configurable.

Do not allow one malicious website to consume all database resources.

---

# 54. INGESTION ENDPOINTS

Example:

```text
POST /api/v1/collect
POST /api/v1/event
POST /api/v1/performance
POST /api/v1/batch
```

Prefer a batch endpoint.

Example:

```json
{
  "siteId": "site_123",
  "events": [
    {},
    {},
    {}
  ]
}
```

The SDK should batch events where possible.

---

# 55. BATCHING

Do not make one network request for every tiny event.

Use:

```text
queue
batch
flush
retry
```

Example:

```text
flush every 5 seconds
OR
when queue reaches 10 events
OR
when page becomes hidden
```

Use:

```text
navigator.sendBeacon
```

when appropriate.

Fallback to:

```text
fetch(..., { keepalive: true })
```

---

# 56. OFFLINE SUPPORT

If the user temporarily loses connectivity:

```text
event
 |
 v
local queue
 |
 v
network returns
 |
 v
send
```

Limit offline queue size.

Never allow unlimited local storage.

---

# 57. RETRY SYSTEM

Implement:

```text
exponential backoff
jitter
maximum retry count
dead-letter behavior
```

Example:

```text
1s
2s
4s
8s
16s
```

with jitter.

Do not retry permanent 4xx errors indefinitely.

---

# 58. DATABASE SCHEMA

Create normalized tables for:

```text
projects
api_keys
events
page_views
sessions
visitors
performance_metrics
errors
daily_aggregates
hourly_aggregates
countries
referrers
cleanup_jobs
```

Use indexes carefully.

Important indexes:

```text
site_id
timestamp
site_id + timestamp
site_id + path
site_id + visitor_id
site_id + session_id
site_id + event_name
```

Do not create unnecessary indexes on high-cardinality fields.

---

# 59. RAW VS AGGREGATED DATA

Do not depend forever on raw events.

Implement aggregation.

For example:

```text
raw events
     |
     v
hourly aggregation
     |
     v
daily aggregation
```

Dashboard queries should primarily use aggregates for historical periods.

This keeps the system cheap and fast.

---

# 60. DATA ACCURACY

Never fabricate analytics.

If the system doesn't have enough data:

```text
Not enough data
```

If a metric is estimated:

```text
Estimated
```

If a metric is sampled:

```text
Sampled
```

If a metric is unavailable:

```text
Unavailable
```

Never display fake zeroes when data is missing.

---

# 61. TIME ZONES

Store timestamps in UTC.

Dashboard converts them to:

```text
user-selected timezone
```

Default dashboard timezone:

```text
browser timezone
```

Allow explicit project timezone.

Handle DST correctly.

---

# 62. DATA DEDUPLICATION

Events can be retried.

Therefore support:

```text
eventId
```

Every client event should have a unique ID.

The server should safely deduplicate repeated submissions.

Example:

```text
eventId = UUID
```

Database constraint:

```text
unique(site_id, event_id)
```

---

# 63. API SECURITY

Dashboard API requires authentication.

Use:

```text
session authentication
```

or secure token-based authentication.

Analytics ingestion keys must be separate from dashboard admin credentials.

Never ship an admin secret in the browser.

Public collector key:

```text
safe to expose
```

Admin API key:

```text
NEVER expose client-side
```

---

# 64. API

Provide endpoints:

```text
GET /api/v1/projects
POST /api/v1/projects

GET /api/v1/analytics/overview
GET /api/v1/analytics/timeseries
GET /api/v1/analytics/pages
GET /api/v1/analytics/visitors
GET /api/v1/analytics/sources
GET /api/v1/analytics/countries
GET /api/v1/analytics/devices
GET /api/v1/analytics/events
GET /api/v1/analytics/performance
GET /api/v1/analytics/errors

GET /api/v1/realtime
```

Every endpoint must enforce project authorization.

---

# 65. EXPORT

Allow:

```text
CSV
JSON
```

Exports should support:

```text
date range
filters
project
metric
grouping
```

Never export raw IP addresses by default.

---

# 66. DASHBOARD SEARCH

Add search for:

```text
pages
events
routes
referrers
countries
```

Do not load millions of rows into the browser.

Use server-side search.

---

# 67. EMPTY STATES

Every dashboard page needs a useful empty state.

Example:

```text
No traffic yet.

Install Meow Analytics on your website to start receiving traffic data.

[Installation Guide]
```

Do not show blank charts.

---

# 68. ERROR STATES

If API is down:

```text
Analytics temporarily unavailable.
Retry
```

Do not crash the entire dashboard.

If one widget fails:

```text
That metric couldn't be loaded.
Retry
```

Other widgets should continue working.

---

# 69. RENDER FREE DEPLOYMENT

The backend must be deployable to Render Free.

Create:

```text
render.yaml
```

or equivalent deployment configuration.

Use environment variables:

```text
DATABASE_URL
MEOW_SECRET
ADMIN_SECRET
GEOIP_DATABASE
CORS_ORIGINS
NODE_ENV
```

Never hardcode secrets.

Remember:

Render Free services can spin down after inactivity.

The application must tolerate cold starts.

Do not assume in-memory state survives restarts.

---

# 70. DATABASE REQUIREMENT

Do NOT use:

```text
./data/database.sqlite
```

as the production database on Render Free.

Render's local filesystem is not persistent.

Use an external database.

Local SQLite may be used for:

```text
development
tests
local demo
```

but production must use persistent external storage.

---

# 71. COLD START HANDLING

The SDK must tolerate the analytics API being temporarily unavailable.

Analytics must NEVER block the user's website.

Critical rule:

```text
If Meow Analytics is down,
the user's website must continue working normally.
```

The analytics script must fail silently.

Never:

```text
throw fatal exception
```

Never block rendering.

Use:

```html
defer
```

and asynchronous requests.

---

# 72. SDK PERFORMANCE

The analytics SDK itself must be tiny.

Target:

```text
< 10 KB compressed
```

if reasonably achievable.

Do not ship the dashboard code inside the SDK.

Do not load huge dependencies.

Avoid:

```text
React
chart libraries
database libraries
```

inside the browser SDK.

---

# 73. SDK FAILURE ISOLATION

This is mandatory.

If:

```text
analytics.meow.com
```

is down:

```text
example.com
```

must still load.

If analytics API takes 10 seconds:

the website must NOT wait 10 seconds.

Set aggressive client-side timeouts.

---

# 74. CORS

Collector endpoint must support configured domains.

Example:

```text
https://meowstream.com
https://www.meowstream.com
```

Allow wildcard only if explicitly enabled.

Never default to:

```text
Access-Control-Allow-Origin: *
```

for authenticated dashboard APIs.

---

# 75. DOMAIN VERIFICATION

Allow project owners to configure allowed domains.

Example:

```text
Project:
Meow Stream

Allowed:
meowstream.com
www.meowstream.com
```

Warn if events come from unexpected domains.

Optionally reject them.

---

# 76. DASHBOARD DESIGN

The UI must be:

* clean
* dense but readable
* developer-focused
* fast
* responsive
* dark/light mode
* keyboard accessible

Avoid generic:

```text
purple AI dashboard
```

Do not make every card rounded excessively.

Do not fill the dashboard with pointless gradients.

Use visual hierarchy.

Charts must be useful, not decorative.

---

# 77. MAIN OVERVIEW

The overview should answer:

```text
How many people came?

How much traffic did I get?

Where did they come from?

What did they view?

What devices did they use?

Where are they located?

Are they returning?

Is the site performing well?
```

The first screen should make those answers immediately visible.

---

# 78. METRIC DEFINITIONS

Every important metric should have an info tooltip.

Example:

```text
Unique Visitors

Estimated number of distinct anonymous visitors during
the selected time period. Identification can be affected
by shared devices, multiple devices, VPNs, privacy settings,
and changing network addresses.
```

Do this for:

```text
Visitors
Sessions
Bounce Rate
LCP
INP
CLS
FCP
TTFB
```

---

# 79. DATA FRESHNESS

Display:

```text
Updated 12 seconds ago
```

or:

```text
Live
```

if genuinely live.

Never display "Live" if the data is actually cached for 30 minutes.

---

# 80. CACHE STRATEGY

Use caching for expensive analytics queries.

Example:

```text
today:
short cache

historical:
longer cache
```

Invalidate/cache-bust after ingestion when necessary.

Do not make the dashboard query raw events on every refresh.

---

# 81. QUERY PERFORMANCE

Analytics queries must remain fast as data grows.

Avoid:

```sql
SELECT * FROM events
```

for dashboard requests.

Use:

```sql
COUNT
COUNT DISTINCT
GROUP BY
time buckets
pre-aggregated tables
```

with appropriate indexes.

---

# 82. DATABASE FAILURE

If database temporarily fails:

* ingestion should retry where safe
* API should return proper errors
* dashboard should display an understandable error
* no data corruption
* no duplicate events after retry

---

# 83. BACKPRESSURE

If traffic spikes:

```text
SDK
 ↓
collector
 ↓
queue
 ↓
database
```

Do not allow uncontrolled memory growth.

Set maximum queue size.

If overloaded:

```text
return 202
```

or safely reject low-priority events.

Never crash.

---

# 84. ADMIN SETTINGS

Create settings for:

```text
Project name
Domains
Timezone
Retention
Privacy mode
Bot filtering
Visitor identification
Performance tracking
Automatic events
Allowed origins
API keys
```

---

# 85. API KEY MANAGEMENT

Support:

```text
Create key
Revoke key
Rotate key
Last used
Created date
```

Never display a secret after creation.

Store hashes where appropriate.

---

# 86. PROJECT INSTALLATION PAGE

Each project gets:

```text
Install Meow Analytics
```

Provide:

### HTML

```html
<script
  defer
  src="https://analytics.example.com/meow.js"
  data-site-id="YOUR_SITE_ID">
</script>
```

### React

```tsx
<MeowAnalytics siteId="YOUR_SITE_ID" />
```

### Next.js

Provide the appropriate integration.

### Manual

```javascript
MeowAnalytics.init({
    siteId: "..."
});
```

Also show verification status:

```text
Waiting for traffic...

Last event:
2 seconds ago
```

---

# 87. AUTOMATIC INSTALLATION TEST

Provide:

```text
Verify Installation
```

The dashboard sends a test request or checks incoming traffic.

Show:

```text
✓ SDK detected
✓ Project ID valid
✓ Events arriving
✓ Domain verified
✓ Database connected
```

---

# 88. OBSERVABILITY

Meow Analytics itself needs monitoring.

Create:

```text
/api/health
/api/ready
```

Health:

```json
{
  "status": "ok"
}
```

Readiness verifies:

```text
database
configuration
critical dependencies
```

Do not expose secrets.

---

# 89. INTERNAL LOGGING

Backend logs must include:

```text
request ID
endpoint
status
duration
site ID
error category
```

Do not log:

```text
raw visitor IP
cookies
authorization tokens
event payloads containing user content
```

unless explicitly required for controlled debugging.

---

# 90. SECURITY HEADERS

Implement appropriate:

```text
CSP
HSTS
X-Content-Type-Options
Referrer-Policy
Frame restrictions
```

Dashboard should have stricter policies than the collector.

---

# 91. INPUT VALIDATION

Validate every API input.

Use a schema validator such as:

```text
Zod
```

Reject malformed:

```text
siteId
eventName
properties
timestamps
paths
URLs
```

---

# 92. TIMESTAMP VALIDATION

Do not blindly trust client timestamps.

Protect against:

```text
future timestamps
ancient timestamps
invalid timestamps
```

Use server receive time as a reliable fallback.

---

# 93. CLOCK SKEW

If client time differs greatly from server time:

```text
prefer server timestamp
```

or normalize within a safe range.

---

# 94. PATH NORMALIZATION

Prevent analytics poisoning.

Normalize:

```text
trailing slash
URL encoding
invalid characters
extremely long paths
```

Limit maximum path length.

---

# 95. QUERY PARAMETER PRIVACY

Never automatically store arbitrary query parameters.

For:

```text
/search?q=hello
```

store:

```text
/search
```

unless explicit search tracking is enabled.

Never store parameters likely to contain:

```text
token
password
auth
session
key
secret
code
```

---

# 96. EVENT PROPERTY PRIVACY

Support a denylist:

```text
password
token
secret
authorization
cookie
email
phone
address
```

Do not automatically collect these fields.

Provide configurable property filtering.

---

# 97. DATA DELETION

Admin must be able to delete:

```text
entire project
date range
specific visitor identity records
events
```

Deletion must actually delete data.

Do not merely hide it from the UI.

---

# 98. DATA EXPORT + DELETE

Privacy controls should support:

```text
Export project data
Delete project data
Delete visitor data
```

with confirmation.

Dangerous actions require explicit confirmation.

---

# 99. GDPR/PRIVACY-MINDED DESIGN

Do not claim that Meow Analytics is automatically GDPR compliant.

Instead:

Build privacy controls that help an operator configure the system appropriately.

Document:

```text
What is collected
Why it is collected
How long it is retained
How visitor identification works
How to disable tracking
How to delete data
```

---

# 100. TESTING

This project must have serious tests.

At minimum:

### Unit tests

Test:

```text
visitor hashing
session generation
session expiration
IP normalization
event validation
path normalization
referrer parsing
device detection
browser detection
OS detection
bot detection
UTM parsing
aggregation
percentages
date ranges
timezone conversion
deduplication
retention
```

### Integration tests

Test:

```text
SDK → API
API → database
dashboard → API
```

### End-to-end

Test:

```text
new visitor
returning visitor
new session
returning session
page navigation
custom event
performance event
offline queue
retry
duplicate event
invalid event
database failure
API failure
```

---

# 101. SDK TESTS

Test:

```text
script loads
script fails safely
SPA navigation works
page views aren't duplicated
events are queued
events batch correctly
sendBeacon works
fetch fallback works
offline queue works
retry works
```

---

# 102. FAILURE TEST

Intentionally shut down the analytics server.

Then visit the tracked website.

Expected:

```text
website works normally
console isn't flooded
page doesn't freeze
analytics failure doesn't affect application
```

This test is mandatory.

---

# 103. LOAD TEST

Create a load-testing script.

Simulate:

```text
100 visitors
1,000 visitors
10,000 events
```

Measure:

```text
requests/sec
database writes/sec
average latency
p95 latency
error rate
memory
CPU
```

---

# 104. DATABASE GROWTH TEST

Generate millions of fake events.

Then test:

```text
30-day dashboard
90-day dashboard
365-day dashboard
```

The dashboard should remain responsive.

If performance becomes poor:

implement aggregation/partitioning/index improvements.

Do not simply increase server resources.

---

# 105. DATA CORRECTNESS TEST

Generate known data:

```text
10 visitors
30 sessions
100 pageviews
25 events
```

Verify dashboard exactly reports:

```text
10 visitors
30 sessions
100 pageviews
25 events
```

Then test:

```text
duplicates
retries
multiple devices
returning visitors
shared IP
```

---

# 106. SECURITY TESTING

Test:

```text
SQL injection
XSS
CSRF
CORS bypass
invalid API keys
site ID enumeration
rate-limit bypass
oversized payload
malformed JSON
prototype pollution
path traversal
```

Do not assume the framework protects everything automatically.

---

# 107. PRIVACY TESTING

Verify:

```text
raw IP isn't persisted unnecessarily
raw IP isn't returned by dashboard API
visitor IDs aren't predictable
visitor IDs aren't derived directly from IP
sensitive URL parameters aren't stored
event payload limits work
deletion really deletes data
retention cleanup works
```

---

# 108. DOCUMENTATION

Create:

```text
README.md
ARCHITECTURE.md
SECURITY.md
PRIVACY.md
DEPLOYMENT.md
SDK.md
API.md
DATABASE.md
TROUBLESHOOTING.md
```

Documentation must contain actual instructions.

Never write:

```text
TODO: document this
```

for required functionality.

---

# 109. LOCAL DEVELOPMENT

One command should start everything.

Example:

```bash
npm install
npm run dev
```

Prefer:

```text
dashboard
API
database
```

to start together.

Provide:

```text
docker-compose.yml
```

for local PostgreSQL if useful.

---

# 110. ENVIRONMENT VARIABLES

Provide:

```env
DATABASE_URL=
MEOW_SECRET=
ADMIN_SECRET=
COOKIE_SECRET=
GEOIP_DATABASE=
CORS_ORIGINS=
NODE_ENV=development
```

Create:

```text
.env.example
```

Never commit real secrets.

---

# 111. DATABASE MIGRATIONS

Use proper migrations.

Commands:

```bash
npm run db:migrate
npm run db:generate
npm run db:seed
```

Do not modify production schema manually.

---

# 112. DEMO DATA

Provide an optional seed script.

Example:

```bash
npm run seed
```

This generates realistic demo analytics.

Clearly label demo data.

Never mix demo data with production data accidentally.

---

# 113. ANALYTICS API QUERY EXAMPLE

The backend should support requests conceptually similar to:

```text
GET /analytics/timeseries
    ?project=...
    &from=...
    &to=...
    &metric=visitors
    &groupBy=day
```

and:

```text
GET /analytics/pages
    ?from=...
    &to=...
    &groupBy=path
```

Return predictable JSON.

---

# 114. RESPONSE FORMAT

Use a consistent format.

Example:

```json
{
  "data": [],
  "meta": {
    "from": "...",
    "to": "...",
    "timezone": "Asia/Kolkata",
    "generatedAt": "...",
    "estimated": false
  }
}
```

Errors:

```json
{
  "error": {
    "code": "INVALID_DATE_RANGE",
    "message": "..."
  }
}
```

Never leak stack traces in production.

---

# 115. DASHBOARD CHARTS

Charts must support:

```text
hover
tooltip
date comparison
zoom where useful
empty state
loading state
error state
responsive sizing
```

Do not render thousands of individual points unnecessarily.

Aggregate appropriately.

---

# 116. ACCESSIBILITY

Dashboard must support:

```text
keyboard navigation
screen readers
visible focus states
proper labels
sufficient contrast
reduced motion
```

Do not rely exclusively on color.

---

# 117. RESPONSIVE DESIGN

Support:

```text
desktop
laptop
tablet
mobile
```

On mobile:

```text
sidebar → drawer
tables → scrollable/stacked
charts → responsive
```

---

# 118. DARK MODE

Support:

```text
Light
Dark
System
```

Charts must remain readable in both modes.

---

# 119. PERFORMANCE

The dashboard itself should be fast.

Use:

```text
lazy loading
code splitting
query caching
virtualized tables
server-side aggregation
```

Do not ship the entire application on first load.

---

# 120. NO UNNECESSARY DEPENDENCIES

Before installing a dependency ask:

```text
Can this be implemented simply with the platform?
```

Do not install enormous packages for tiny functionality.

---

# 121. NO FAKE FEATURES

This is critical.

Never create UI for functionality that doesn't actually work.

If a feature isn't implemented:

```text
do not pretend it is implemented
```

Do not use fake numbers in production.

Demo numbers must only exist in explicit demo mode.

---

# 122. NO HARDCODED ANALYTICS

Never do:

```javascript
visitors = 12431;
```

to make the dashboard look complete.

Every production metric must originate from actual stored data.

---

# 123. NO SECURITY BY UI

Hiding a button is not authorization.

Every API endpoint must enforce authorization server-side.

---

# 124. RESILIENCE

The system must tolerate:

```text
duplicate events
network failure
database restart
Render cold start
client offline state
invalid client
malicious payload
traffic spike
clock skew
browser limitations
cookie blocking
ad blockers
```

---

# 125. ANALYTICS BLOCKING

Some users may block analytics.

Do not attempt to circumvent:

```text
ad blockers
browser tracking protection
privacy extensions
```

The dashboard should acknowledge:

```text
Analytics may undercount users who block tracking.
```

---

# 126. ESTIMATION DISCLOSURE

The UI should clearly distinguish:

```text
Unique Visitors
```

from:

```text
Estimated Unique Visitors
```

Recommended wording:

> Estimated unique visitors are based on anonymous first-party identifiers and privacy-preserving server-side signals. They are an approximation and may undercount or overcount real people.

---

# 127. IMPORTANT VISITOR COUNTING EDGE CASES

Test:

### Same person, same device

```text
Visitor A
Visitor A
```

Should generally count as one visitor within the configured identity period.

### Same person, different browser

May count as separate anonymous visitors.

### Same IP, two people

Should NOT automatically merge them permanently.

### VPN

May change visitor identity.

### Mobile network

IP may change.

### Cookies disabled

Fallback identification may be less accurate.

### Incognito

May appear as a new visitor.

### Shared computer

Different people may appear as one anonymous browser identity.

The dashboard must document these limitations.

---

# 128. "REAL PEOPLE" METRIC

Provide three different metrics:

```text
Unique Visitors
Estimated People
Returning Visitors
```

But DO NOT falsely claim that "Estimated People" is an exact human count.

Better:

```text
Estimated Unique Visitors
```

and:

```text
Visitor identities observed
```

Use transparent definitions.

---

# 129. OPTIONAL ADVANCED VISITOR MODEL

Later, allow logged-in websites to optionally provide a privacy-safe application user identifier.

Example:

```javascript
meowAnalytics.identify("anonymous-account-id");
```

BUT:

Do not accept:

```text
email
phone
name
```

as the identifier.

Document that the identifier must be pseudonymous and that the website owner is responsible for its legality and privacy implications.

---

# 130. REAL-TIME ARCHITECTURE

Do not create an expensive persistent WebSocket architecture unless needed.

Start with:

```text
poll every 5-10 seconds
```

for the dashboard.

If performance testing proves it necessary, implement SSE/WebSockets later.

---

# 131. ALERTS

Optional Phase 2 feature.

Allow:

```text
Traffic spike
Traffic drop
Error spike
Performance regression
```

Example:

```text
Alert when:

5xx errors > 5%
for 5 minutes
```

Do not implement this before core analytics works.

---

# 132. COMPARISON PERIODS

Support:

```text
Current period
Previous period
```

Example:

```text
Visitors

This week:
12,421

Previous week:
10,832

Change:
+14.7%
```

Calculate from real data.

---

# 133. ANOMALY DETECTION

Optional future feature.

Detect unusual changes.

Do not call something an anomaly without a defensible statistical rule.

If implemented:

```text
baseline
standard deviation
moving average
minimum sample size
```

Document the algorithm.

---

# 134. PROJECT HEALTH

Add a project health card:

```text
Collection
✓ Receiving events

Database
✓ Healthy

SDK
✓ Active

Last event
12 seconds ago
```

---

# 135. DATA PIPELINE HEALTH

Admin-only page:

```text
Events received
Events rejected
Events deduplicated
Events processed
Database latency
API latency
Error rate
Queue depth
```

This is extremely useful for debugging.

---

# 136. LOGICAL DELETE VS PHYSICAL DELETE

For analytics deletion requirements, understand the difference.

If a user requests deletion:

```text
actually remove the relevant data
```

Do not merely set:

```text
deleted=true
```

unless there is a documented reason.

---

# 137. CLEANUP JOBS

Implement cleanup as an idempotent job.

Example:

```text
delete visitor identity records older than 24 hours
delete raw events older than retention period
compact old aggregates
```

If interrupted:

```text
resume safely
```

Do not delete an entire table in one enormous transaction.

Process in batches.

---

# 138. CHECKPOINTS

Long-running maintenance jobs should maintain checkpoints.

Example:

```text
cleanup_job
last_processed_timestamp
last_processed_id
status
```

If Render restarts:

```text
resume
```

rather than starting blindly from zero.

---

# 139. BACKUP

Document database backup strategy.

Do not claim backups exist unless actually configured.

---

# 140. MIGRATION SAFETY

Before destructive migration:

```text
validate schema
run migration
verify
```

Never silently destroy analytics data.

---

# 141. FINAL DELIVERABLE

The final project must contain:

```text
✓ SDK
✓ React integration
✓ API
✓ Database
✓ Dashboard
✓ Projects
✓ Page views
✓ Unique visitors
✓ Sessions
✓ Returning visitors
✓ Referrers
✓ UTM
✓ Countries
✓ Devices
✓ OS
✓ Browsers
✓ Custom events
✓ Performance metrics
✓ Error tracking
✓ Live traffic
✓ Filters
✓ Grouping
✓ Date ranges
✓ Comparison
✓ Aggregation
✓ Data retention
✓ Privacy controls
✓ API authentication
✓ Rate limiting
✓ Export
✓ Tests
✓ Documentation
✓ Render deployment
✓ External persistent database support
```

---

# 142. IMPLEMENTATION PHASES

Do NOT attempt to write the entire system in one uncontrolled pass.

Use milestones.

## Phase 1 — Foundation

Implement:

```text
monorepo
API
database
projects
site IDs
authentication
basic SDK
page views
```

Verification:

```text
website sends event
API receives it
database stores it
dashboard displays it
```

Do not continue until this works.

---

## Phase 2 — Core Analytics

Implement:

```text
visitors
sessions
returning visitors
time series
top pages
referrers
devices
OS
browser
countries
```

Verification:

Generate controlled traffic and verify exact expected counts.

---

## Phase 3 — Dashboard

Implement:

```text
overview
charts
tables
filters
date ranges
comparisons
project switching
responsive UI
dark mode
```

---

## Phase 4 — Custom Events

Implement:

```text
track()
event properties
event dashboard
event filters
event grouping
```

---

## Phase 5 — Performance

Implement:

```text
LCP
INP
CLS
FCP
TTFB
performance dashboard
percentiles
```

---

## Phase 6 — Reliability

Implement:

```text
batching
retry
offline queue
deduplication
rate limiting
backpressure
cold-start handling
database failure handling
```

---

## Phase 7 — Privacy

Implement:

```text
visitor hashing
retention
privacy modes
data deletion
export
sensitive-data filtering
```

---

## Phase 8 — Production Hardening

Implement:

```text
security headers
CORS
validation
load tests
security tests
database indexes
aggregation
monitoring
Render deployment
```

---

# 143. VERIFICATION GATE

At the end of every phase:

1. Build the project.
2. Run type checking.
3. Run unit tests.
4. Run integration tests.
5. Run relevant E2E tests.
6. Start the application.
7. Test the actual browser flow.
8. Inspect network requests.
9. Inspect database records.
10. Verify dashboard numbers against database numbers.
11. Fix all failures.
12. Only then continue.

Never mark a phase complete because the code "looks correct."

---

# 144. FINAL ACCEPTANCE TEST

Create a test website.

Generate:

```text
Visitor A
  3 sessions
  12 page views
  4 events

Visitor B
  2 sessions
  7 page views
  2 events

Visitor C
  1 session
  4 page views
  1 event
```

Then verify:

```text
Unique visitors = 3
Sessions = 6
Page views = 23
Events = 7
```

Then:

```text
Visitor A returns
```

Verify:

```text
unique visitors remains 3
returning visitors increases
```

Then simulate:

```text
duplicate event
network failure
retry
Render restart
database reconnect
```

Verify analytics remain correct.

---

# 145. DEFINITION OF DONE

Meow Analytics is NOT complete when:

```text
the dashboard looks good
```

It is complete only when:

```text
data collection works
AND
data is accurate
AND
unique visitor counting works
AND
returning visitors work
AND
sessions work
AND
custom events work
AND
performance metrics work
AND
filters work
AND
aggregation works
AND
privacy controls work
AND
data deletion works
AND
security tests pass
AND
load tests pass
AND
Render deployment works
AND
database persistence works
AND
the SDK cannot break the host website
AND
documentation is complete
```

---

# 146. AGENT BEHAVIOR RULES

While implementing this project:

1. Do not fabricate completed functionality.
2. Do not hide errors.
3. Do not silently skip tests.
4. Do not replace real analytics with mock numbers.
5. Do not store unnecessary personal information.
6. Do not permanently store raw IP addresses by default.
7. Do not implement invasive fingerprinting.
8. Do not allow analytics failures to break the host website.
9. Do not use Render local storage as the production database.
10. Do not expose admin secrets to the browser.
11. Do not trust client-side authorization.
12. Do not blindly trust client timestamps.
13. Do not allow unlimited event payloads.
14. Do not allow unlimited database growth.
15. Do not create dashboard widgets that don't have real backend support.
16. Do not mark work complete without verification.
17. Do not use TODO placeholders for required core functionality.
18. Do not optimize prematurely before measuring.
19. Do not over-engineer Phase 1.
20. Prefer simple, maintainable implementations.
21. Keep the SDK extremely lightweight.
22. Keep the collector resilient.
23. Make all analytics definitions explicit.
24. Clearly label estimates.
25. Preserve data correctness above visual polish.

---

# 147. MOST IMPORTANT PRODUCT PRINCIPLE

Meow Analytics should answer:

> "What is happening on my website?"

without becoming:

> "A surveillance system for everyone visiting my website."

Build it as a **privacy-conscious first-party analytics platform**, with enough detail to understand traffic deeply while minimizing unnecessary collection.

The resulting product should feel like:

```text
Vercel Analytics
+
Speed Insights
+
Simple Plausible-style privacy
+
Custom event analytics
+
Real-time traffic
+
A transparent unique-visitor system
```

but implemented independently and self-hosted.

Do not copy proprietary code.

Do not claim feature parity unless the feature has actually been implemented and verified.
