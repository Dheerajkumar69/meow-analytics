import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Activity,
  Clock,
  Eye,
  RefreshCw,
  Layers,
  Percent,
  Download,
  Sparkles,
} from 'lucide-react';
import {
  Project,
  api,
  OverviewAnalyticsResponse,
  LiveAnalyticsResponse,
  TimeseriesResponse,
  PageItem,
  BreakdownItem,
  FilterClause,
  ComparisonType,
} from '../lib/api.js';
import { BreakdownDimension } from '@meow-analytics/shared';
import {
  parseDashboardUrlState,
  updateDashboardUrlState,
  calculatePresetDateRange,
  TimeRangePreset,
} from '../lib/urlState.js';
import { MetricCard } from '../components/MetricCard.js';
import { TrafficChart } from '../components/TrafficChart.js';
import { DateRangeSelector } from '../components/DateRangeSelector.js';
import { FilterBar } from '../components/FilterBar.js';
import { TopPagesTable } from '../components/TopPagesTable.js';
import { AnalyticsExplorer } from '../components/AnalyticsExplorer.js';
import { CardSkeleton } from '../components/Skeleton.js';
import { WidgetError } from '../components/WidgetError.js';
import { EmptyAnalytics } from '../components/EmptyAnalytics.js';

interface OverviewViewProps {
  project: Project | null;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ project }) => {
  // Initialize state from URL params
  const initialUrlState = useRef(parseDashboardUrlState());

  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);
  const [comparison, setComparison] = useState<ComparisonType>(initialUrlState.current.compare);
  const [filters, setFilters] = useState<FilterClause[]>(initialUrlState.current.filters);

  // Traffic chart options
  const [chartMetric, setChartMetric] = useState<'visitors' | 'sessions' | 'views'>(initialUrlState.current.metric);
  const [chartResolution, setChartResolution] = useState<'auto' | 'hourly' | 'daily' | 'weekly' | 'monthly'>('auto');

  // Explorer dimension
  const [explorerDimension, setExplorerDimension] = useState<BreakdownDimension>('source');

  // Data States
  const [overviewData, setOverviewData] = useState<OverviewAnalyticsResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [liveData, setLiveData] = useState<LiveAnalyticsResponse | null>(null);

  const [timeseriesData, setTimeseriesData] = useState<TimeseriesResponse | null>(null);
  const [timeseriesLoading, setTimeseriesLoading] = useState(true);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);

  const [pagesData, setPagesData] = useState<PageItem[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [pagesSortBy, setPagesSortBy] = useState<'visitors' | 'page_views' | 'sessions'>('visitors');
  const [pagesSortOrder, setPagesSortOrder] = useState<'asc' | 'desc'>('desc');

  const [breakdownData, setBreakdownData] = useState<BreakdownItem[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  // Sync state to URL
  useEffect(() => {
    updateDashboardUrlState({
      range: dateRangePreset,
      from: customFrom,
      to: customTo,
      compare: comparison,
      metric: chartMetric,
      filters,
    });
  }, [dateRangePreset, customFrom, customTo, comparison, chartMetric, filters]);

  // Compute actual date strings
  const getDates = useCallback(() => {
    return calculatePresetDateRange(dateRangePreset, customFrom, customTo);
  }, [dateRangePreset, customFrom, customTo]);

  // Fetch Overview Metrics
  const fetchOverview = useCallback(async () => {
    if (!project?.site_id) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getOverviewAnalytics(project.site_id, {
        from,
        to,
        compare: comparison !== 'none' ? comparison : undefined,
        filters: filters.length > 0 ? filters : undefined,
      });
      setOverviewData(res);
    } catch (err: any) {
      setOverviewError(err.message || 'Unable to load overview metrics.');
    } finally {
      setOverviewLoading(false);
    }
  }, [project?.site_id, getDates, comparison, filters]);

  // Fetch Live Visitors
  const fetchLive = useCallback(async () => {
    if (!project?.site_id) return;
    try {
      const res = await api.getLiveAnalytics(project.site_id);
      setLiveData(res);
    } catch {
      // Non-critical, ignore
    }
  }, [project?.site_id]);

  // Fetch Timeseries
  const fetchTimeseries = useCallback(async () => {
    if (!project?.site_id) return;
    setTimeseriesLoading(true);
    setTimeseriesError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getTimeseries(project.site_id, {
        from,
        to,
        metric: chartMetric === 'views' ? 'page_views' : chartMetric,
        resolution: chartResolution,
        compare: comparison !== 'none' ? comparison : undefined,
        filters: filters.length > 0 ? filters : undefined,
      });
      setTimeseriesData(res);
    } catch (err: any) {
      setTimeseriesError(err.message || 'Unable to load traffic chart.');
    } finally {
      setTimeseriesLoading(false);
    }
  }, [project?.site_id, getDates, chartMetric, chartResolution, comparison, filters]);

  // Fetch Pages
  const fetchPages = useCallback(async () => {
    if (!project?.site_id) return;
    setPagesLoading(true);
    setPagesError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getPages(project.site_id, {
        from,
        to,
        sortBy: pagesSortBy,
        sortOrder: pagesSortOrder,
        limit: 20,
        filters: filters.length > 0 ? filters : undefined,
      });
      setPagesData(res.pages || []);
    } catch (err: any) {
      setPagesError(err.message || 'Unable to load top pages.');
    } finally {
      setPagesLoading(false);
    }
  }, [project?.site_id, getDates, pagesSortBy, pagesSortOrder, filters]);

  // Fetch Explorer / Breakdown
  const fetchBreakdown = useCallback(async () => {
    if (!project?.site_id) return;
    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: explorerDimension,
        from,
        to,
        limit: 15,
        filters: filters.length > 0 ? filters : undefined,
      });
      setBreakdownData(res.items || []);
    } catch (err: any) {
      setBreakdownError(err.message || `Unable to load ${explorerDimension} breakdown.`);
    } finally {
      setBreakdownLoading(false);
    }
  }, [project?.site_id, getDates, explorerDimension, filters]);

  // Project isolation & Refetching
  useEffect(() => {
    if (!project?.site_id) return;
    fetchOverview();
    fetchLive();
    fetchTimeseries();
    fetchPages();
    fetchBreakdown();

    // 15s interval for live data
    const liveInterval = setInterval(fetchLive, 15000);
    return () => clearInterval(liveInterval);
  }, [project?.site_id, fetchOverview, fetchLive, fetchTimeseries, fetchPages, fetchBreakdown]);

  // Filter actions
  const handleAddFilter = (newFilter: FilterClause) => {
    const exists = filters.some(
      (f) => f.field === newFilter.field && f.operator === newFilter.operator && f.value === newFilter.value
    );
    if (!exists) {
      setFilters([...filters, newFilter]);
    }
  };

  const handleFilterByPath = (path: string) => {
    handleAddFilter({ field: 'path', operator: 'equals', value: path });
  };

  const handlePagesSortChange = (newSortBy: 'visitors' | 'page_views' | 'sessions') => {
    if (pagesSortBy === newSortBy) {
      setPagesSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setPagesSortBy(newSortBy);
      setPagesSortOrder('desc');
    }
  };

  if (!project) {
    return (
      <EmptyAnalytics
        title="No Project Selected"
        description="Select an existing project from the header dropdown or click 'New Project' to register a site and begin collecting analytics."
        project={null}
      />
    );
  }

  // Format Helpers
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = Math.round(seconds % 60);
    return `${mins}m ${remainingSecs}s`;
  };

  const metrics = overviewData?.metrics;
  const changes = overviewData?.changes;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header Bar: Controls (Date Range, Compare, Refresh, Live Badge) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>Overview Dashboard</span>
            {liveData && (
              <span
                id="live-visitors-badge"
                className="badge badge-accent"
                style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem' }}
                title="Active visitors on site right now"
              >
                <div className="pulse-dot" style={{ width: '6px', height: '6px' }} />
                {liveData.liveVisitors} online
              </span>
            )}
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Real-time analytics for <strong>{project.name}</strong> ({project.site_id})
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <DateRangeSelector
            preset={dateRangePreset}
            customFrom={customFrom}
            customTo={customTo}
            compare={comparison}
            onRangeChange={(p, from, to) => {
              setDateRangePreset(p);
              setCustomFrom(from);
              setCustomTo(to);
            }}
            onCompareChange={setComparison}
          />

          <button
            id="export-overview-csv-btn"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              if (!project) return;
              setExporting(true);
              try {
                const { from, to } = getDates();
                const csv = await api.exportData(project.id, {
                  format: 'csv',
                  type: 'sessions',
                  from,
                  to,
                  filters: filters.length > 0 ? filters : undefined,
                });
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `meow-overview-sessions-${project.site_id}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } catch (err: any) {
                alert(`Export failed: ${err.message || 'Unknown error'}`);
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting || !project}
            title="Export filtered sessions as CSV"
          >
            <Download size={14} />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          <button
            id="refresh-dashboard-btn"
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={() => {
              fetchOverview();
              fetchTimeseries();
              fetchPages();
              fetchBreakdown();
            }}
            title="Refresh all metrics"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Filter Engine Bar (Section 10) */}
      <FilterBar filters={filters} onFiltersChange={setFilters} />

      {/* 8 Overview Metric Cards (Section 2) */}
      {overviewError ? (
        <WidgetError message={overviewError} onRetry={fetchOverview} height="160px" />
      ) : overviewLoading ? (
        <div className="metrics-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="metrics-grid">
          <MetricCard
            title="Unique Visitors"
            value={metrics?.estimatedUniqueVisitors?.toLocaleString() ?? '0'}
            change={changes?.estimatedUniqueVisitorsChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            icon={Users}
          />
          <MetricCard
            title="New Visitors"
            value={metrics?.newVisitors?.toLocaleString() ?? '0'}
            change={changes?.newVisitorsChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            icon={Users}
          />
          <MetricCard
            title="Returning Visitors"
            value={metrics?.returningVisitors?.toLocaleString() ?? '0'}
            change={changes?.returningVisitorsChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            icon={Users}
          />
          <MetricCard
            title="Total Sessions"
            value={metrics?.sessions?.toLocaleString() ?? '0'}
            change={changes?.sessionsChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            icon={Activity}
          />
          <MetricCard
            title="Page Views"
            value={metrics?.pageViews?.toLocaleString() ?? '0'}
            change={changes?.pageViewsChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            icon={Eye}
          />
          <MetricCard
            title="Bounce Rate"
            value={`${metrics?.bounceRate ?? 0}%`}
            change={changes?.bounceRateChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            invertChangeColor={true}
            icon={Percent}
          />
          <MetricCard
            title="Pages / Session"
            value={metrics?.pagesPerSession?.toFixed(2) ?? '0.00'}
            change={changes?.pagesPerSessionChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            icon={Layers}
          />
          <MetricCard
            title="Avg Session Duration"
            value={formatDuration(metrics?.averageSessionDuration ?? 0)}
            change={changes?.averageSessionDurationChange}
            comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
            icon={Clock}
          />
        </div>
      )}

      {/* Interactive Traffic Chart (Section 5 & 16) */}
      <TrafficChart
        data={timeseriesData}
        loading={timeseriesLoading}
        error={timeseriesError}
        onRetry={fetchTimeseries}
        metric={chartMetric}
        onChangeMetric={setChartMetric}
        resolution={chartResolution}
        onChangeResolution={setChartResolution}
        comparisonLabel={comparison !== 'none' ? comparison.replace('_', ' ') : undefined}
      />

      {/* Top Pages Table (Section 6) */}
      <TopPagesTable
        pages={pagesData}
        loading={pagesLoading}
        error={pagesError}
        onRetry={fetchPages}
        sortBy={pagesSortBy}
        sortOrder={pagesSortOrder}
        onSortChange={handlePagesSortChange}
        onFilterPath={handleFilterByPath}
      />

      {/* Analytics Explorer & Group By (Section 11) */}
      <AnalyticsExplorer
        currentDimension={explorerDimension}
        onDimensionChange={setExplorerDimension}
        items={breakdownData}
        loading={breakdownLoading}
        error={breakdownError}
        onRetry={fetchBreakdown}
        onAddFilter={handleAddFilter}
      />

      {/* Intelligent Insights Layer (Phase 5) */}
      {metrics && metrics.sessions > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)', backgroundColor: 'var(--color-surface-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0 }}>Automated Observations & Insights</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              (Derived strictly from current period data)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
            {changes?.sessionsChange !== undefined && comparison !== 'none' && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-surface-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.8125rem' }}>
                <span style={{ fontWeight: 600 }}>Traffic Trend: </span>
                Sessions {changes.sessionsChange >= 0 ? 'increased' : 'decreased'} by <strong>{Math.abs(changes.sessionsChange)}%</strong> compared to the baseline period.
              </div>
            )}
            {metrics.bounceRate !== undefined && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-surface-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.8125rem' }}>
                <span style={{ fontWeight: 600 }}>Engagement: </span>
                Single-page bounce rate is <strong>{metrics.bounceRate.toFixed(1)}%</strong> across {metrics.sessions.toLocaleString()} sessions with avg duration of {formatDuration(metrics.averageSessionDuration)}.
              </div>
            )}
            {metrics.returningVisitorRate !== undefined && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-surface-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.8125rem' }}>
                <span style={{ fontWeight: 600 }}>Retention: </span>
                <strong>{metrics.returningVisitorRate.toFixed(1)}%</strong> of visitors this period are returning users ({metrics.returningVisitors.toLocaleString()} returning vs {metrics.newVisitors.toLocaleString()} new).
              </div>
            )}
            {pagesData.length > 0 && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-surface-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.8125rem' }}>
                <span style={{ fontWeight: 600 }}>Top Content: </span>
                Route <code>{pagesData[0]?.path}</code> leads with {pagesData[0]?.pageViews?.toLocaleString()} views ({Math.round(((pagesData[0]?.pageViews || 0) / Math.max(metrics.pageViews || 1, 1)) * 100)}% of total volume).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
