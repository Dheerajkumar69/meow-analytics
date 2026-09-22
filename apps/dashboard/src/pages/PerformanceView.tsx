import React, { useState, useEffect, useCallback } from 'react';
import {
  Project,
  api,
  PerformanceAnalyticsResponse,
  PerformanceMetricSummary,
} from '../lib/api.js';
import {
  Gauge,
  Zap,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CardSkeleton } from '../components/Skeleton.js';

interface PerformanceViewProps {
  project: Project | null;
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({ project }) => {
  const [data, setData] = useState<PerformanceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  const [selectedDevice, setSelectedDevice] = useState<'all' | 'desktop' | 'mobile' | 'tablet'>('all');
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [showThresholdGuide, setShowThresholdGuide] = useState(false);

  // Date range calculator
  const getDates = useCallback(() => {
    const to = new Date();
    const from = new Date();
    if (timeRange === '24h') from.setTime(to.getTime() - 24 * 60 * 60 * 1000);
    else if (timeRange === '7d') from.setTime(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeRange === '30d') from.setTime(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [timeRange]);

  const fetchPerformance = useCallback(async () => {
    if (!project?.site_id) return;
    setLoading(true);
    setError(null);
    try {
      const dates = getDates();
      const res = await api.getPerformance(project.site_id, {
        from: dates.from,
        to: dates.to,
        path: selectedRoute !== 'all' ? selectedRoute : undefined,
        device: selectedDevice !== 'all' ? selectedDevice : undefined,
        comparePeriod: true,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load web performance metrics');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, getDates, selectedRoute, selectedDevice]);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  // Format metric value helper
  const formatMetricValue = (key: string, val: number | null | undefined): string => {
    if (val === null || val === undefined) return '—';
    if (key === 'cls') {
      return val.toFixed(3);
    }
    if (val >= 1000) {
      return `${(val / 1000).toFixed(2)}s`;
    }
    return `${Math.round(val)}ms`;
  };

  const getRatingBadge = (rating: 'good' | 'needs-improvement' | 'poor' | null) => {
    if (rating === 'good') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
        >
          <CheckCircle2 size={12} /> Good
        </span>
      );
    }
    if (rating === 'needs-improvement') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          <AlertCircle size={12} /> Needs Improvement
        </span>
      );
    }
    if (rating === 'poor') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <AlertCircle size={12} /> Poor
        </span>
      );
    }
    return (
      <span
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
          padding: '2px 8px',
          borderRadius: '9999px',
          backgroundColor: 'var(--color-surface-subtle)',
        }}
      >
        No Data
      </span>
    );
  };

  const renderTrendBadge = (trend: number | null) => {
    if (trend === null || trend === undefined) return null;
    // For performance, negative change (lower latency) is better!
    const isImproved = trend < 0;
    const absVal = Math.abs(trend).toFixed(1);

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: isImproved ? '#10b981' : '#ef4444',
          marginTop: '4px',
        }}
        title={`${isImproved ? 'Improved (Faster)' : 'Degraded (Slower)'} compared to previous period`}
      >
        {isImproved ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        <span>
          {absVal}% vs previous period ({isImproved ? 'Faster' : 'Slower'})
        </span>
      </div>
    );
  };

  const renderVitalCard = (
    key: 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb',
    name: string,
    fullName: string,
    threshold: string,
    metric: PerformanceMetricSummary
  ) => {
    const isExpanded = expandedMetric === key;
    return (
      <div
        key={key}
        className="card card-hover"
        style={{
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-surface-base)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transition: 'all var(--transition-normal)',
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                  {name}
                </span>
                {getRatingBadge(metric.rating)}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginTop: '2px' }}>
                {fullName}
              </span>
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-dim)',
                backgroundColor: 'var(--color-surface-subtle)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              p75 target
            </span>
          </div>

          <div style={{ margin: 'var(--space-3) 0 var(--space-2) 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span
                style={{
                  fontSize: '2rem',
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  color: 'var(--color-text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatMetricValue(key, metric.p75)}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>
                p75 ({metric.count} samples)
              </span>
            </div>
            {renderTrendBadge(metric.trend)}
          </div>
        </div>

        {/* Percentile Distribution Drawer */}
        <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setExpandedMetric(isExpanded ? null : key)}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 8px',
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>Percentile breakdown (p50 / p75 / p90 / p95)</span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {isExpanded && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                marginTop: 'var(--space-2)',
                backgroundColor: 'var(--color-surface-subtle)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', display: 'block' }}>p50</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMetricValue(key, metric.p50)}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: 600, display: 'block' }}>p75 (Primary)</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-accent)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatMetricValue(key, metric.p75)}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', display: 'block' }}>p90</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMetricValue(key, metric.p90)}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', display: 'block' }}>p95</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMetricValue(key, metric.p95)}
                </span>
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', marginTop: 'var(--space-2)' }}>
            Threshold: {threshold}
          </div>
        </div>
      </div>
    );
  };

  if (!project) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Please select a project to view performance metrics.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Header Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Web Performance & Speed Insights
            </h1>
            {data?.isSampled && (
              <span
                className="badge"
                style={{
                  backgroundColor: 'rgba(167, 139, 250, 0.15)',
                  color: '#a78bfa',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
                title={`Sampling is active (${Math.round((data.sampleRate || 1) * 100)}% of traffic). Showing real-time aggregated metrics.`}
              >
                <Zap size={12} /> Sampled ({Math.round((data.sampleRate || 1) * 100)}%)
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            Real-user Core Web Vitals, navigation timings, and page responsiveness with percentile accuracy.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {/* Time Range Selector */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--color-surface-subtle)',
              padding: '2px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            {(['24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                type="button"
                className={`btn btn-sm ${timeRange === range ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTimeRange(range)}
                style={{ padding: '4px 12px', fontSize: '0.75rem' }}
              >
                {range === '24h' ? '24 Hours' : range === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowThresholdGuide(!showThresholdGuide)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <HelpCircle size={14} /> Thresholds
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fetchPerformance()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Threshold Legend Guide Modal/Banner */}
      {showThresholdGuide && (
        <div
          style={{
            backgroundColor: 'var(--color-surface-base)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              Standard Google Web Vitals Target Thresholds
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowThresholdGuide(false)}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-subtle)' }}>
              <strong>LCP (Largest Contentful Paint)</strong>
              <div style={{ color: '#10b981' }}>Good: ≤ 2.5s</div>
              <div style={{ color: '#f59e0b' }}>Needs Work: 2.5s - 4.0s</div>
              <div style={{ color: '#ef4444' }}>Poor: &gt; 4.0s</div>
            </div>
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-subtle)' }}>
              <strong>INP (Interaction to Next Paint)</strong>
              <div style={{ color: '#10b981' }}>Good: ≤ 200ms</div>
              <div style={{ color: '#f59e0b' }}>Needs Work: 200ms - 500ms</div>
              <div style={{ color: '#ef4444' }}>Poor: &gt; 500ms</div>
            </div>
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-subtle)' }}>
              <strong>CLS (Cumulative Layout Shift)</strong>
              <div style={{ color: '#10b981' }}>Good: ≤ 0.10</div>
              <div style={{ color: '#f59e0b' }}>Needs Work: 0.10 - 0.25</div>
              <div style={{ color: '#ef4444' }}>Poor: &gt; 0.25</div>
            </div>
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-subtle)' }}>
              <strong>FCP (First Contentful Paint)</strong>
              <div style={{ color: '#10b981' }}>Good: ≤ 1.8s</div>
              <div style={{ color: '#f59e0b' }}>Needs Work: 1.8s - 3.0s</div>
              <div style={{ color: '#ef4444' }}>Poor: &gt; 3.0s</div>
            </div>
            <div style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-subtle)' }}>
              <strong>TTFB (Time to First Byte)</strong>
              <div style={{ color: '#10b981' }}>Good: ≤ 800ms</div>
              <div style={{ color: '#f59e0b' }}>Needs Work: 800ms - 1800ms</div>
              <div style={{ color: '#ef4444' }}>Poor: &gt; 1800ms</div>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-danger-subtle)',
            color: 'var(--color-danger-text)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {/* Web Vitals Primary Cards */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
          {renderVitalCard('lcp', 'LCP', 'Largest Contentful Paint', '≤ 2.5s (Good)', data.summary.lcp)}
          {renderVitalCard('inp', 'INP', 'Interaction to Next Paint', '≤ 200ms (Good)', data.summary.inp)}
          {renderVitalCard('cls', 'CLS', 'Cumulative Layout Shift', '≤ 0.10 (Good)', data.summary.cls)}
          {renderVitalCard('fcp', 'FCP', 'First Contentful Paint', '≤ 1.8s (Good)', data.summary.fcp)}
          {renderVitalCard('ttfb', 'TTFB', 'Time to First Byte', '≤ 800ms (Good)', data.summary.ttfb)}
        </div>
      )}

      {/* Navigation Timing Breakdown / Waterfall */}
      {data && (
        <div
          className="card"
          style={{
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-surface-base)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                Navigation Timing Waterfall
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                W3C Navigation Timing breakdown (DNS, TCP, Request, Response, DOM, Load)
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
              Calculated at p75
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
            {[
              { label: 'DNS Lookup', p75: data.navigationTiming.dns.p75, avg: data.navigationTiming.dns.avg, color: '#38bdf8' },
              { label: 'Initial Connection', p75: data.navigationTiming.connection.p75, avg: data.navigationTiming.connection.avg, color: '#818cf8' },
              { label: 'Request Time', p75: data.navigationTiming.request.p75, avg: data.navigationTiming.request.avg, color: '#c084fc' },
              { label: 'Response Time', p75: data.navigationTiming.response.p75, avg: data.navigationTiming.response.avg, color: '#f472b6' },
              { label: 'DOM Loading', p75: data.navigationTiming.domLoading.p75, avg: data.navigationTiming.domLoading.avg, color: '#fb923c' },
              { label: 'Total Page Load', p75: data.navigationTiming.pageLoad.p75, avg: data.navigationTiming.pageLoad.avg, color: '#34d399' },
            ].map((timing) => (
              <div
                key={timing.label}
                style={{
                  backgroundColor: 'var(--color-surface-subtle)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: `4px solid ${timing.color}`,
                }}
              >
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'block' }}>
                  {timing.label}
                </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', display: 'block', marginTop: '2px' }}>
                  {formatMetricValue('timing', timing.p75)}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
                  avg: {formatMetricValue('timing', timing.avg)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Route & Device Filter Controls */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginRight: '4px' }}>
          Filter Route:
        </span>
        {['all', '/home', '/movies', '/watch', '/search'].map((route) => (
          <button
            key={route}
            type="button"
            className={`btn btn-sm ${selectedRoute === route ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedRoute(route)}
            style={{ fontSize: '0.75rem', padding: '3px 10px' }}
          >
            {route === 'all' ? 'All Pages' : route}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            Device:
          </span>
          {(['all', 'desktop', 'mobile', 'tablet'] as const).map((dev) => (
            <button
              key={dev}
              type="button"
              className={`btn btn-sm ${selectedDevice === dev ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedDevice(dev)}
              style={{ fontSize: '0.75rem', padding: '3px 10px', textTransform: 'capitalize' }}
            >
              {dev}
            </button>
          ))}
        </div>
      </div>

      {/* Performance By Page Table */}
      {data && (
        <div
          className="card"
          style={{
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-surface-base)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Performance By Page (p75)
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
              {data.byPage.length} routes tracked
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '8px 12px' }}>Page Path</th>
                  <th style={{ padding: '8px 12px' }}>Samples</th>
                  <th style={{ padding: '8px 12px' }}>LCP</th>
                  <th style={{ padding: '8px 12px' }}>INP</th>
                  <th style={{ padding: '8px 12px' }}>CLS</th>
                  <th style={{ padding: '8px 12px' }}>FCP</th>
                  <th style={{ padding: '8px 12px' }}>TTFB</th>
                </tr>
              </thead>
              <tbody>
                {data.byPage.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      No page performance data recorded for this period.
                    </td>
                  </tr>
                ) : (
                  data.byPage.map((page) => (
                    <tr
                      key={page.path}
                      style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                      onClick={() => setSelectedRoute(page.path === selectedRoute ? 'all' : page.path)}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--color-accent)' }}>
                        {page.path}
                      </td>
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {page.count}
                      </td>
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMetricValue('lcp', page.lcp)}
                      </td>
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMetricValue('inp', page.inp)}
                      </td>
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMetricValue('cls', page.cls)}
                      </td>
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMetricValue('fcp', page.fcp)}
                      </td>
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatMetricValue('ttfb', page.ttfb)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Device & Country Breakdown Grid */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
          {/* Performance By Device */}
          <div
            className="card"
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-surface-base)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-3)' }}>
              <Monitor size={18} style={{ color: 'var(--color-accent)' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                Performance By Device
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {data.byDevice.map((dev) => (
                <div
                  key={dev.device}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-surface-subtle)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {dev.device === 'desktop' ? <Monitor size={14} /> : dev.device === 'mobile' ? <Smartphone size={14} /> : <Tablet size={14} />}
                    <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{dev.device}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>({dev.count})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem' }}>
                    <span>LCP: <strong>{formatMetricValue('lcp', dev.lcp)}</strong></span>
                    <span>INP: <strong>{formatMetricValue('inp', dev.inp)}</strong></span>
                    <span>CLS: <strong>{formatMetricValue('cls', dev.cls)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance By Country */}
          <div
            className="card"
            style={{
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-surface-base)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-3)' }}>
              <Globe size={18} style={{ color: 'var(--color-accent)' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                Performance By Country
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '240px', overflowY: 'auto' }}>
              {data.byCountry.length === 0 ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No country metrics available</span>
              ) : (
                data.byCountry.map((c) => (
                  <div
                    key={c.countryCode}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-surface-subtle)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>{c.countryName}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>({c.countryCode})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontVariantNumeric: 'tabular-nums', fontSize: '0.75rem' }}>
                      <span>LCP: <strong>{formatMetricValue('lcp', c.lcp)}</strong></span>
                      <span>TTFB: <strong>{formatMetricValue('ttfb', c.ttfb)}</strong></span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
