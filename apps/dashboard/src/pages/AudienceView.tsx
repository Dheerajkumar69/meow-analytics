import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe,
  Laptop,
  Monitor,
  Layers,
  Users,
  UserCheck,
  UserPlus,
  Download,
  Percent,
} from 'lucide-react';
import {
  Project,
  api,
  OverviewAnalyticsResponse,
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
import { DateRangeSelector } from '../components/DateRangeSelector.js';
import { FilterBar } from '../components/FilterBar.js';
import { CardSkeleton, TableSkeleton } from '../components/Skeleton.js';
import { WidgetError } from '../components/WidgetError.js';
import { EmptyAnalytics } from '../components/EmptyAnalytics.js';

interface AudienceViewProps {
  project: Project | null;
}

export const AudienceView: React.FC<AudienceViewProps> = ({ project }) => {
  const initialUrlState = useRef(parseDashboardUrlState());

  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);
  const [comparison, setComparison] = useState<ComparisonType>(initialUrlState.current.compare);
  const [filters, setFilters] = useState<FilterClause[]>(initialUrlState.current.filters);

  // Active Audience Tab
  const [activeTab, setActiveTab] = useState<'country' | 'device' | 'browser' | 'os'>('country');

  // Data States
  const [overviewData, setOverviewData] = useState<OverviewAnalyticsResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [countryData, setCountryData] = useState<BreakdownItem[]>([]);
  const [countryLoading, setCountryLoading] = useState(true);
  const [countryError, setCountryError] = useState<string | null>(null);

  const [deviceData, setDeviceData] = useState<BreakdownItem[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [browserData, setBrowserData] = useState<BreakdownItem[]>([]);
  const [browserLoading, setBrowserLoading] = useState(true);
  const [browserError, setBrowserError] = useState<string | null>(null);

  const [osData, setOsData] = useState<BreakdownItem[]>([]);
  const [osLoading, setOsLoading] = useState(true);
  const [osError, setOsError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  // Sync state to URL
  useEffect(() => {
    updateDashboardUrlState({
      range: dateRangePreset,
      from: customFrom,
      to: customTo,
      compare: comparison,
      filters,
    });
  }, [dateRangePreset, customFrom, customTo, comparison, filters]);

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
      setOverviewError(err.message || 'Unable to load audience overview.');
    } finally {
      setOverviewLoading(false);
    }
  }, [project?.site_id, getDates, comparison, filters]);

  // Fetch Country Breakdown
  const fetchCountry = useCallback(async () => {
    if (!project?.site_id) return;
    setCountryLoading(true);
    setCountryError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: 'country',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setCountryData(res.items);
    } catch (err: any) {
      setCountryError(err.message || 'Failed to load country breakdown.');
    } finally {
      setCountryLoading(false);
    }
  }, [project?.site_id, getDates, filters]);

  // Fetch Device Breakdown
  const fetchDevice = useCallback(async () => {
    if (!project?.site_id) return;
    setDeviceLoading(true);
    setDeviceError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: 'device',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setDeviceData(res.items);
    } catch (err: any) {
      setDeviceError(err.message || 'Failed to load device breakdown.');
    } finally {
      setDeviceLoading(false);
    }
  }, [project?.site_id, getDates, filters]);

  // Fetch Browser Breakdown
  const fetchBrowser = useCallback(async () => {
    if (!project?.site_id) return;
    setBrowserLoading(true);
    setBrowserError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: 'browser',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setBrowserData(res.items);
    } catch (err: any) {
      setBrowserError(err.message || 'Failed to load browser breakdown.');
    } finally {
      setBrowserLoading(false);
    }
  }, [project?.site_id, getDates, filters]);

  // Fetch OS Breakdown
  const fetchOs = useCallback(async () => {
    if (!project?.site_id) return;
    setOsLoading(true);
    setOsError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension: 'os',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setOsData(res.items);
    } catch (err: any) {
      setOsError(err.message || 'Failed to load OS breakdown.');
    } finally {
      setOsLoading(false);
    }
  }, [project?.site_id, getDates, filters]);

  useEffect(() => {
    fetchOverview();
    fetchCountry();
    fetchDevice();
    fetchBrowser();
    fetchOs();
  }, [fetchOverview, fetchCountry, fetchDevice, fetchBrowser, fetchOs]);

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
      link.setAttribute('download', `audience-${activeTab}-${project.site_id}-${from}-${to}.csv`);
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

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '—';
    return num.toLocaleString();
  };

  const currentItems =
    activeTab === 'country'
      ? countryData
      : activeTab === 'device'
      ? deviceData
      : activeTab === 'browser'
      ? browserData
      : osData;

  const currentLoading =
    activeTab === 'country'
      ? countryLoading
      : activeTab === 'device'
      ? deviceLoading
      : activeTab === 'browser'
      ? browserLoading
      : osLoading;

  const currentError =
    activeTab === 'country'
      ? countryError
      : activeTab === 'device'
      ? deviceError
      : activeTab === 'browser'
      ? browserError
      : osError;

  const maxViews = Math.max(...currentItems.map((i) => i.pageViews || 0), 1);
  const totalViews = currentItems.reduce((acc, curr) => acc + (curr.pageViews || 0), 0);

  if (!project) {
    return (
      <EmptyAnalytics
        title="Audience & Geography Analytics"
        description="Select or create a project to inspect visitor countries, device breakdowns, browsers, and operating systems."
        project={null}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Audience & Demographics</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
              Privacy-conscious breakdown of visitor geography, devices, browsers, and operating systems.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              id="export-audience-csv-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportCsv}
              disabled={exporting || !project}
              title="Export audience data as CSV"
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

        <FilterBar filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* KPI Cards */}
      {overviewLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
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
            title="New Visitors"
            value={formatNumber(overviewData?.metrics.newVisitors)}
            changePercent={overviewData?.changes?.newVisitorsChange}
            tooltip="Visitors observed for the very first time in this period."
            icon={<UserPlus size={16} />}
          />
          <MetricCard
            title="Returning Visitors"
            value={formatNumber(overviewData?.metrics.returningVisitors)}
            changePercent={overviewData?.changes?.returningVisitorsChange}
            tooltip="Visitors with past session history returning to the site."
            icon={<UserCheck size={16} />}
          />
          <MetricCard
            title="Returning Visitor Rate"
            value={overviewData?.metrics.returningVisitorRate !== undefined ? `${overviewData.metrics.returningVisitorRate.toFixed(1)}%` : '—'}
            changePercent={overviewData?.changes?.returningVisitorRateChange}
            tooltip="Percentage of total visitors who have visited in previous sessions."
            icon={<Percent size={16} />}
          />
        </div>
      )}

      {/* Audience Breakdown Navigation Tabs & Table */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div className="btn-group">
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'country' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('country')}
            >
              <Globe size={14} />
              <span>Countries ({countryData.length})</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'device' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('device')}
            >
              <Laptop size={14} />
              <span>Devices ({deviceData.length})</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'browser' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('browser')}
            >
              <Layers size={14} />
              <span>Browsers ({browserData.length})</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'os' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('os')}
            >
              <Monitor size={14} />
              <span>Operating Systems ({osData.length})</span>
            </button>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Total {currentItems.length} categories
          </span>
        </div>

        {currentLoading ? (
          <TableSkeleton rows={6} />
        ) : currentError ? (
          <WidgetError message={currentError} height="200px" onRetry={fetchCountry} />
        ) : currentItems.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No audience data recorded for {activeTab} in this period.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>
                    {activeTab === 'country'
                      ? 'Country'
                      : activeTab === 'device'
                      ? 'Device Type'
                      : activeTab === 'browser'
                      ? 'Browser Engine'
                      : 'Operating System'}
                  </th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Visitors</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Views</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Sessions</th>
                  <th style={{ width: '5%', textAlign: 'center' }}>Filter</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map((item, idx) => {
                  const displayName = item.label || item.key || 'Unknown';
                  const views = item.pageViews || 0;
                  const barPercent = Math.min(100, Math.round((views / maxViews) * 100));

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
                            handleAddFilter({
                              field: activeTab as any,
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
