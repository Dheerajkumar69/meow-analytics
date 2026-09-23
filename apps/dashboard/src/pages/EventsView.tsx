import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Project,
  api,
  EventsResponse,
  EventItem,
  EventDetailResponse,
  EventPropertyAnalyticsResponse,
} from '../lib/api.js';
import {
  Zap,
  ArrowDownCircle,
  ExternalLink,
  AlertCircle,
  Search,
  RefreshCw,
  Clock,
  Users,
  Activity,
  Filter,
  BarChart2,
  FileText,
  X,
  ChevronRight,
} from 'lucide-react';
import { Modal } from '../components/Modal.js';
import { CardSkeleton } from '../components/Skeleton.js';
import { EmptyAnalytics } from '../components/EmptyAnalytics.js';
import {
  parseDashboardUrlState,
  updateDashboardUrlState,
  calculatePresetDateRange,
  TimeRangePreset,
} from '../lib/urlState.js';
import { DateRangeSelector } from '../components/DateRangeSelector.js';

interface EventsViewProps {
  project: Project | null;
}

export const EventsView: React.FC<EventsViewProps> = ({ project }) => {
  // BUG-22 FIX: Use shared URL date state so date range persists across view changes.
  const initialUrlState = useRef(parseDashboardUrlState());
  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);

  const [eventsData, setEventsData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'count' | 'visitors' | 'sessions' | 'name'>('count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Detail Modal State
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<EventDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Property Analytics State inside Detail Modal
  const [selectedPropertyKey, setSelectedPropertyKey] = useState<string | null>(null);
  const [propertyAnalytics, setPropertyAnalytics] = useState<EventPropertyAnalyticsResponse | null>(null);
  const [propLoading, setPropLoading] = useState(false);

  // Calculate Date Range from shared URL state
  const getDates = useCallback(() => {
    return calculatePresetDateRange(dateRangePreset, customFrom, customTo);
  }, [dateRangePreset, customFrom, customTo]);

  const handleRangeChange = (preset: TimeRangePreset, from?: string, to?: string) => {
    setDateRangePreset(preset);
    setCustomFrom(from);
    setCustomTo(to);
    updateDashboardUrlState({ range: preset, from, to });
  };


  // Fetch Events
  const fetchEvents = useCallback(async () => {
    if (!project?.site_id) return;
    setLoading(true);
    setError(null);
    try {
      const dates = getDates();
      const res = await api.getEvents(project.site_id, {
        from: dates.from,
        to: dates.to,
        search: search.trim() || undefined,
        sortBy,
        sortOrder,
        limit: 100,
      });
      setEventsData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, getDates, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fetch Event Detail
  const fetchDetail = useCallback(
    async (eventName: string) => {
      if (!project?.site_id) return;
      setDetailLoading(true);
      setDetailError(null);
      setSelectedPropertyKey(null);
      setPropertyAnalytics(null);
      try {
        const dates = getDates();
        const res = await api.getEventDetail(project.site_id, eventName, {
          from: dates.from,
          to: dates.to,
        });
        setDetailData(res);
        // Automatically select the first property key if available
        const propKeys = Object.keys(res.properties || {});
        if (propKeys.length > 0) {
          setSelectedPropertyKey(propKeys[0]!);
        }
      } catch (err: any) {
        setDetailError(err.message || 'Failed to load event details');
      } finally {
        setDetailLoading(false);
      }
    },
    [project?.site_id, getDates]
  );

  // Fetch Property Breakdown
  const fetchPropertyDrilldown = useCallback(
    async (eventName: string, propKey: string) => {
      if (!project?.site_id) return;
      setPropLoading(true);
      try {
        const dates = getDates();
        const res = await api.getEventPropertyAnalytics(project.site_id, eventName, propKey, {
          from: dates.from,
          to: dates.to,
        });
        setPropertyAnalytics(res);
      } catch (err) {
        console.error(err);
      } finally {
        setPropLoading(false);
      }
    },
    [project?.site_id, getDates]
  );

  useEffect(() => {
    if (selectedEventName && selectedPropertyKey) {
      fetchPropertyDrilldown(selectedEventName, selectedPropertyKey);
    }
  }, [selectedEventName, selectedPropertyKey, fetchPropertyDrilldown]);

  const handleOpenDetail = (name: string) => {
    setSelectedEventName(name);
    fetchDetail(name);
  };

  const getEventIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('download')) return <ArrowDownCircle size={16} color="var(--color-accent)" />;
    if (lower.includes('outbound') || lower.includes('click')) return <ExternalLink size={16} color="var(--color-info)" />;
    if (lower === '404' || lower.includes('error')) return <AlertCircle size={16} color="var(--color-danger)" />;
    return <Zap size={16} color="var(--color-warning)" />;
  };

  if (!project) {
    return (
      <EmptyAnalytics
        title="Custom Events & Conversions"
        description="Select or create a project to track custom client events, button clicks, downloads, and custom properties."
        project={null}
      />
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
            Events Analytics
          </h1>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Track custom actions, safe event properties, file downloads, and outbound clicks.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Shared Date Range Selector (BUG-22 FIX) */}
          <DateRangeSelector
            preset={dateRangePreset}
            customFrom={customFrom}
            customTo={customTo}
            onRangeChange={handleRangeChange}
          />

          <button
            onClick={fetchEvents}
            className="btn btn-secondary btn-sm"
            disabled={loading}
            title="Refresh events"
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
              backgroundColor: 'var(--color-accent-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={22} color="var(--color-accent)" />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Total Event Triggers
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {loading ? '...' : (eventsData?.totalEvents ?? 0).toLocaleString()}
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
            <Zap size={22} color="var(--color-warning)" />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Unique Event Types
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {loading ? '...' : (eventsData?.totalUniqueEvents ?? 0).toLocaleString()}
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
              Active Sessions with Events
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {loading
                ? '...'
                : (
                    eventsData?.events?.reduce((acc, ev) => acc + ev.sessions, 0) ?? 0
                  ).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Main Events Table Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Table Filter & Search Header */}
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
            <div style={{ position: 'relative', width: '280px' }}>
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
                id="search-events-input"
                type="text"
                className="input input-sm"
                placeholder="Search event name..."
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
              <option value="count">Count (Occurrences)</option>
              <option value="visitors">Unique Visitors</option>
              <option value="sessions">Sessions</option>
              <option value="name">Event Name</option>
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

        {/* Events Table */}
        {loading ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <CardSkeleton height={140} />
          </div>
        ) : error ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-danger)' }}>
            {error}
          </div>
        ) : !eventsData || eventsData.events.length === 0 ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>
            <Zap size={36} color="var(--color-text-muted)" style={{ margin: '0 auto var(--space-3)' }} />
            <h3 style={{ margin: '0 0 var(--space-1)', color: 'var(--color-text-primary)' }}>No Events Tracked Yet</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '440px', margin: '0 auto var(--space-4)' }}>
              Call <code>meowAnalytics.track("EventName", &#123; property: "value" &#125;)</code> in your web app to capture rich custom events.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface-subtle)' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    Event Name
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'right' }}>
                    Occurrences
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'right' }}>
                    Unique Visitors
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'right' }}>
                    Sessions
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', width: '90px' }}></th>
                </tr>
              </thead>
              <tbody>
                {eventsData.events.map((ev) => (
                  <tr
                    key={ev.eventName}
                    onClick={() => handleOpenDetail(ev.eventName)}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    className="table-row-hover"
                  >
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        {getEventIcon(ev.eventName)}
                        <span>{ev.eventName}</span>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {ev.count.toLocaleString()}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {ev.visitors.toLocaleString()}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {ev.sessions.toLocaleString()}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(ev.eventName);
                        }}
                      >
                        Details <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Event Detail Modal (Section 6 & 7) */}
      <Modal
        isOpen={Boolean(selectedEventName)}
        onClose={() => setSelectedEventName(null)}
        title={selectedEventName ? `Event Detail: ${selectedEventName}` : 'Event Detail'}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedEventName(null)}>
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
            {/* Quick Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'var(--space-3)',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--color-surface-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Occurrences</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                  {detailData.occurrences.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Visitors</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {detailData.visitors.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Sessions</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {detailData.sessions.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Top Paths */}
            {detailData.paths && detailData.paths.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 var(--space-2)', fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                  Top Paths Triggered
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {detailData.paths.map((p) => (
                    <div
                      key={p.path}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{p.path}</span>
                        <span>
                          {p.count.toLocaleString()} ({p.percentage}%)
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4,
                          width: '100%',
                          backgroundColor: 'var(--color-surface-subtle)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, p.percentage)}%`,
                            backgroundColor: 'var(--color-accent)',
                            borderRadius: '2px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event Time Series (Section 6) */}
            {detailData.timeseries && detailData.timeseries.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                    Time Series Activity
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Occurrences over time
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
                  <div style={{ display: 'flex', alignItems: 'flex-end', height: '90px', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {(() => {
                      const maxVal = Math.max(...detailData.timeseries.map((p) => Math.max(p.count, p.visitors || 0)), 1);
                      return detailData.timeseries.map((p, i) => {
                        const countHeight = Math.max(4, Math.round((p.count / maxVal) * 65));
                        const d = new Date(p.timestamp);
                        const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
                        return (
                          <div
                            key={p.timestamp || i}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              flex: 1,
                              minWidth: '16px',
                              height: '100%',
                              justifyContent: 'flex-end',
                            }}
                            title={`${label}: ${p.count} event(s), ${p.visitors || 0} unique visitor(s)`}
                          >
                            <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
                              {p.count > 0 ? p.count : ''}
                            </div>
                            <div
                              style={{
                                width: '100%',
                                height: `${countHeight}px`,
                                backgroundColor: 'var(--color-accent)',
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

            {/* Event Property Analytics (Section 7) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <h4 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                  Event Property Analytics
                </h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Safe grouped breakdown
                </span>
              </div>

              {/* Property Tabs */}
              {Object.keys(detailData.properties || {}).length === 0 ? (
                <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                  No custom properties recorded for this event.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {Object.keys(detailData.properties).map((propKey) => (
                      <button
                        key={propKey}
                        onClick={() => setSelectedPropertyKey(propKey)}
                        className={`btn btn-xs ${selectedPropertyKey === propKey ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {propKey}
                      </button>
                    ))}
                  </div>

                  {/* Selected Property Distribution */}
                  {selectedPropertyKey && (
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
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                        Values for <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>{selectedPropertyKey}</span>
                      </div>

                      {propLoading ? (
                        <div style={{ padding: 'var(--space-2)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Loading values...</div>
                      ) : propertyAnalytics && propertyAnalytics.values.length > 0 ? (
                        propertyAnalytics.values.map((v) => (
                          <div key={v.value} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                                {v.value}
                              </span>
                              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                                {v.count.toLocaleString()} ({v.percentage}%)
                              </span>
                            </div>
                            <div
                              style={{
                                height: 5,
                                width: '100%',
                                backgroundColor: 'var(--color-border)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${Math.min(100, v.percentage)}%`,
                                  backgroundColor: 'var(--color-info)',
                                  borderRadius: '2px',
                                }}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                          No values recorded.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
