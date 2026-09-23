import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Activity,
  Clock,
  Eye,
  Percent,
  Download,
  Link2,
  Compass,
  Target,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
} from 'lucide-react';
import {
  Project,
  api,
  OverviewAnalyticsResponse,
  TimeseriesResponse,
  BreakdownItem,
  FilterClause,
  ComparisonType,
} from '../lib/api.js';
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
import { CardSkeleton, TableSkeleton } from '../components/Skeleton.js';
import { WidgetError } from '../components/WidgetError.js';
import { EmptyAnalytics } from '../components/EmptyAnalytics.js';

interface TrafficViewProps {
  project: Project | null;
}

export const TrafficView: React.FC<TrafficViewProps> = ({ project }) => {
  const initialUrlState = useRef(parseDashboardUrlState());

  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);
  const [comparison, setComparison] = useState<ComparisonType>(initialUrlState.current.compare);
  const [filters, setFilters] = useState<FilterClause[]>(initialUrlState.current.filters);

  const [chartMetric, setChartMetric] = useState<'visitors' | 'sessions' | 'views'>('sessions');
  const [chartResolution, setChartResolution] = useState<'auto' | 'hourly' | 'daily' | 'weekly' | 'monthly'>('auto');

  // Acquisition Sub-tab: 'sources' | 'referrers' | 'utm'
  const [acqTab, setAcqTab] = useState<'sources' | 'referrers' | 'utm'>('sources');

  // Data States
  const [overviewData, setOverviewData] = useState<OverviewAnalyticsResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [timeseriesData, setTimeseriesData] = useState<TimeseriesResponse | null>(null);
  const [timeseriesLoading, setTimeseriesLoading] = useState(true);
  const [timeseriesError, setTimeseriesError] = useState<string | null>(null);

  const [sourcesData, setSourcesData] = useState<BreakdownItem[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  const [referrersData, setReferrersData] = useState<BreakdownItem[]>([]);
  const [referrersLoading, setReferrersLoading] = useState(true);
  const [referrersError, setReferrersError] = useState<string | null>(null);

  const [utmData, setUtmData] = useState<BreakdownItem[]>([]);
  const [utmLoading, setUtmLoading] = useState(true);
  const [utmError, setUtmError] = useState<string | null>(null);

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
      setOverviewError(err.message || 'Unable to load traffic overview.');
    } finally {
      setOverviewLoading(false);
    }
  }, [project?.site_id, getDates, comparison, filters]);

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
      setTimeseriesError(err.message || 'Unable to load traffic trend.');
    } finally {
      setTimeseriesLoading(false);
    }
  }, [project?.site_id, getDates, chartMetric, chartResolution, comparison, filters]);

  // Fetch Sources Breakdown
  const fetchSources = useCallback(async () => {
    if (!project?.site_id) return;
    setSourcesLoading(true);
    setSourcesError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: 'source',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setSourcesData(res.items);
    } catch (err: any) {
      setSourcesError(err.message || 'Failed to load traffic sources.');
    } finally {
      setSourcesLoading(false);
    }
  }, [project?.site_id, getDates, filters]);

  // Fetch Referrers Breakdown
  const fetchReferrers = useCallback(async () => {
    if (!project?.site_id) return;
    setReferrersLoading(true);
    setReferrersError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: 'referrer',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setReferrersData(res.items);
    } catch (err: any) {
      setReferrersError(err.message || 'Failed to load referrers.');
    } finally {
      setReferrersLoading(false);
    }
  }, [project?.site_id, getDates, filters]);

  // Fetch UTM Campaigns
  const fetchUtm = useCallback(async () => {
    if (!project?.site_id) return;
    setUtmLoading(true);
    setUtmError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: 'utm',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setUtmData(res.items);
    } catch (err: any) {
      setUtmError(err.message || 'Failed to load UTM campaigns.');
    } finally {
      setUtmLoading(false);
    }
  }, [project?.site_id, getDates, filters]);

  // Initial and refresh trigger
  useEffect(() => {
    fetchOverview();
    fetchTimeseries();
    fetchSources();
    fetchReferrers();
    fetchUtm();
  }, [fetchOverview, fetchTimeseries, fetchSources, fetchReferrers, fetchUtm]);

  // Handle CSV Export
  const handleExportCsv = async () => {
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
      link.setAttribute('download', `traffic-sessions-${project.site_id}-${from}-${to}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleAddFilter = (clause: FilterClause) => {
    const exists = filters.some((f) => f.field === clause.field && f.value === clause.value);
    if (!exists) {
      setFilters((prev) => [...prev, clause]);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds && seconds !== 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '—';
    return num.toLocaleString();
  };

  const activeBreakdownItems =
    acqTab === 'sources' ? sourcesData : acqTab === 'referrers' ? referrersData : utmData;
  const activeBreakdownLoading =
    acqTab === 'sources' ? sourcesLoading : acqTab === 'referrers' ? referrersLoading : utmLoading;
  const activeBreakdownError =
    acqTab === 'sources' ? sourcesError : acqTab === 'referrers' ? referrersError : utmError;

  const maxAcqViews = Math.max(...activeBreakdownItems.map((i) => i.pageViews || 0), 1);
  const totalAcqViews = activeBreakdownItems.reduce((acc, curr) => acc + (curr.pageViews || 0), 0);

  if (!project) {
    return (
      <EmptyAnalytics
        title="Traffic & Acquisition Analytics"
        description="Select or create a project to inspect acquisition channels, referrers, and UTM campaigns."
        project={null}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* View Header with Date Selector & Actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Traffic & Acquisition</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
              Deep traffic volume, session duration, acquisition channels, referrers, and campaign performance.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              id="export-traffic-csv-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportCsv}
              disabled={exporting || !project}
              title="Export filtered sessions as CSV"
            >
              <Download size={14} />
              <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>

            <DateRangeSelector
              preset={dateRangePreset}
              customFrom={customFrom}
              customTo={customTo}
              comparison={comparison}
              onPresetChange={(p) => {
                setDateRangePreset(p);
                setCustomFrom(undefined);
                setCustomTo(undefined);
              }}
              onCustomDateChange={(f, t) => {
                setDateRangePreset('custom');
                setCustomFrom(f);
                setCustomTo(t);
              }}
              onComparisonChange={setComparison}
            />
          </div>
        </div>

        {/* Global Filter Bar */}
        <FilterBar filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* KPI Metrics Grid */}
      {overviewLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : overviewError ? (
        <WidgetError message={overviewError} onRetry={fetchOverview} height="120px" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <MetricCard
            title="Estimated Unique Visitors"
            value={formatNumber(overviewData?.metrics.estimatedUniqueVisitors)}
            changePercent={overviewData?.changes?.estimatedUniqueVisitorsChange}
            comparisonValue={formatNumber(overviewData?.comparison?.estimatedUniqueVisitors)}
            tooltip="Estimated unique visitors identified using privacy-conscious daily rotation hash."
            icon={<Users size={16} />}
          />
          <MetricCard
            title="Total Sessions"
            value={formatNumber(overviewData?.metrics.sessions)}
            changePercent={overviewData?.changes?.sessionsChange}
            comparisonValue={formatNumber(overviewData?.comparison?.sessions)}
            tooltip="Continuous periods of visitor activity with 30-minute inactivity timeout."
            icon={<Activity size={16} />}
          />
          <MetricCard
            title="Total Page Views"
            value={formatNumber(overviewData?.metrics.pageViews)}
            changePercent={overviewData?.changes?.pageViewsChange}
            comparisonValue={formatNumber(overviewData?.comparison?.pageViews)}
            tooltip="Total non-bot page view events recorded across all paths."
            icon={<Eye size={16} />}
          />
          <MetricCard
            title="Bounce Rate"
            value={overviewData?.metrics.bounceRate !== undefined ? `${overviewData.metrics.bounceRate.toFixed(1)}%` : '—'}
            changePercent={overviewData?.changes?.bounceRateChange}
            comparisonValue={overviewData?.comparison?.bounceRate !== undefined ? `${overviewData.comparison.bounceRate.toFixed(1)}%` : undefined}
            tooltip="Percentage of sessions where the visitor viewed only a single page."
            icon={<Percent size={16} />}
          />
          <MetricCard
            title="Avg Session Duration"
            value={formatDuration(overviewData?.metrics.averageSessionDuration)}
            changePercent={overviewData?.changes?.averageSessionDurationChange}
            tooltip="Average duration between session start and last observed activity."
            icon={<Clock size={16} />}
          />
        </div>
      )}

      {/* Primary Traffic Trends Chart */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Traffic Trend Over Time</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Server-aggregated timeseries merged with real-time live events.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm ${chartMetric === 'sessions' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setChartMetric('sessions')}
              >
                Sessions
              </button>
              <button
                type="button"
                className={`btn btn-sm ${chartMetric === 'visitors' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setChartMetric('visitors')}
              >
                Visitors
              </button>
              <button
                type="button"
                className={`btn btn-sm ${chartMetric === 'views' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setChartMetric('views')}
              >
                Page Views
              </button>
            </div>

            <select
              className="select"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              value={chartResolution}
              onChange={(e) => setChartResolution(e.target.value as any)}
            >
              <option value="auto">Auto Granularity</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          <TrafficChart
            data={timeseriesData}
            loading={timeseriesLoading}
            error={timeseriesError}
            metric={chartMetric}
            onRetry={fetchTimeseries}
            comparison={comparison}
          />
        </div>
      </div>

      {/* Acquisition Breakdown Card */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Compass size={18} style={{ color: 'var(--color-accent)' }} />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Acquisition Channels & Referrers</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Understand where your visitors originated from and track campaign attribution.
              </span>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="btn-group">
            <button
              type="button"
              className={`btn btn-sm ${acqTab === 'sources' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setAcqTab('sources')}
            >
              <Compass size={14} />
              <span>Channels</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${acqTab === 'referrers' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setAcqTab('referrers')}
            >
              <Link2 size={14} />
              <span>Referrers</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${acqTab === 'utm' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setAcqTab('utm')}
            >
              <Target size={14} />
              <span>UTM Campaigns</span>
            </button>
          </div>
        </div>

        {/* Breakdown Table */}
        {activeBreakdownLoading ? (
          <TableSkeleton rows={6} />
        ) : activeBreakdownError ? (
          <WidgetError message={activeBreakdownError} height="200px" onRetry={fetchSources} />
        ) : activeBreakdownItems.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No {acqTab} recorded for the selected date range and filters.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>
                    {acqTab === 'sources' ? 'Channel Source' : acqTab === 'referrers' ? 'Referrer Hostname / URL' : 'Campaign Name'}
                  </th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Visitors</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Views</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Sessions</th>
                  <th style={{ width: '5%', textAlign: 'center' }}>Filter</th>
                </tr>
              </thead>
              <tbody>
                {activeBreakdownItems.map((item, idx) => {
                  const displayName = item.label || item.key || '(direct / none)';
                  const views = item.pageViews || 0;
                  const barPercent = Math.min(100, Math.round((views / maxAcqViews) * 100));

                  return (
                    <tr key={idx} style={{ position: 'relative' }}>
                      <td style={{ position: 'relative' }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: '10%',
                            bottom: '10%',
                            width: `${barPercent}%`,
                            backgroundColor: 'var(--color-accent-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            opacity: 0.35,
                            pointerEvents: 'none',
                          }}
                        />
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span style={{ fontWeight: 500 }}>{displayName}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {(item.visitors || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {(item.pageViews || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {(item.sessions || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          title={`Filter by ${item.key}`}
                          onClick={() => {
                            const field =
                              acqTab === 'sources'
                                ? 'source'
                                : acqTab === 'referrers'
                                ? 'referrer'
                                : 'utm_campaign';
                            handleAddFilter({
                              field,
                              operator: 'equals',
                              value: item.key,
                            });
                          }}
                        >
                          +
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
