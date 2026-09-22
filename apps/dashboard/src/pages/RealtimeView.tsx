import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radio,
  Users,
  Activity,
  Eye,
  Zap,
  Play,
  Pause,
  RefreshCw,
  Globe,
  Laptop,
  Clock,
  ExternalLink,
} from 'lucide-react';
import {
  Project,
  api,
  LiveAnalyticsResponse,
  RealtimeTimelinePoint,
  RealtimeRecentEvent,
} from '../lib/api.js';
import { MetricCard } from '../components/MetricCard.js';
import { CardSkeleton, TableSkeleton } from '../components/Skeleton.js';
import { WidgetError } from '../components/WidgetError.js';

interface RealtimeViewProps {
  project: Project | null;
}

export const RealtimeView: React.FC<RealtimeViewProps> = ({ project }) => {
  const [windowMinutes, setWindowMinutes] = useState<number>(5);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  const [liveData, setLiveData] = useState<LiveAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<any>(null);
  const lastFetchTimeRef = useRef<number>(Date.now());

  const fetchLive = useCallback(async () => {
    if (!project?.site_id) return;
    try {
      const res = await api.getLiveAnalytics(project.site_id, windowMinutes);
      setLiveData(res);
      setError(null);
      lastFetchTimeRef.current = Date.now();
      setSecondsAgo(0);
    } catch (err: any) {
      setError(err.message || 'Unable to load real-time pulse.');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, windowMinutes]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchLive();
  }, [fetchLive]);

  // Polling interval (every 8 seconds when not paused)
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      fetchLive();
    }, 8000);

    return () => clearInterval(interval);
  }, [fetchLive, isPaused]);

  // Elapsed seconds timer
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastFetchTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const timeline = liveData?.timeline || [];
  const recentEvents = liveData?.recentEvents || [];
  const activePages = liveData?.activePages || [];

  const maxTimelineViews = Math.max(...timeline.map((t) => (t.pageViews || 0) + (t.events || 0)), 1);
  const maxActivePageVisitors = Math.max(...activePages.map((p) => p.visitors || 0), 1);

  const formatRelativeTime = (isoString: string) => {
    try {
      const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diff < 5) return 'just now';
      if (diff < 60) return `${diff}s ago`;
      const mins = Math.floor(diff / 60);
      return `${mins}m ago`;
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Realtime Status Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
            }}
          >
            <Radio size={18} className="pulse-dot" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                Real-Time Traffic
              </h1>
              <span className="badge badge-accent" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                LIVE
              </span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
              Monitoring active sessions and stream events observed within the last {windowMinutes} minutes.
            </p>
          </div>
        </div>

        {/* Controls: Window Selector, Pause/Resume, Last Updated */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div className="btn-group">
            <button
              type="button"
              className={`btn btn-sm ${windowMinutes === 5 ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setWindowMinutes(5)}
            >
              5m
            </button>
            <button
              type="button"
              className={`btn btn-sm ${windowMinutes === 15 ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setWindowMinutes(15)}
            >
              15m
            </button>
            <button
              type="button"
              className={`btn btn-sm ${windowMinutes === 30 ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setWindowMinutes(30)}
            >
              30m
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIsPaused((prev) => !prev)}
            title={isPaused ? 'Resume live refresh' : 'Pause live refresh'}
          >
            {isPaused ? <Play size={14} style={{ color: 'var(--color-accent)' }} /> : <Pause size={14} />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => fetchLive()}
            title="Refresh now"
          >
            <RefreshCw size={14} />
          </button>

          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: '100px', textAlign: 'right' }}>
            {isPaused ? 'Updates paused' : `Updated ${secondsAgo}s ago`}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <WidgetError message={error} onRetry={fetchLive} height="120px" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          <MetricCard
            title="Active Online Visitors"
            value={(liveData?.liveVisitors || 0).toLocaleString()}
            tooltip="Estimated visitors with recorded activity within the selected window."
            icon={<Users size={16} />}
          />
          <MetricCard
            title="Active Sessions"
            value={(liveData?.liveSessions || 0).toLocaleString()}
            tooltip="Concurrent active sessions currently browsing your site."
            icon={<Activity size={16} />}
          />
          <MetricCard
            title="Active Pages"
            value={activePages.length.toLocaleString()}
            tooltip="Distinct paths with active visitors right now."
            icon={<Eye size={16} />}
          />
          <MetricCard
            title="Stream Event Volume"
            value={recentEvents.length.toLocaleString()}
            tooltip="Recent pageview and custom event stream entries received."
            icon={<Zap size={16} />}
          />
        </div>
      )}

      {/* Activity Timeline Bar Graph (30-minute minute-by-minute) */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Clock size={16} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Activity Pulse (Last 30 Minutes)</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Minute-by-minute pageviews & events
          </span>
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          {timeline.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No timeline hits in the last 30 minutes.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100px', width: '100%', paddingTop: '10px' }}>
              {timeline.map((pt, idx) => {
                const totalActivity = (pt.pageViews || 0) + (pt.events || 0);
                const barHeight = Math.max(4, Math.round((totalActivity / maxTimelineViews) * 80));

                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      height: '100%',
                    }}
                    title={`${pt.minute}: ${pt.visitors} visitors, ${pt.pageViews} views, ${pt.events} events`}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${barHeight}px`,
                        backgroundColor: totalActivity > 0 ? 'var(--color-accent)' : 'var(--color-surface-hover)',
                        borderRadius: '2px 2px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Grid: Active Pages & Live Event Stream */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Left: Active Pages */}
        <div className="card">
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0 }}>Active Pages Right Now</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {activePages.length} pages
            </span>
          </div>

          {activePages.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No visitors active on any pages right now.
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '70%' }}>Path</th>
                    <th style={{ width: '30%', textAlign: 'right' }}>Active Visitors</th>
                  </tr>
                </thead>
                <tbody>
                  {activePages.map((page, idx) => {
                    const percent = Math.min(100, Math.round((page.visitors / maxActivePageVisitors) * 100));
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
                          <span style={{ position: 'relative', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                            {page.path}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {page.visitors}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Live Stream of Recent Events */}
        <div className="card">
          <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0 }}>Live Activity Stream</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Last {recentEvents.length} actions
            </span>
          </div>

          {recentEvents.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              Waiting for incoming page views or custom events...
            </div>
          ) : (
            <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '20%' }}>Time</th>
                    <th style={{ width: '20%' }}>Type</th>
                    <th style={{ width: '40%' }}>Path / Event</th>
                    <th style={{ width: '20%', textAlign: 'right' }}>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((evt) => (
                    <tr key={evt.id}>
                      <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatRelativeTime(evt.timestamp)}
                      </td>
                      <td>
                        <span
                          className={`badge ${evt.type === 'pageview' ? 'badge-accent' : 'badge-warning'}`}
                          style={{ fontSize: '0.6875rem', padding: '1px 6px' }}
                        >
                          {evt.type === 'pageview' ? 'View' : 'Event'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                        {evt.type === 'event' ? evt.name : evt.path}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        {evt.device || evt.country || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
