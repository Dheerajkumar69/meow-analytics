export interface Project {
  id: string;
  name: string;
  site_id: string;
  status: 'active' | 'archived' | 'deleted';
  timezone: string;
  privacy_mode?: 'strict' | 'balanced' | 'detailed';
  visitor_retention_hours?: number;
  event_retention_days?: number;
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

export interface ApiKeyCreatedResponse extends ApiKey {
  key: string;
}

export interface ApiError {
  code: string;
  message: string;
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

export interface RealtimeTimelinePoint {
  minute: string;
  visitors: number;
  pageViews: number;
  events: number;
}

export interface RealtimeRecentEvent {
  id: string;
  type: 'pageview' | 'event';
  name: string;
  path: string;
  country: string | null;
  device: string | null;
  timestamp: string;
}

export interface LiveAnalyticsResponse {
  siteId: string;
  liveVisitors: number;
  liveSessions: number;
  activePages: { path: string; visitors: number }[];
  timeline?: RealtimeTimelinePoint[];
  recentEvents?: RealtimeRecentEvent[];
  windowMinutes: number;
  timestamp: string;
}

export interface FunnelStep {
  name: string;
  type: 'pageview' | 'event';
  target: string;
}

export interface FunnelStepResult {
  stepIndex: number;
  name: string;
  type: 'pageview' | 'event';
  target: string;
  visitors: number;
  conversionRate: number;
  dropOffCount: number;
  dropOffRate: number;
}

export interface FunnelResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  overallConversionRate: number;
  totalStarted: number;
  totalCompleted: number;
  steps: FunnelStepResult[];
}

export interface RetentionCohortRow {
  cohortDate: string;
  cohortSize: number;
  retention: { periodIndex: number; returningCount: number; percentage: number }[];
}

export interface RetentionResponse {
  siteId: string;
  cohortType: 'day' | 'week' | 'month';
  timeRange: { from: string; to: string };
  cohorts: RetentionCohortRow[];
}

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

export interface OverviewAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  comparisonTimeRange?: { from: string; to: string } | null;
  metrics: OverviewMetrics;
  comparison?: OverviewMetrics | null;
  changes?: MetricChanges | null;
  filters?: FilterClause[];
  limitationNote: string;
  bounceRateDefinition: string;
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

export interface BreakdownResponse {
  siteId: string;
  dimension: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  totalSessions: number;
  totalPageViews: number;
  items: BreakdownItem[];
}

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

export interface LanguagesAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  totalVisitors: number;
  languages: LanguageItem[];
}

class ApiClient {
  private secret: string = '';

  constructor() {
    // Load from localStorage or env
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('meow_admin_secret') : null;
    const envSecret = import.meta.env.VITE_ADMIN_SECRET;
    if (saved) {
      this.secret = saved;
    } else if (envSecret) {
      this.secret = envSecret;
    } else {
      // Default fallback for dev ease
      this.secret = 'meow_admin_super_secret_key_12345';
    }
  }

  getSecret(): string {
    return this.secret;
  }

  setSecret(secret: string): void {
    this.secret = secret;
    localStorage.setItem('meow_admin_secret', secret);
  }

  private inFlight = new Map<string, Promise<any>>();

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const isGet = method === 'GET';

    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    // Deduplicate identical concurrent in-flight GET requests
    const cacheKey = isGet ? `${this.secret || ''}:${url}` : null;
    if (cacheKey && this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey) as Promise<T>;
    }

    const promise = (async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers as Record<string, string>),
      };

      if (this.secret) {
        headers['Authorization'] = `Bearer ${this.secret}`;
      }

      const res = await fetch(url, {
        ...options,
        headers,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const errMessage = data?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        const errCode = data?.error?.code || 'UNKNOWN_ERROR';
        const error: any = new Error(errMessage);
        error.code = errCode;
        throw error;
      }

      return data as T;
    })();

    if (cacheKey) {
      this.inFlight.set(cacheKey, promise);
      promise.finally(() => {
        this.inFlight.delete(cacheKey);
      });
    }

    return promise;
  }

  // Health
  async getHealth(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/api/health');
  }

  async getReady(): Promise<{ status: string; database: string }> {
    return this.request<{ status: string; database: string }>('/api/ready');
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/v1/projects');
  }

  async getProject(id: string): Promise<Project> {
    return this.request<Project>(`/api/v1/projects/${id}`);
  }

  async createProject(input: { name: string; timezone?: string }): Promise<Project> {
    return this.request<Project>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateProject(
    id: string,
    input: {
      name?: string;
      timezone?: string;
      status?: string;
      privacy_mode?: 'strict' | 'balanced' | 'detailed';
      visitor_retention_hours?: number;
      event_retention_days?: number;
    }
  ): Promise<Project> {
    return this.request<Project>(`/api/v1/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  async exportData(
    id: string,
    query: { format?: 'json' | 'csv'; type?: string; from?: string; to?: string; filters?: FilterClause[] }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (query.format) params.set('format', query.format);
    if (query.type) params.set('type', query.type);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.filters && query.filters.length > 0) params.set('filters', JSON.stringify(query.filters));

    const path = `/api/v1/projects/${id}/export?${params.toString()}`;
    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    if (query.format === 'csv') {
      const headers: Record<string, string> = { Accept: 'text/csv' };
      if (this.secret) headers['Authorization'] = `Bearer ${this.secret}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      return res.text();
    }
    return this.request<any>(path);
  }

  async deleteDateRange(id: string, from: string, to: string): Promise<{ success: boolean; message: string; deleted: any }> {
    return this.request<{ success: boolean; message: string; deleted: any }>(`/api/v1/projects/${id}/data`, {
      method: 'DELETE',
      body: JSON.stringify({ from, to }),
    });
  }

  async deleteVisitorData(
    id: string,
    options: { visitorId?: string; anonymousId?: string; olderThanHours?: number }
  ): Promise<{ success: boolean; message: string; deletedCount: number }> {
    return this.request<{ success: boolean; message: string; deletedCount: number }>(`/api/v1/projects/${id}/visitors`, {
      method: 'DELETE',
      body: JSON.stringify(options),
    });
  }

  async deleteProject(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/projects/${id}`, {
      method: 'DELETE',
    });
  }


  // Domains
  async getDomains(projectId: string): Promise<ProjectDomain[]> {
    return this.request<ProjectDomain[]>(`/api/v1/projects/${projectId}/domains`);
  }

  async createDomain(projectId: string, domain: string): Promise<ProjectDomain> {
    return this.request<ProjectDomain>(`/api/v1/projects/${projectId}/domains`, {
      method: 'POST',
      body: JSON.stringify({ domain }),
    });
  }

  async deleteDomain(projectId: string, domainId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/projects/${projectId}/domains/${domainId}`, {
      method: 'DELETE',
    });
  }

  // API Keys
  async getKeys(projectId: string): Promise<ApiKey[]> {
    return this.request<ApiKey[]>(`/api/v1/projects/${projectId}/keys`);
  }

  async createKey(projectId: string, name: string): Promise<ApiKeyCreatedResponse> {
    return this.request<ApiKeyCreatedResponse>(`/api/v1/projects/${projectId}/keys`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteKey(projectId: string, keyId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/projects/${projectId}/keys/${keyId}`, {
      method: 'DELETE',
    });
  }

  // Analytics
  async getVisitorsAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<VisitorsAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<VisitorsAnalyticsResponse>(`/analytics/visitors?${qs.toString()}`);
  }

  async getSessionsAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<SessionsAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<SessionsAnalyticsResponse>(`/analytics/sessions?${qs.toString()}`);
  }

  async getLiveAnalytics(siteId: string, windowMinutes = 5): Promise<LiveAnalyticsResponse> {
    return this.request<LiveAnalyticsResponse>(`/analytics/live?siteId=${encodeURIComponent(siteId)}&windowMinutes=${windowMinutes}`);
  }

  async getOverviewAnalytics(siteId: string, params?: { from?: string; to?: string; compare?: ComparisonType; filters?: FilterClause[]; includeBots?: boolean }): Promise<OverviewAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.compare && params.compare !== 'none' ? { compare: params.compare } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<OverviewAnalyticsResponse>(`/analytics/overview?${qs.toString()}`);
  }

  async getTimeseries(siteId: string, params?: {
    from?: string;
    to?: string;
    metric?: 'visitors' | 'sessions' | 'page_views';
    resolution?: 'auto' | 'hourly' | 'daily' | 'weekly' | 'monthly';
    compare?: ComparisonType;
    filters?: FilterClause[];
    includeBots?: boolean;
  }): Promise<TimeseriesResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.metric ? { metric: params.metric } : {}),
      ...(params?.resolution ? { resolution: params.resolution } : {}),
      ...(params?.compare && params.compare !== 'none' ? { compare: params.compare } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<TimeseriesResponse>(`/analytics/timeseries?${qs.toString()}`);
  }

  async getPages(siteId: string, params?: {
    from?: string;
    to?: string;
    type?: 'top' | 'landing' | 'exit' | 'hostnames';
    sortBy?: 'visitors' | 'page_views' | 'sessions';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    filters?: FilterClause[];
    includeBots?: boolean;
  }): Promise<TopPagesResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.type ? { type: params.type } : {}),
      ...(params?.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params?.sortOrder ? { sortOrder: params.sortOrder } : {}),
      ...(params?.limit !== undefined ? { limit: String(params.limit) } : {}),
      ...(params?.offset !== undefined ? { offset: String(params.offset) } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<TopPagesResponse>(`/analytics/pages?${qs.toString()}`);
  }

  async getBreakdown(siteId: string, params: {
    dimension: 'path' | 'country' | 'device' | 'os' | 'browser' | 'source' | 'referrer' | 'utm';
    from?: string;
    to?: string;
    sortBy?: 'visitors' | 'page_views' | 'sessions';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    filters?: FilterClause[];
    includeBots?: boolean;
  }): Promise<BreakdownResponse> {
    const qs = new URLSearchParams({
      siteId,
      dimension: params.dimension,
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
      ...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
      ...(params.offset !== undefined ? { offset: String(params.offset) } : {}),
      ...(params.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<BreakdownResponse>(`/analytics/breakdown?${qs.toString()}`);
  }

  async getSourcesAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<SourcesAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<SourcesAnalyticsResponse>(`/analytics/sources?${qs.toString()}`);
  }

  async getSourceDrilldown(siteId: string, source: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<SourceDrilldownResponse> {
    const qs = new URLSearchParams({
      siteId,
      source,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<SourceDrilldownResponse>(`/analytics/sources/drilldown?${qs.toString()}`);
  }

  async getUtmAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<UtmAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<UtmAnalyticsResponse>(`/analytics/utm?${qs.toString()}`);
  }

  async getLocationsAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<LocationsAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<LocationsAnalyticsResponse>(`/analytics/locations?${qs.toString()}`);
  }

  async getDevicesAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<DevicesAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<DevicesAnalyticsResponse>(`/analytics/devices?${qs.toString()}`);
  }

  async getBrowsersAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<BrowsersAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<BrowsersAnalyticsResponse>(`/analytics/browsers?${qs.toString()}`);
  }

  async getOsAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<OsAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<OsAnalyticsResponse>(`/analytics/os?${qs.toString()}`);
  }

  async getLanguagesAnalytics(siteId: string, params?: { from?: string; to?: string; filters?: FilterClause[]; includeBots?: boolean }): Promise<LanguagesAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<LanguagesAnalyticsResponse>(`/analytics/languages?${qs.toString()}`);
  }

  // Phase 6 Custom Events & Error Tracking API Methods
  async getEvents(
    siteId: string,
    params?: {
      from?: string;
      to?: string;
      search?: string;
      sortBy?: 'count' | 'visitors' | 'sessions' | 'name';
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
      filters?: FilterClause[];
      includeBots?: boolean;
    }
  ): Promise<EventsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.search ? { search: params.search } : {}),
      ...(params?.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params?.sortOrder ? { sortOrder: params.sortOrder } : {}),
      ...(params?.limit ? { limit: String(params.limit) } : {}),
      ...(params?.offset ? { offset: String(params.offset) } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<EventsResponse>(`/analytics/events?${qs.toString()}`);
  }

  async getEventDetail(
    siteId: string,
    eventName: string,
    params?: {
      from?: string;
      to?: string;
      filters?: FilterClause[];
      includeBots?: boolean;
    }
  ): Promise<EventDetailResponse> {
    const qs = new URLSearchParams({
      siteId,
      eventName,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<EventDetailResponse>(`/analytics/events/detail?${qs.toString()}`);
  }

  async getEventPropertyAnalytics(
    siteId: string,
    eventName: string,
    propertyKey: string,
    params?: {
      from?: string;
      to?: string;
      limit?: number;
      filters?: FilterClause[];
      includeBots?: boolean;
    }
  ): Promise<EventPropertyAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      eventName,
      propertyKey,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.limit ? { limit: String(params.limit) } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.includeBots ? { includeBots: 'true' } : {}),
    });
    return this.request<EventPropertyAnalyticsResponse>(`/analytics/events/properties?${qs.toString()}`);
  }

  async getErrors(
    siteId: string,
    params?: {
      from?: string;
      to?: string;
      search?: string;
      sortBy?: 'occurrences' | 'visitors' | 'last_seen' | 'first_seen';
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }
  ): Promise<ErrorsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.search ? { search: params.search } : {}),
      ...(params?.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params?.sortOrder ? { sortOrder: params.sortOrder } : {}),
      ...(params?.limit ? { limit: String(params.limit) } : {}),
      ...(params?.offset ? { offset: String(params.offset) } : {}),
    });
    return this.request<ErrorsResponse>(`/analytics/errors?${qs.toString()}`);
  }

  async getErrorDetail(
    siteId: string,
    errorGroup: string,
    params?: {
      from?: string;
      to?: string;
    }
  ): Promise<ErrorDetailResponse> {
    const qs = new URLSearchParams({
      siteId,
      errorGroup,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
    });
    return this.request<ErrorDetailResponse>(`/analytics/errors/detail?${qs.toString()}`);
  }

  // Phase 7 Performance & Speed Insights API Method
  async getPerformance(
    siteId: string,
    params?: {
      from?: string;
      to?: string;
      path?: string;
      device?: 'desktop' | 'mobile' | 'tablet';
      country?: string;
      filters?: FilterClause[];
      comparePeriod?: boolean;
    }
  ): Promise<PerformanceAnalyticsResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.path ? { path: params.path } : {}),
      ...(params?.device ? { device: params.device } : {}),
      ...(params?.country ? { country: params.country } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
      ...(params?.comparePeriod !== undefined ? { comparePeriod: String(params.comparePeriod) } : {}),
    });
    return this.request<PerformanceAnalyticsResponse>(`/analytics/performance?${qs.toString()}`);
  }

  async getFunnels(
    siteId: string,
    steps: FunnelStep[],
    params?: {
      from?: string;
      to?: string;
      filters?: FilterClause[];
    }
  ): Promise<FunnelResponse> {
    const qs = new URLSearchParams({
      siteId,
      steps: JSON.stringify(steps),
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
      ...(params?.filters && params.filters.length > 0 ? { filters: JSON.stringify(params.filters) } : {}),
    });
    return this.request<FunnelResponse>(`/analytics/funnels?${qs.toString()}`);
  }

  async getRetention(
    siteId: string,
    params?: {
      cohortType?: 'day' | 'week' | 'month';
      from?: string;
      to?: string;
    }
  ): Promise<RetentionResponse> {
    const qs = new URLSearchParams({
      siteId,
      ...(params?.cohortType ? { cohortType: params.cohortType } : {}),
      ...(params?.from ? { from: params.from } : {}),
      ...(params?.to ? { to: params.to } : {}),
    });
    return this.request<RetentionResponse>(`/analytics/retention?${qs.toString()}`);
  }
}

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

// Phase 7 Performance Interfaces
export interface PerformanceMetricSummary {
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  rating: 'good' | 'needs-improvement' | 'poor' | null;
  count: number;
  trend: number | null;
}

export interface PerformanceByPage {
  path: string;
  count: number;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  fcp: number | null;
  ttfb: number | null;
}

export interface PerformanceByDevice {
  device: string;
  count: number;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  fcp: number | null;
  ttfb: number | null;
}

export interface PerformanceByCountry {
  countryCode: string;
  countryName: string;
  count: number;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  fcp: number | null;
  ttfb: number | null;
}

export interface PerformanceNavigationTimingSummary {
  dns: { p75: number | null; avg: number | null };
  connection: { p75: number | null; avg: number | null };
  request: { p75: number | null; avg: number | null };
  response: { p75: number | null; avg: number | null };
  domLoading: { p75: number | null; avg: number | null };
  pageLoad: { p75: number | null; avg: number | null };
}

export interface PerformanceAnalyticsResponse {
  siteId: string;
  timeRange: { from: string; to: string };
  previousTimeRange: { from: string; to: string } | null;
  totalSamples: number;
  isSampled: boolean;
  sampleRate: number;
  summary: {
    lcp: PerformanceMetricSummary;
    inp: PerformanceMetricSummary;
    cls: PerformanceMetricSummary;
    fcp: PerformanceMetricSummary;
    ttfb: PerformanceMetricSummary;
  };
  previousSummary: {
    lcp: { p75: number | null };
    inp: { p75: number | null };
    cls: { p75: number | null };
    fcp: { p75: number | null };
    ttfb: { p75: number | null };
  } | null;
  navigationTiming: PerformanceNavigationTimingSummary;
  byPage: PerformanceByPage[];
  byDevice: PerformanceByDevice[];
  byCountry: PerformanceByCountry[];
}

export const api = new ApiClient();

