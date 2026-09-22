export type ProjectStatus = 'active' | 'archived' | 'deleted';

export interface Project {
  id: string;
  name: string;
  site_id: string;
  status: ProjectStatus;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDomain {
  id: string;
  project_id: string;
  domain: string;
  verified: boolean;
  created_at: string;
}

export interface ApiKey {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ApiKeyCreatedResponse {
  id: string;
  project_id: string;
  name: string;
  key: string;
  key_prefix: string;
  created_at: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: 'ok';
}

export interface ReadyResponse {
  status: 'ready' | 'error';
  database: 'connected' | 'disconnected';
  timestamp: string;
}

export type EventType = 'page_view' | 'ping' | string;

export interface EventPayload {
  eventId: string;
  type: EventType;
  eventName?: string;
  properties?: Record<string, any>;
  timestamp: number;
  path: string;
  hostname: string;
  referrer: string;
  visitorId?: string;
  sessionId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  language?: string;
  timezone?: string;
}


export interface CollectRequestPayload {
  siteId: string;
  events: EventPayload[];
}

export interface CollectResponse {
  success: boolean;
  ingested: number;
  duplicates: number;
}

export interface EventRecord {
  event_id: string;
  site_id: string;
  type: string;
  path: string;
  hostname: string;
  referrer: string;
  user_agent: string | null;
  origin: string | null;
  visitor_id?: string | null;
  session_id?: string | null;
  timestamp: string;
  created_at: string;
}

export interface PageViewRecord {
  id: string;
  event_id: string;
  site_id: string;
  path: string;
  hostname: string;
  referrer: string;
  visitor_id?: string | null;
  session_id?: string | null;
  timestamp: string;
  created_at: string;
}

export interface VisitorRecord {
  id: string;
  site_id: string;
  anonymous_id: string;
  first_seen_at: string;
  last_seen_at: string;
  first_path: string;
  last_path: string;
  first_referrer: string;
  last_referrer: string;
  created_at: string;
}

export interface SessionRecord {
  id: string;
  session_id: string;
  site_id: string;
  visitor_id: string;
  started_at: string;
  last_seen_at: string;
  landing_page: string;
  exit_page: string;
  page_views: number;
  event_count: number;
  is_bounce: boolean;
  duration_seconds: number;
  is_returning: boolean;
  country_code?: string | null;
  country_name?: string | null;
  region?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  language?: string | null;
  screen_resolution?: string | null;
  referrer_source?: string | null;
  referrer_hostname?: string | null;
  referrer_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  is_bot?: boolean;
  created_at: string;
}

export interface VisitorsAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  uniqueVisitors: number;
  estimatedUniqueVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  returningVisitorRate: number;
  visitors: VisitorRecord[];
  limitationNote: string;
}

export interface SessionsAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  sessions: number;
  pageViews: number;
  bounceRate: number;
  bounceRateDefinition: string;
  averageSessionDuration: number;
  pagesPerSession: number;
  recentSessions: SessionRecord[];
}

export interface LiveAnalyticsResponse {
  siteId: string;
  liveVisitors: number;
  liveSessions: number;
  activePages: { path: string; visitors: number }[];
  windowMinutes: number;
  timestamp: string;
}

export interface OverviewAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  metrics: {
    estimatedUniqueVisitors: number;
    newVisitors: number;
    returningVisitors: number;
    returningVisitorRate: number;
    sessions: number;
    pageViews: number;
    bounceRate: number;
    averageSessionDuration: number;
    pagesPerSession: number;
    liveVisitors: number;
  };
  limitationNote: string;
  bounceRateDefinition: string;
}

// --- Phase 4 Analytics Interfaces ---

export interface SourceItem {
  source: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  percentage: number;
}

export interface SourcesAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  totalSessions: number;
  totalPageViews: number;
  sources: SourceItem[];
}

export interface SourceDrilldownItem {
  referrerHostname: string;
  referrerUrl: string;
  visitors: number;
  sessions: number;
  pageViews: number;
}

export interface SourceDrilldownResponse {
  siteId: string;
  source: string;
  timeRange: { from: string; to: string };
  referrers: SourceDrilldownItem[];
}

export interface UtmItem {
  campaign: string | null;
  source: string | null;
  medium: string | null;
  term: string | null;
  content: string | null;
  visitors: number;
  sessions: number;
  pageViews: number;
}

export interface UtmAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  campaigns: UtmItem[];
}

export interface CountryItem {
  countryCode: string;
  countryName: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  percentage: number;
}

export interface LocationsAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  countries: CountryItem[];
}

export interface DeviceItem {
  device: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  percentage: number;
}

export interface DevicesAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  devices: DeviceItem[];
}

export interface BrowserItem {
  browser: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  percentage: number;
}

export interface BrowsersAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  browsers: BrowserItem[];
}

export interface OsItem {
  os: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  percentage: number;
}

export interface OsAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  os: OsItem[];
}

export interface LanguageItem {
  language: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  percentage: number;
}

// --- Phase 5 Types: Dashboard, Timeseries, Filters, Comparisons, Pages, Breakdown ---

export type FilterField =
  | 'path'
  | 'route'
  | 'country'
  | 'device'
  | 'os'
  | 'browser'
  | 'referrer'
  | 'source'
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign';

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'ends_with';

export interface FilterClause {
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

export type ComparisonType = 'none' | 'previous_period' | 'previous_year';

export interface OverviewMetrics {
  estimatedUniqueVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  returningVisitorRate: number;
  sessions: number;
  pageViews: number;
  bounceRate: number;
  averageSessionDuration: number;
  pagesPerSession: number;
  liveVisitors: number;
}

export interface MetricChanges {
  estimatedUniqueVisitorsChange: number;
  newVisitorsChange: number;
  returningVisitorsChange: number;
  returningVisitorRateChange: number;
  sessionsChange: number;
  pageViewsChange: number;
  bounceRateChange: number;
  averageSessionDurationChange: number;
  pagesPerSessionChange: number;
}

export interface OverviewAnalyticsResponseV2 extends OverviewAnalyticsResponse {
  comparison?: OverviewMetrics | null;
  changes?: MetricChanges | null;
  comparisonTimeRange?: { from: string; to: string } | null;
  filters?: FilterClause[];
}

export interface TimeseriesPoint {
  timestamp: string;
  label: string;
  value: number;
  comparisonValue?: number | null;
}

export interface TimeseriesResponse {
  siteId: string;
  metric: 'visitors' | 'sessions' | 'page_views';
  resolution: 'hourly' | 'daily' | 'weekly' | 'monthly';
  timeRange: { from: string; to: string };
  comparisonTimeRange?: { from: string; to: string } | null;
  series: TimeseriesPoint[];
  total: number;
  comparisonTotal?: number | null;
  totalChange?: number | null;
}

export interface PageItem {
  path: string;
  visitors: number;
  pageViews: number;
  sessions: number;
  percentage: number;
}

export interface TopPagesResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  totalPageViews: number;
  totalPages: number;
  pages: PageItem[];
}

export interface BreakdownItem {
  key: string;
  label: string;
  visitors: number;
  sessions: number;
  pageViews: number;
  percentage: number;
}

export type BreakdownDimension =
  | 'path'
  | 'country'
  | 'device'
  | 'os'
  | 'browser'
  | 'source'
  | 'referrer'
  | 'utm';

export interface BreakdownResponse {
  siteId: string;
  dimension: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  totalSessions: number;
  totalPageViews: number;
  items: BreakdownItem[];
}

// --- Phase 6 Custom Events & Error Tracking Types ---

export interface EventItem {
  eventName: string;
  count: number;
  visitors: number;
  sessions: number;
}

export interface EventsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalEvents: number;
  totalUniqueEvents: number;
  events: EventItem[];
}

export interface EventPathItem {
  path: string;
  count: number;
  percentage: number;
}

export interface EventTimeseriesPoint {
  timestamp: string;
  count: number;
  visitors: number;
}

export interface EventPropertyValueItem {
  value: string;
  count: number;
  percentage: number;
}

export interface EventDetailResponse {
  siteId: string;
  eventName: string;
  timeRange: { from: string; to: string };
  occurrences: number;
  visitors: number;
  sessions: number;
  paths: EventPathItem[];
  timeseries: EventTimeseriesPoint[];
  properties: Record<string, EventPropertyValueItem[]>;
}

export interface EventPropertyAnalyticsResponse {
  siteId: string;
  eventName: string;
  propertyKey: string;
  timeRange: { from: string; to: string };
  totalOccurrences: number;
  values: EventPropertyValueItem[];
}

export interface ErrorItem {
  errorGroup: string;
  errorType: string;
  message: string;
  occurrences: number;
  affectedVisitors: number;
  firstSeen: string;
  lastSeen: string;
  topPaths?: string[];
  topBrowsers?: string[];
  topOs?: string[];
}

export interface ErrorsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalErrors: number;
  uniqueErrors: number;
  errors: ErrorItem[];
}

export interface ErrorDetailResponse {
  siteId: string;
  errorGroup: string;
  errorType: string;
  message: string;
  occurrences: number;
  affectedVisitors: number;
  firstSeen: string;
  lastSeen: string;
  paths: { path: string; count: number }[];
  browsers: { browser: string; count: number }[];
  os: { os: string; count: number }[];
  timeseries: { timestamp: string; count: number }[];
}

