import React, { useState, useEffect, useCallback } from 'react';
import {
  Project,
  api,
  ErrorsResponse,
  ErrorItem,
  ErrorDetailResponse,
} from '../lib/api.js';
import {
  AlertTriangle,
  AlertOctagon,
  Search,
  RefreshCw,
  Clock,
  Users,
  Layers,
  Laptop,
  Globe,
  FileCode,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '../components/Modal.js';
import { CardSkeleton } from '../components/Skeleton.js';

interface ErrorsViewProps {
  project: Project | null;
}

export const ErrorsView: React.FC<ErrorsViewProps> = ({ project }) => {
  const [errorsData, setErrorsData] = useState<ErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'occurrences' | 'visitors' | 'last_seen' | 'first_seen'>('occurrences');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d');

  // Detail Modal State
  const [selectedErrorGroup, setSelectedErrorGroup] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<ErrorDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Calculate Date Range
  const getDates = useCallback(() => {
    const to = new Date();
    let from = new Date();
    if (timeRange === '24h') from.setTime(to.getTime() - 24 * 60 * 60 * 1000);
    else if (timeRange === '7d') from.setTime(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeRange === '30d') from.setTime(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (timeRange === '90d') from.setTime(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [timeRange]);

  // Fetch Errors List
  const fetchErrors = useCallback(async () => {
    if (!project?.site_id) return;
    setLoading(true);
    setError(null);
    try {
      const dates = getDates();
      const res = await api.getErrors(project.site_id, {
        from: dates.from,
        to: dates.to,
        search: search.trim() || undefined,
        sortBy,
        sortOrder,
        limit: 100,
      });
      setErrorsData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load error events');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, getDates, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  // Fetch Error Detail
  const fetchDetail = useCallback(
    async (errorGroup: string) => {
      if (!project?.site_id) return;
      setDetailLoading(true);
      setDetailError(null);
      try {
        const dates = getDates();
        const res = await api.getErrorDetail(project.site_id, errorGroup, {
          from: dates.from,
          to: dates.to,
        });
        setDetailData(res);
      } catch (err: any) {
        setDetailError(err.message || 'Failed to load error details');
      } finally {
        setDetailLoading(false);
      }
    },
    [project?.site_id, getDates]
  );

  const handleOpenDetail = (errorGroup: string) => {
    setSelectedErrorGroup(errorGroup);
    fetchDetail(errorGroup);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Please select or create a project first.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Controls Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Errors Dashboard
          </h1>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Anonymous frontend error tracking, grouped by error pattern without spamming rows.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Time Range Selector */}
          <div className="btn-group" style={{ display: 'inline-flex', backgroundColor: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
            {(['24h', '7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`btn btn-sm ${timeRange === r ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-sm)', textTransform: 'uppercase', fontSize: '0.75rem', padding: '4px 10px' }}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={fetchErrors}
            className="btn btn-secondary btn-sm"
            disabled={loading}
            title="Refresh errors"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertOctagon size={22} color="var(--color-danger)" />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Total Error Occurrences
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-danger)' }}>
              {loading ? '...' : (errorsData?.totalErrors ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-warning-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={22} color="var(--color-warning)" />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Grouped Error Patterns
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {loading ? '...' : (errorsData?.uniqueErrors ?? 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-info-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={22} color="var(--color-info)" />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Affected Visitors
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {loading
                ? '...'
                : (
                    errorsData?.errors?.reduce((acc, err) => acc + err.affectedVisitors, 0) ?? 0
                  ).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grouped Errors Table Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Filter Bar */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                }}
              />
              <input
                id="search-errors-input"
                type="text"
                className="input input-sm"
                placeholder="Search error message or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '32px', width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Sort by:</span>
            <select
              className="select select-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="occurrences">Occurrences</option>
              <option value="visitors">Affected Visitors</option>
              <option value="last_seen">Last Seen</option>
              <option value="first_seen">First Seen</option>
            </select>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              title={`Order: ${sortOrder.toUpperCase()}`}
            >
              {sortOrder === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>

        {/* Errors Table */}
        {loading ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <CardSkeleton height={140} />
          </div>
        ) : error ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-danger)' }}>
            {error}
          </div>
        ) : !errorsData || errorsData.errors.length === 0 ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
            <ShieldCheck size={36} color="var(--color-accent)" style={{ margin: '0 auto var(--space-3)' }} />
            <h3 style={{ margin: '0 0 var(--space-1)', color: 'var(--color-text-primary)' }}>No Errors Detected</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '440px', margin: '0 auto var(--space-4)' }}>
              Clean and healthy frontend! Any uncaught exceptions or unhandled promise rejections will be grouped and displayed here.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-subtle)' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    Error
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'right' }}>
                    Occurrences
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'right' }}>
                    Affected Visitors
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    First Seen
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    Last Seen
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', width: '90px' }}></th>
                </tr>
              </thead>
              <tbody>
                {errorsData.errors.map((err) => (
                  <tr
                    key={err.errorGroup}
                    onClick={() => handleOpenDetail(err.errorGroup)}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    className="table-row-hover"
                  >
                    <td style={{ padding: 'var(--space-3) var(--space-4)', maxWidth: '400px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--color-danger-subtle)',
                              color: 'var(--color-danger-text)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {err.errorType}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            color: 'var(--color-text-primary)',
                            fontFamily: 'var(--font-mono)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={err.message}
                        >
                          {err.message}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 600, color: 'var(--color-danger)' }}>
                      {err.occurrences.toLocaleString()}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {err.affectedVisitors.toLocaleString()}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      {formatDate(err.firstSeen)}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                      {formatDate(err.lastSeen)}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(err.errorGroup);
                        }}
                      >
                        Detail <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Error Detail Modal (Section 12 & 13) */}
      <Modal
        isOpen={Boolean(selectedErrorGroup)}
        onClose={() => setSelectedErrorGroup(null)}
        title={detailData ? `${detailData.errorType}: Details` : 'Error Detail'}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedErrorGroup(null)}>
            Close
          </button>
        }
      >
        {detailLoading ? (
          <CardSkeleton height={200} />
        ) : detailError ? (
          <div style={{ padding: 'var(--space-4)', color: 'var(--color-danger)' }}>{detailError}</div>
        ) : detailData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Error Message Box */}
            <div
              style={{
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-surface-subtle)',
                borderLeft: '3px solid var(--color-danger)',
                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                color: 'var(--color-text-primary)',
                wordBreak: 'break-all',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--color-danger)', marginBottom: '4px' }}>
                {detailData.errorType}
              </div>
              {detailData.message}
            </div>

            {/* Quick Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-surface-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Occurrences</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-danger)' }}>
                  {detailData.occurrences.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Visitors</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {detailData.affectedVisitors.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>First Seen</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  {formatDate(detailData.firstSeen)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Last Seen</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  {formatDate(detailData.lastSeen)}
                </div>
              </div>
            </div>

            {/* Top Paths & Browsers Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              {/* Paths */}
              <div>
                <h4 style={{ margin: '0 0 var(--space-2)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  Affected Paths
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  {detailData.paths.slice(0, 5).map((p) => (
                    <div
                      key={p.path}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: 'var(--space-1) var(--space-2)',
                        backgroundColor: 'var(--color-surface-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                      <span style={{ fontWeight: 600 }}>{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Browsers & OS */}
              <div>
                <h4 style={{ margin: '0 0 var(--space-2)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                  Browsers & OS
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  {detailData.browsers.slice(0, 3).map((b) => (
                    <div
                      key={b.browser}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: 'var(--space-1) var(--space-2)',
                        backgroundColor: 'var(--color-surface-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                      }}
                    >
                      <span>{b.browser}</span>
                      <span style={{ fontWeight: 600 }}>{b.count}</span>
                    </div>
                  ))}
                  {detailData.os.slice(0, 3).map((o) => (
                    <div
                      key={o.os}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: 'var(--space-1) var(--space-2)',
                        backgroundColor: 'var(--color-surface-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                      }}
                    >
                      <span>{o.os}</span>
                      <span style={{ fontWeight: 600 }}>{o.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Error Time Series (Section 12 & 13) */}
            {detailData.timeseries && detailData.timeseries.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>
                    Error Occurrence Trend
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Daily distribution
                  </span>
                </div>
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-surface-subtle)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-end', height: '80px', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {(() => {
                      const maxVal = Math.max(...detailData.timeseries.map((p) => p.count), 1);
                      return detailData.timeseries.map((p, i) => {
                        const countHeight = Math.max(4, Math.round((p.count / maxVal) * 55));
                        const d = new Date(p.timestamp);
                        const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        return (
                          <div
                            key={p.timestamp || i}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              flex: 1,
                              minWidth: '20px',
                              height: '100%',
                              justifyContent: 'flex-end',
                            }}
                            title={`${label}: ${p.count} error occurrence(s)`}
                          >
                            <div style={{ fontSize: '0.625rem', color: 'var(--color-danger)', fontWeight: 600, marginBottom: '2px' }}>
                              {p.count > 0 ? p.count : ''}
                            </div>
                            <div
                              style={{
                                width: '100%',
                                height: `${countHeight}px`,
                                backgroundColor: 'var(--color-danger)',
                                borderRadius: '2px 2px 0 0',
                              }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)', paddingTop: '4px' }}>
                    <span>{new Date(detailData.timeseries[0]!.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span>{new Date(detailData.timeseries[detailData.timeseries.length - 1]!.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
