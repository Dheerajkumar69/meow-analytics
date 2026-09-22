import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Compass,
  Download,
  Filter,
  BarChart2,
  Table as TableIcon,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  Globe,
  Laptop,
  Monitor,
  Link2,
  Target,
  FileCode2,
} from 'lucide-react';
import {
  Project,
  api,
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
import { DateRangeSelector } from '../components/DateRangeSelector.js';
import { FilterBar } from '../components/FilterBar.js';
import { TableSkeleton } from '../components/Skeleton.js';
import { WidgetError } from '../components/WidgetError.js';

interface ExploreViewProps {
  project: Project | null;
}

const DIMENSIONS: { key: BreakdownDimension; label: string; icon: React.ReactNode }[] = [
  { key: 'path', label: 'Pages & Paths', icon: <FileCode2 size={14} /> },
  { key: 'source', label: 'Acquisition Channels', icon: <Compass size={14} /> },
  { key: 'referrer', label: 'Referrers', icon: <Link2 size={14} /> },
  { key: 'utm', label: 'UTM Campaigns', icon: <Target size={14} /> },
  { key: 'country', label: 'Countries', icon: <Globe size={14} /> },
  { key: 'device', label: 'Device Types', icon: <Laptop size={14} /> },
  { key: 'browser', label: 'Browsers', icon: <Layers size={14} /> },
  { key: 'os', label: 'Operating Systems', icon: <Monitor size={14} /> },
];

export const ExploreView: React.FC<ExploreViewProps> = ({ project }) => {
  const initialUrlState = useRef(parseDashboardUrlState());

  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);
  const [comparison, setComparison] = useState<ComparisonType>(initialUrlState.current.compare);
  const [filters, setFilters] = useState<FilterClause[]>(initialUrlState.current.filters);

  // Explorer options
  const [dimension, setDimension] = useState<BreakdownDimension>('source');
  const [primaryMetric, setPrimaryMetric] = useState<'visitors' | 'page_views' | 'sessions'>('visitors');
  const [viewMode, setViewMode] = useState<'table' | 'bar'>('table');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting
  const [sortBy, setSortBy] = useState<'visitors' | 'page_views' | 'sessions'>('visitors');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Data States
  const [items, setItems] = useState<BreakdownItem[]>([]);
  const [totalVisitors, setTotalVisitors] = useState<number>(0);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [totalViews, setTotalViews] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState<boolean>(false);

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

  const fetchBreakdown = useCallback(async () => {
    if (!project?.site_id) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getBreakdown(project.site_id, {
        dimension,
        from,
        to,
        sortBy,
        sortOrder,
        limit: 100,
        filters: filters.length > 0 ? filters : undefined,
      });
      setItems(res.items);
      setTotalVisitors(res.totalVisitors);
      setTotalSessions(res.totalSessions);
      setTotalViews(res.totalPageViews);
    } catch (err: any) {
      setError(err.message || 'Unable to load explorer data.');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, getDates, dimension, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  const handleExportCsv = () => {
    if (items.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Dimension', 'Key', 'Label', 'Visitors', 'Page Views', 'Sessions', 'Share Percentage'];
      const rows = items.map((i) => [
        `"${dimension}"`,
        `"${i.key.replace(/"/g, '""')}"`,
        `"${(i.label || '').replace(/"/g, '""')}"`,
        i.visitors,
        i.pageViews,
        i.sessions,
        `${i.percentage}%`,
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `explore-${dimension}-${project?.site_id || 'site'}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSortChange = (col: 'visitors' | 'page_views' | 'sessions') => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
  };

  const handleAddFilter = (val: string) => {
    const exists = filters.some((f) => f.field === (dimension as any) && f.value === val);
    if (!exists) {
      setFilters((prev) => [...prev, { field: dimension as any, operator: 'equals', value: val }]);
    }
  };

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return item.key.toLowerCase().includes(q) || (item.label && item.label.toLowerCase().includes(q));
  });

  const maxVal = Math.max(...filteredItems.map((i) => (primaryMetric === 'views' ? i.pageViews : i[primaryMetric]) || 0), 1);

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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Analytics Explorer</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
              Slice, dice, and query your traffic across any analytical dimension with custom filters and instant export.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              id="export-explore-csv-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportCsv}
              disabled={exporting || items.length === 0}
              title="Export current explorer slice as CSV"
            >
              <Download size={14} />
              <span>{exporting ? 'Exporting...' : 'Export Slice CSV'}</span>
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

      {/* Query Configurator Bar */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          {/* Dimension Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Dimension:</span>
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
              {DIMENSIONS.map((dim) => {
                const isSelected = dimension === dim.key;
                return (
                  <button
                    key={dim.key}
                    type="button"
                    className={`btn btn-sm ${isSelected ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setDimension(dim.key)}
                  >
                    {dim.icon}
                    <span>{dim.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metric & View Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Metric:</span>
              <select
                className="select select-sm"
                value={primaryMetric}
                onChange={(e) => setPrimaryMetric(e.target.value as any)}
              >
                <option value="visitors">Visitors</option>
                <option value="page_views">Page Views</option>
                <option value="sessions">Sessions</option>
              </select>
            </div>

            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'table' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setViewMode('table')}
                title="Table View"
              >
                <TableIcon size={14} />
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'bar' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setViewMode('bar')}
                title="Distribution Bar View"
              >
                <BarChart2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Results Container */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {/* Quick Search */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input input-sm"
              style={{ paddingLeft: '32px', width: '100%' }}
              placeholder={`Search ${DIMENSIONS.find((d) => d.key === dimension)?.label}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            <span>Totals:</span>
            <span><strong>{totalVisitors.toLocaleString()}</strong> Visitors</span>
            <span><strong>{totalViews.toLocaleString()}</strong> Views</span>
            <span><strong>{totalSessions.toLocaleString()}</strong> Sessions</span>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : error ? (
          <WidgetError message={error} height="240px" onRetry={fetchBreakdown} />
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No rows match the query criteria.
            </p>
          </div>
        ) : viewMode === 'bar' ? (
          /* Distribution Bar Chart View */
          <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {filteredItems.slice(0, 15).map((item, idx) => {
              const val = primaryMetric === 'views' ? item.pageViews : item[primaryMetric];
              const pct = Math.min(100, Math.round(((val || 0) / maxVal) * 100));

              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ fontWeight: 500 }}>{item.label || item.key || '(none)'}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {(val || 0).toLocaleString()} ({item.percentage}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-surface-hover)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--color-accent)', borderRadius: '4px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>
                    {DIMENSIONS.find((d) => d.key === dimension)?.label || 'Key'}
                  </th>
                  <th
                    style={{ width: '18%', cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}
                    onClick={() => handleSortChange('visitors')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      <span>Visitors</span>
                      {sortBy === 'visitors' && (sortOrder === 'desc' ? <ArrowDown size={12} style={{ color: 'var(--color-accent)' }} /> : <ArrowUp size={12} style={{ color: 'var(--color-accent)' }} />)}
                    </div>
                  </th>
                  <th
                    style={{ width: '18%', cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}
                    onClick={() => handleSortChange('page_views')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      <span>Page Views</span>
                      {sortBy === 'page_views' && (sortOrder === 'desc' ? <ArrowDown size={12} style={{ color: 'var(--color-accent)' }} /> : <ArrowUp size={12} style={{ color: 'var(--color-accent)' }} />)}
                    </div>
                  </th>
                  <th
                    style={{ width: '14%', cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}
                    onClick={() => handleSortChange('sessions')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      <span>Sessions</span>
                      {sortBy === 'sessions' && (sortOrder === 'desc' ? <ArrowDown size={12} style={{ color: 'var(--color-accent)' }} /> : <ArrowUp size={12} style={{ color: 'var(--color-accent)' }} />)}
                    </div>
                  </th>
                  <th style={{ width: '5%', textAlign: 'center' }}>Filter</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const val = primaryMetric === 'views' ? item.pageViews : item[primaryMetric];
                  const barPercent = Math.min(100, Math.round(((val || 0) / maxVal) * 100));

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
                        <span style={{ position: 'relative', fontWeight: 500 }}>
                          {item.label || item.key || '(none)'}
                        </span>
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
                          onClick={() => handleAddFilter(item.key)}
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
