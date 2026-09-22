import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Compass,
  ArrowRightCircle,
  LogOut,
  Globe,
  Download,
  Copy,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
} from 'lucide-react';
import {
  Project,
  api,
  PageItem,
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
import { TableSkeleton, CardSkeleton } from '../components/Skeleton.js';
import { WidgetError } from '../components/WidgetError.js';

interface ContentViewProps {
  project: Project | null;
}

export const ContentView: React.FC<ContentViewProps> = ({ project }) => {
  const initialUrlState = useRef(parseDashboardUrlState());

  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);
  const [comparison, setComparison] = useState<ComparisonType>(initialUrlState.current.compare);
  const [filters, setFilters] = useState<FilterClause[]>(initialUrlState.current.filters);

  // Content classification tab: 'top' | 'landing' | 'exit' | 'hostnames'
  const [contentType, setContentType] = useState<'top' | 'landing' | 'exit' | 'hostnames'>('top');

  // Sorting
  const [sortBy, setSortBy] = useState<'visitors' | 'page_views' | 'sessions'>('visitors');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Data States
  const [pages, setPages] = useState<PageItem[]>([]);
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copiedPath, setCopiedPath] = useState<string | null>(null);
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

  const fetchPages = useCallback(async () => {
    if (!project?.site_id) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getPages(project.site_id, {
        from,
        to,
        type: contentType,
        sortBy,
        sortOrder,
        limit: 100,
        filters: filters.length > 0 ? filters : undefined,
      });
      setPages(res.pages);
      setTotalVisitors(res.totalVisitors);
      setTotalViews(res.totalPageViews);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message || 'Unable to load content analytics.');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, getDates, contentType, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const handleExportCsv = async () => {
    if (!project) return;
    setExporting(true);
    try {
      const { from, to } = getDates();
      const csv = await api.exportData(project.id, {
        format: 'csv',
        type: 'page_views',
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `content-${contentType}-${project.site_id}-${from}-${to}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleSortChange = (col: 'visitors' | 'page_views' | 'sessions') => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
  };

  const handleAddFilter = (path: string) => {
    const field = contentType === 'hostnames' ? 'referrer' : 'path';
    const exists = filters.some((f) => f.field === field && f.value === path);
    if (!exists) {
      setFilters((prev) => [...prev, { field: 'path', operator: 'equals', value: path }]);
    }
  };

  const renderSortIcon = (col: 'visitors' | 'page_views' | 'sessions') => {
    if (sortBy !== col) return <ArrowUpDown size={12} style={{ opacity: 0.35 }} />;
    return sortOrder === 'desc' ? (
      <ArrowDown size={12} style={{ color: 'var(--color-accent)' }} />
    ) : (
      <ArrowUp size={12} style={{ color: 'var(--color-accent)' }} />
    );
  };

  const maxViews = Math.max(...pages.map((p) => p.pageViews || 0), 1);

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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Content Analytics</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
              Inspect top paths, entry landing pages, exit pages, and traffic by hostname.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              id="export-content-csv-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportCsv}
              disabled={exporting || !project}
              title="Export content data as CSV"
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <MetricCard
          title="Total Page Views"
          value={totalViews.toLocaleString()}
          tooltip="Total recorded page view hits in this timeframe."
          icon={<FileText size={16} />}
        />
        <MetricCard
          title="Unique Visitors"
          value={totalVisitors.toLocaleString()}
          tooltip="Distinct visitors browsing these paths."
          icon={<Compass size={16} />}
        />
        <MetricCard
          title="Unique Paths Tracked"
          value={totalPages.toLocaleString()}
          tooltip="Distinct URLs or routes recorded."
          icon={<Layers size={16} />}
        />
      </div>

      {/* Content Table Container */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {/* Subtabs for Top Pages, Landing Pages, Exit Pages, Hostnames */}
          <div className="btn-group">
            <button
              type="button"
              className={`btn btn-sm ${contentType === 'top' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setContentType('top')}
            >
              <FileText size={14} />
              <span>Top Pages</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${contentType === 'landing' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setContentType('landing')}
            >
              <ArrowRightCircle size={14} />
              <span>Landing Pages</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${contentType === 'exit' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setContentType('exit')}
            >
              <LogOut size={14} />
              <span>Exit Pages</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${contentType === 'hostnames' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setContentType('hostnames')}
            >
              <Globe size={14} />
              <span>Hostnames</span>
            </button>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Showing top {pages.length} of {totalPages} items
          </span>
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : error ? (
          <WidgetError message={error} height="240px" onRetry={fetchPages} />
        ) : pages.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No content traffic recorded for {contentType} pages matching the active criteria.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>
                    {contentType === 'hostnames' ? 'Hostname Domain' : 'Route / Path'}
                  </th>
                  <th
                    style={{ width: '18%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSortChange('visitors')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      <span>Visitors</span>
                      {renderSortIcon('visitors')}
                    </div>
                  </th>
                  <th
                    style={{ width: '18%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSortChange('page_views')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      <span>Views</span>
                      {renderSortIcon('page_views')}
                    </div>
                  </th>
                  <th
                    style={{ width: '14%', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSortChange('sessions')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      <span>Sessions</span>
                      {renderSortIcon('sessions')}
                    </div>
                  </th>
                  <th style={{ width: '5%', textAlign: 'center' }}>Filter</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((item, idx) => {
                  const percent = Math.min(100, Math.round(((item.pageViews || 0) / maxViews) * 100));

                  return (
                    <tr key={idx} style={{ position: 'relative' }}>
                      <td style={{ position: 'relative' }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: '10%',
                            bottom: '10%',
                            width: `${percent}%`,
                            backgroundColor: 'var(--color-accent-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            opacity: 0.35,
                            pointerEvents: 'none',
                          }}
                        />
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span
                            style={{
                              fontWeight: 500,
                              fontFamily: 'monospace',
                              fontSize: '0.8125rem',
                              color: 'var(--color-text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '420px',
                            }}
                            title={item.path}
                          >
                            {item.path}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            style={{ padding: '2px', opacity: 0.6 }}
                            onClick={() => handleCopy(item.path)}
                            title="Copy path"
                          >
                            {copiedPath === item.path ? <Check size={12} style={{ color: 'var(--color-accent)' }} /> : <Copy size={12} />}
                          </button>
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
                          title={`Filter by path: ${item.path}`}
                          onClick={() => handleAddFilter(item.path)}
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
