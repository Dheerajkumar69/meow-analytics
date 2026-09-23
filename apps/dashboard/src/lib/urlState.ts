import { FilterClause, ComparisonType } from './api.js';

export type TimeRangePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '14d'
  | '30d'
  | '90d'
  | '6m'
  | '12m'
  | 'custom';

export interface DashboardUrlState {
  range: TimeRangePreset;
  from?: string;
  to?: string;
  compare: ComparisonType;
  metric: 'visitors' | 'sessions' | 'views';
  filters: FilterClause[];
}

/**
 * Calculates start and end Date for a given preset
 */
export function calculatePresetDateRange(
  preset: TimeRangePreset,
  customFrom?: string,
  customTo?: string
): { from: string; to: string } {
  const now = new Date();
  const to = customTo || now.toISOString();

  switch (preset) {
    case 'today': {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { from: startOfDay.toISOString(), to: now.toISOString() };
    }
    case 'yesterday': {
      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { from: startOfYesterday.toISOString(), to: endOfYesterday.toISOString() };
    }
    case '7d': {
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to };
    }
    case '14d': {
      const from = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to };
    }
    case '30d': {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to };
    }
    case '90d': {
      const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to };
    }
    case '6m': {
      const from = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to };
    }
    case '12m': {
      const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to };
    }
    case 'custom': {
      const from = customFrom || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return { from, to };
    }
    default: {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to };
    }
  }
}

/**
 * Reads dashboard state from URL search params
 */
export function parseDashboardUrlState(): DashboardUrlState {
  const params = new URLSearchParams(window.location.search);

  // Range
  const rawRange = params.get('range');
  const validRanges: TimeRangePreset[] = [
    'today',
    'yesterday',
    '7d',
    '14d',
    '30d',
    '90d',
    '6m',
    '12m',
    'custom',
  ];
  const range: TimeRangePreset = validRanges.includes(rawRange as TimeRangePreset)
    ? (rawRange as TimeRangePreset)
    : '30d';

  const from = params.get('from') || undefined;
  const to = params.get('to') || undefined;

  // Comparison
  const rawCompare = params.get('compare');
  const compare: ComparisonType =
    rawCompare === 'previous_period' || rawCompare === 'previous_year' ? rawCompare : 'previous_period';

  // Metric
  const rawMetric = params.get('metric');
  const metric = rawMetric === 'sessions' || rawMetric === 'views' ? rawMetric : 'visitors';

  // Filters
  const filters: FilterClause[] = [];
  const filtersJson = params.get('filters');
  if (filtersJson) {
    try {
      const parsed = JSON.parse(filtersJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.field && item.operator && item.value !== undefined) {
            filters.push(item);
          }
        }
      }
    } catch {}
  }

  // Also support individual query params: ?country=IN, ?device=mobile, etc.
  const fieldNames: FilterClause['field'][] = [
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
  ];
  for (const f of fieldNames) {
    const val = params.get(f);
    if (val && !filters.some((existing) => existing.field === f)) {
      filters.push({ field: f, operator: 'equals', value: val });
    }
  }

  return {
    range,
    from,
    to,
    compare,
    metric,
    filters,
  };
}

/**
 * Serializes state and updates URL without refreshing
 */
export function updateDashboardUrlState(state: Partial<DashboardUrlState>): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);

  if (state.range !== undefined) {
    if (state.range === '30d') {
      url.searchParams.delete('range');
    } else {
      url.searchParams.set('range', state.range);
    }
  }

  if (state.range === 'custom' && state.from && state.to) {
    url.searchParams.set('from', state.from);
    url.searchParams.set('to', state.to);
  } else if (state.range !== undefined) {
    url.searchParams.delete('from');
    url.searchParams.delete('to');
  }

  if (state.compare !== undefined) {
    if (state.compare === 'previous_period') {
      url.searchParams.delete('compare');
    } else {
      url.searchParams.set('compare', state.compare);
    }
  }

  if (state.metric !== undefined) {
    if (state.metric === 'visitors') {
      url.searchParams.delete('metric');
    } else {
      url.searchParams.set('metric', state.metric);
    }
  }

  if (state.filters !== undefined) {
    if (state.filters.length > 0) {
      url.searchParams.set('filters', JSON.stringify(state.filters));
    } else {
      url.searchParams.delete('filters');
    }
  }

  // Clear legacy field keys if any
  const fieldNames = ['path', 'route', 'country', 'device', 'os', 'browser', 'referrer', 'source', 'utm_source', 'utm_medium', 'utm_campaign'];
  for (const f of fieldNames) {
    url.searchParams.delete(f);
  }

  if (window.history) {
    window.history.replaceState({}, '', url.toString());
  }
}
