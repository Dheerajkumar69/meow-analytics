import { z } from 'zod';
import { isValidTimezone } from '../utils/timezone.js';
import { normalizeDomain } from '../utils/domain.js';
import { extractUtmParameters } from '../utils/utm.js';
import { sanitizeEventProperties } from '../utils/sanitize.js';

export const createProjectSchema = z
  .object({
    name: z
      .string({ required_error: 'Project name is required' })
      .trim()
      .min(1, 'Project name cannot be empty')
      .max(100, 'Project name cannot exceed 100 characters'),
    timezone: z
      .string()
      .trim()
      .default('UTC')
      .refine(isValidTimezone, {
        message: 'Invalid IANA timezone (e.g., "UTC", "America/New_York", "Asia/Kolkata")',
      }),
    privacyMode: z.enum(['strict', 'balanced', 'detailed']).optional().default('balanced'),
    privacy_mode: z.enum(['strict', 'balanced', 'detailed']).optional(),
    visitorRetentionHours: z.coerce.number().int().positive().max(8760).optional().default(24),
    visitor_retention_hours: z.coerce.number().int().positive().max(8760).optional(),
    eventRetentionDays: z.coerce.number().int().positive().max(3650).optional().default(90),
    event_retention_days: z.coerce.number().int().positive().max(3650).optional(),
  })
  .strict()
  .transform((data) => ({
    name: data.name,
    timezone: data.timezone,
    privacy_mode: data.privacy_mode || data.privacyMode || 'balanced',
    visitor_retention_hours: data.visitor_retention_hours || data.visitorRetentionHours || 24,
    event_retention_days: data.event_retention_days || data.eventRetentionDays || 90,
  }));

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Project name cannot be empty')
      .max(100, 'Project name cannot exceed 100 characters')
      .optional(),
    timezone: z
      .string()
      .trim()
      .refine(isValidTimezone, {
        message: 'Invalid IANA timezone (e.g., "UTC", "America/New_York", "Asia/Kolkata")',
      })
      .optional(),
    status: z.enum(['active', 'archived', 'deleted']).optional(),
    privacyMode: z.enum(['strict', 'balanced', 'detailed']).optional(),
    privacy_mode: z.enum(['strict', 'balanced', 'detailed']).optional(),
    visitorRetentionHours: z.coerce.number().int().positive().max(8760).optional(),
    visitor_retention_hours: z.coerce.number().int().positive().max(8760).optional(),
    eventRetentionDays: z.coerce.number().int().positive().max(3650).optional(),
    event_retention_days: z.coerce.number().int().positive().max(3650).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.timezone !== undefined ||
      data.status !== undefined ||
      data.privacyMode !== undefined ||
      data.privacy_mode !== undefined ||
      data.visitorRetentionHours !== undefined ||
      data.visitor_retention_hours !== undefined ||
      data.eventRetentionDays !== undefined ||
      data.event_retention_days !== undefined,
    {
      message: 'At least one field must be provided for update',
    }
  )
  .transform((data) => ({
    name: data.name,
    timezone: data.timezone,
    status: data.status,
    privacy_mode: data.privacy_mode || data.privacyMode,
    visitor_retention_hours: data.visitor_retention_hours || data.visitorRetentionHours,
    event_retention_days: data.event_retention_days || data.eventRetentionDays,
  }));


export const createDomainSchema = z
  .object({
    domain: z
      .string({ required_error: 'Domain is required' })
      .trim()
      .min(1, 'Domain cannot be empty')
      .max(253, 'Domain cannot exceed 253 characters')
      .transform((val, ctx) => {
        try {
          return normalizeDomain(val);
        } catch (err: any) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err.message || 'Invalid domain',
          });
          return z.NEVER;
        }
      }),
  })
  .strict();

export const createApiKeySchema = z
  .object({
    name: z
      .string({ required_error: 'Key name is required' })
      .trim()
      .min(1, 'Key name cannot be empty')
      .max(100, 'Key name cannot exceed 100 characters'),
  })
  .strict();

export const projectIdParamSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, 'Project ID is required')
      .max(100, 'Project ID is too long'),
  })
  .strict();

export const domainParamsSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, 'Project ID is required')
      .max(100, 'Project ID is too long'),
    domainId: z
      .string()
      .trim()
      .min(1, 'Domain ID is required')
      .max(100, 'Domain ID is too long'),
  })
  .strict();

export const keyParamsSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, 'Project ID is required')
      .max(100, 'Project ID is too long'),
    keyId: z
      .string()
      .trim()
      .min(1, 'Key ID is required')
      .max(100, 'Key ID is too long'),
  })
  .strict();

export const eventPayloadSchema = z
  .object({
    eventId: z
      .string({ required_error: 'eventId is required' })
      .trim()
      .min(1, 'eventId cannot be empty')
      .max(64, 'eventId exceeds maximum length'),
    type: z
      .string({ required_error: 'type is required' })
      .trim()
      .min(1, 'type cannot be empty')
      .max(64, 'type exceeds maximum length')
      .regex(/^[a-zA-Z0-9_\s.:/-]+$/, 'Invalid event type format'),
    eventName: z
      .string()
      .trim()
      .min(1, 'eventName cannot be empty')
      .max(128, 'eventName exceeds maximum length')
      .optional(),
    properties: z
      .record(z.string(), z.any())
      .optional()
      .default({})
      .refine(
        (props) => {
          if (!props || typeof props !== 'object' || Array.isArray(props)) return true;
          return Object.keys(props).length <= 50;
        },
        { message: 'Event properties count exceeds maximum limit (50)' }
      )
      .refine(
        (props) => {
          if (!props) return true;
          try {
            return JSON.stringify(props).length <= 16384;
          } catch {
            return false;
          }
        },
        { message: 'Event properties payload exceeds maximum limit (16 KB)' }
      ),
    timestamp: z
      .union([
        z.number().int('timestamp must be an integer millisecond timestamp'),
        z.string().transform((str, ctx) => {
          const parsed = new Date(str).getTime();
          if (isNaN(parsed)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid timestamp date format' });
            return z.NEVER;
          }
          return parsed;
        }),
      ], { required_error: 'timestamp is required' })
      .refine(
        (ts) => {
          const now = Date.now();
          const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
          const tenMinutesFuture = now + 10 * 60 * 1000;
          return ts >= thirtyDaysAgo && ts <= tenMinutesFuture;
        },
        {
          message: 'Timestamp is invalid or out of acceptable range (-30 days to +10 mins)',
        }
      ),
    path: z
      .string({ required_error: 'path is required' })
      .trim()
      .min(1, 'path cannot be empty')
      .max(2048, 'path exceeds maximum allowed length'),
    hostname: z
      .string({ required_error: 'hostname is required' })
      .trim()
      .min(1, 'hostname cannot be empty')
      .max(253, 'hostname exceeds maximum allowed length'),
    referrer: z
      .string()
      .trim()
      .max(2048, 'referrer exceeds maximum allowed length')
      .default(''),
    visitorId: z
      .string()
      .trim()
      .min(1)
      .max(128, 'visitorId exceeds maximum allowed length')
      .optional(),
    sessionId: z
      .string()
      .trim()
      .min(1)
      .max(64, 'sessionId exceeds maximum allowed length')
      .optional(),
    utmSource: z.string().trim().max(255).optional(),
    utmMedium: z.string().trim().max(255).optional(),
    utmCampaign: z.string().trim().max(255).optional(),
    utmTerm: z.string().trim().max(255).optional(),
    utmContent: z.string().trim().max(255).optional(),
    screenWidth: z.number().int().positive().max(10000).optional(),
    screenHeight: z.number().int().positive().max(10000).optional(),
    viewportWidth: z.number().int().positive().max(10000).optional(),
    viewportHeight: z.number().int().positive().max(10000).optional(),
    devicePixelRatio: z.number().positive().max(10).optional(),
    language: z.string().trim().max(32).optional(),
    timezone: z.string().trim().max(64).optional(),
  })
  .strict()
  .transform((data) => {
    const rawPath = data.path;
    const utmFromPath = extractUtmParameters(rawPath);
    const withoutQuery = rawPath.split('?')[0] ?? '';
    const clean = (withoutQuery.split('#')[0] ?? '').trim();
    const cleanPath = clean.startsWith('/') ? clean : `/${clean}`;
    const sanitized = sanitizeEventProperties(data.properties || {}).properties;
    const resolvedEventName = (data.eventName || data.type).trim().slice(0, 128);

    return {
      ...data,
      path: cleanPath,
      eventName: resolvedEventName,
      properties: sanitized,
      utmSource: data.utmSource || utmFromPath.utm_source,
      utmMedium: data.utmMedium || utmFromPath.utm_medium,
      utmCampaign: data.utmCampaign || utmFromPath.utm_campaign,
      utmTerm: data.utmTerm || utmFromPath.utm_term,
      utmContent: data.utmContent || utmFromPath.utm_content,
    };
  });

export const collectRequestSchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64, 'siteId exceeds maximum length'),
    events: z
      .array(eventPayloadSchema, { required_error: 'events array is required' })
      .min(1, 'events batch must contain at least 1 event')
      .max(50, 'events batch limit exceeded (maximum 50 events per request)'),
  })
  .strict();

// --- Phase 5 Filters & Queries Schemas ---

export const filterFieldSchema = z.enum([
  'path',
  'route',
  'country',
  'device',
  'os',
  'browser',
  'referrer',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
]);

export const filterOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'starts_with',
  'ends_with',
]);

export const filterClauseSchema = z.object({
  field: filterFieldSchema,
  operator: filterOperatorSchema,
  value: z.string().default(''),
});

export const filtersTransform = z
  .union([z.string(), z.array(z.any())])
  .optional()
  .transform((val, ctx) => {
    if (!val) return [];
    if (Array.isArray(val)) {
      const parsed = z.array(filterClauseSchema).safeParse(val);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid filter clause structure: ' + parsed.error.issues.map((i) => i.message).join('; '),
        });
        return z.NEVER;
      }
      return parsed.data;
    }
    try {
      const parsedJson = JSON.parse(val);
      if (!Array.isArray(parsedJson)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Filters parameter must be a JSON array',
        });
        return z.NEVER;
      }
      const parsed = z.array(filterClauseSchema).safeParse(parsedJson);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid filter clause structure: ' + parsed.error.issues.map((i) => i.message).join('; '),
        });
        return z.NEVER;
      }
      return parsed.data;
    } catch (err: any) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid JSON in filters parameter: ' + err.message,
      });
      return z.NEVER;
    }
  });

export const comparisonSchema = z
  .enum(['none', 'previous_period', 'previous_year'])
  .default('none');

export const analyticsQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    compare: comparisonSchema.optional(),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

export const drilldownQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    source: z
      .string({ required_error: 'source query parameter is required' })
      .trim()
      .min(1, 'source cannot be empty')
      .max(64),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

export const liveAnalyticsQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    windowMinutes: z.coerce.number().int().min(1).max(60).default(5),
  })
  .strict();

export const timeseriesQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    metric: z.enum(['visitors', 'sessions', 'page_views']).default('visitors'),
    resolution: z.enum(['auto', 'hourly', 'daily', 'weekly', 'monthly']).default('auto'),
    compare: comparisonSchema.optional(),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

export const pagesQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    sortBy: z.enum(['visitors', 'page_views', 'sessions']).default('visitors'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

export const breakdownQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    dimension: z.enum(['path', 'country', 'device', 'os', 'browser', 'source', 'referrer', 'utm']),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    sortBy: z.enum(['visitors', 'page_views', 'sessions']).default('visitors'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

// --- Phase 6 Custom Events & Errors Query Schemas ---

export const eventsQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    search: z.string().trim().optional(),
    sortBy: z.enum(['count', 'visitors', 'sessions', 'name']).default('count'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

export const eventDetailQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    eventName: z
      .string({ required_error: 'eventName query parameter is required' })
      .trim()
      .min(1, 'eventName cannot be empty')
      .max(128),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

export const eventPropertiesQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    eventName: z
      .string({ required_error: 'eventName query parameter is required' })
      .trim()
      .min(1, 'eventName cannot be empty')
      .max(128),
    propertyKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional(),
    property: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict()
  .transform((data) => ({
    ...data,
    propertyKey: data.propertyKey || data.property || '',
  }))
  .refine((data) => !!data.propertyKey, {
    message: 'propertyKey or property query parameter is required',
    path: ['propertyKey'],
  });

export const errorsQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    search: z.string().trim().optional(),
    sortBy: z.enum(['occurrences', 'visitors', 'last_seen', 'first_seen']).default('occurrences'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
  })
  .strict();

export const errorDetailQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    errorGroup: z
      .string({ required_error: 'errorGroup query parameter is required' })
      .trim()
      .min(1, 'errorGroup cannot be empty')
      .max(255),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
  })
  .strict();

// --- Phase 7 Performance & Speed Insights Schemas ---

export const performanceMetricPayloadSchema = z
  .object({
    path: z.string().trim().min(1).max(2048).default('/'),
    timestamp: z.number().int().optional().default(() => Date.now()),
    visitorId: z.string().trim().max(128).optional(),
    sessionId: z.string().trim().max(64).optional(),
    device: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).default('desktop').optional(),
    // Core Web Vitals
    lcp: z.number().min(0).max(120000).nullish(),
    inp: z.number().min(0).max(60000).nullish(),
    cls: z.number().min(0).max(10).nullish(),
    fcp: z.number().min(0).max(120000).nullish(),
    ttfb: z.number().min(0).max(60000).nullish(),
    // Navigation Timing (ms)
    dns: z.number().min(0).max(60000).nullish(),
    connection: z.number().min(0).max(60000).nullish(),
    request: z.number().min(0).max(60000).nullish(),
    response: z.number().min(0).max(60000).nullish(),
    domLoading: z.number().min(0).max(120000).nullish(),
    pageLoad: z.number().min(0).max(120000).nullish(),
    sampleRate: z.number().min(0).max(1).default(1.0).optional(),
  })
  .strict()
  .transform((data) => {
    const rawPath = data.path;
    const withoutQuery = rawPath.split('?')[0] ?? '';
    const clean = (withoutQuery.split('#')[0] ?? '').trim();
    const cleanPath = clean.startsWith('/') ? clean : `/${clean}`;
    return {
      ...data,
      path: cleanPath,
    };
  });

export const performanceIngestRequestSchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    // Supports either single metric object or an array of metrics
    metrics: z.union([
      performanceMetricPayloadSchema,
      z.array(performanceMetricPayloadSchema).min(1).max(50),
    ]),
  })
  .strict()
  .transform((data) => ({
    siteId: data.siteId,
    metrics: Array.isArray(data.metrics) ? data.metrics : [data.metrics],
  }));

export const performanceQuerySchema = z
  .object({
    siteId: z
      .string({ required_error: 'siteId query parameter is required' })
      .trim()
      .min(1, 'siteId cannot be empty')
      .max(64),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    path: z.string().trim().optional(),
    device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    country: z.string().trim().max(8).optional(),
    filters: filtersTransform,
    includeBots: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(false)
      .optional(),
    comparePeriod: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .default(true)
      .optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateDomainInput = z.infer<typeof createDomainSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type EventPayloadInput = z.infer<typeof eventPayloadSchema>;
export type CollectRequestInput = z.infer<typeof collectRequestSchema>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
export type DrilldownQueryInput = z.infer<typeof drilldownQuerySchema>;
export type LiveAnalyticsQueryInput = z.infer<typeof liveAnalyticsQuerySchema>;
export type TimeseriesQueryInput = z.infer<typeof timeseriesQuerySchema>;
export type PagesQueryInput = z.infer<typeof pagesQuerySchema>;
export type BreakdownQueryInput = z.infer<typeof breakdownQuerySchema>;
export type EventsQueryInput = z.infer<typeof eventsQuerySchema>;
export type EventDetailQueryInput = z.infer<typeof eventDetailQuerySchema>;
export type EventPropertiesQueryInput = z.infer<typeof eventPropertiesQuerySchema>;
export type ErrorsQueryInput = z.infer<typeof errorsQuerySchema>;
export type ErrorDetailQueryInput = z.infer<typeof errorDetailQuerySchema>;
export type PerformanceMetricPayloadInput = z.infer<typeof performanceMetricPayloadSchema>;
export type PerformanceIngestRequestInput = z.infer<typeof performanceIngestRequestSchema>;
export type PerformanceQueryInput = z.infer<typeof performanceQuerySchema>;

export const exportQuerySchema = z
  .object({
    siteId: z.string().trim().min(1).max(64).optional(),
    format: z.enum(['json', 'csv']).default('json'),
    type: z.enum(['events', 'sessions', 'page_views', 'all']).default('all'),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    limit: z.coerce.number().int().positive().max(50000).default(10000),
  })
  .strict();

export const deleteRangeSchema = z
  .object({
    from: z.string({ required_error: '"from" timestamp is required' }).trim().min(1),
    to: z.string({ required_error: '"to" timestamp is required' }).trim().min(1),
  })
  .strict()
  .refine(
    (data) => {
      const d1 = new Date(data.from);
      const d2 = new Date(data.to);
      return !isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d1 <= d2;
    },
    {
      message: 'Valid "from" and "to" timestamps are required, and "from" must be <= "to"',
    }
  );

export const deleteVisitorSchema = z
  .object({
    visitorId: z.string().trim().min(1).max(128).optional(),
    anonymousId: z.string().trim().min(1).max(128).optional(),
    olderThanHours: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .refine((data) => data.visitorId !== undefined || data.anonymousId !== undefined || data.olderThanHours !== undefined, {
    message: 'At least one identifier (visitorId, anonymousId, or olderThanHours) must be specified',
  });

export type ExportQueryInput = z.infer<typeof exportQuerySchema>;
export type DeleteRangeInput = z.infer<typeof deleteRangeSchema>;
export type DeleteVisitorInput = z.infer<typeof deleteVisitorSchema>;

