import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CalendarCheck,
  Users,
  Repeat,
  Info,
  Calendar,
} from 'lucide-react';
import {
  Project,
  api,
  RetentionResponse,
  RetentionCohortRow,
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
import { TableSkeleton } from '../components/Skeleton.js';
import { WidgetError } from '../components/WidgetError.js';

interface RetentionViewProps {
  project: Project | null;
}

export const RetentionView: React.FC<RetentionViewProps> = ({ project }) => {
  const initialUrlState = useRef(parseDashboardUrlState());

  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);

  // Cohort granularity: 'day' | 'week' | 'month'
  const [cohortType, setCohortType] = useState<'day' | 'week' | 'month'>('week');

  // Data States
  const [retentionData, setRetentionData] = useState<RetentionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    updateDashboardUrlState({
      range: dateRangePreset,
      from: customFrom,
      to: customTo,
    });
  }, [dateRangePreset, customFrom, customTo]);

  const getDates = useCallback(() => {
    return calculatePresetDateRange(dateRangePreset, customFrom, customTo);
  }, [dateRangePreset, customFrom, customTo]);

  const fetchRetention = useCallback(async () => {
    if (!project?.site_id) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getRetention(project.site_id, {
        cohortType,
        from,
        to,
      });
      setRetentionData(res);
    } catch (err: any) {
      setError(err.message || 'Unable to calculate cohort retention.');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, cohortType, getDates]);

  useEffect(() => {
    fetchRetention();
  }, [fetchRetention]);

  const cohorts = retentionData?.cohorts || [];
  const maxPeriods = Math.max(...cohorts.map((c) => c.retention.length), 0);

  // Average Period 1 retention
  const period1Cohorts = cohorts.filter((c) => c.retention.length > 1);
  const avgPeriod1 =
    period1Cohorts.length > 0
      ? period1Cohorts.reduce((acc, c) => acc + (c.retention[1]?.percentage || 0), 0) / period1Cohorts.length
      : 0;

  const getHeatmapColor = (pct: number) => {
    if (pct === 0) return 'transparent';
    if (pct < 15) return 'rgba(34, 197, 94, 0.15)';
    if (pct < 30) return 'rgba(34, 197, 94, 0.3)';
    if (pct < 50) return 'rgba(34, 197, 94, 0.5)';
    return 'rgba(34, 197, 94, 0.75)';
  };

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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Cohort Retention</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
              Track visitor return rates and engagement over days, weeks, and months.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm ${cohortType === 'day' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setCohortType('day')}
              >
                Daily
              </button>
              <button
                type="button"
                className={`btn btn-sm ${cohortType === 'week' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setCohortType('week')}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`btn btn-sm ${cohortType === 'month' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setCohortType('month')}
              >
                Monthly
              </button>
            </div>

            <DateRangeSelector
              preset={dateRangePreset}
              customFrom={customFrom}
              customTo={customTo}
              comparison="none"
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
              onComparisonChange={() => {}}
            />
          </div>
        </div>
      </div>

      {/* Info Callout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-surface-subtle)',
          border: '1px solid var(--color-border)',
          fontSize: '0.8125rem',
          color: 'var(--color-text-secondary)',
        }}
      >
        <Info size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span>
          Cohorts group visitors by the date or week they first appeared. Each subsequent column shows the percentage of that cohort who returned and generated active sessions.
        </span>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <MetricCard
          title="Average Next-Period Retention"
          value={avgPeriod1 > 0 ? `${avgPeriod1.toFixed(1)}%` : '—'}
          tooltip="Average percentage of users returning in the period immediately following their first visit."
          icon={<Repeat size={16} />}
        />
        <MetricCard
          title="Active Cohorts Tracked"
          value={cohorts.length.toLocaleString()}
          tooltip="Number of distinct cohort groupings analyzed."
          icon={<CalendarCheck size={16} />}
        />
        <MetricCard
          title="Total Cohort Users"
          value={cohorts.reduce((acc, c) => acc + c.cohortSize, 0).toLocaleString()}
          tooltip="Total users across all identified cohorts."
          icon={<Users size={16} />}
        />
      </div>

      {/* Cohort Heatmap Table */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Retention Matrix ({cohortType})</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Showing {cohorts.length} cohorts
          </span>
        </div>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : error ? (
          <WidgetError message={error} height="240px" onRetry={fetchRetention} />
        ) : cohorts.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No cohort data available for this date range.
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: '130px' }}>Cohort</th>
                  <th style={{ minWidth: '80px', textAlign: 'right' }}>Users</th>
                  {Array.from({ length: Math.min(maxPeriods, 8) }).map((_, pIdx) => (
                    <th key={pIdx} style={{ minWidth: '70px', textAlign: 'center' }}>
                      {cohortType === 'day' ? `+${pIdx}d` : cohortType === 'week' ? `+${pIdx}w` : `+${pIdx}m`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <td style={{ fontWeight: 600, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {row.cohortDate}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem' }}>
                      {row.cohortSize.toLocaleString()}
                    </td>
                    {Array.from({ length: Math.min(maxPeriods, 8) }).map((_, pIdx) => {
                      const point = row.retention.find((r) => r.periodIndex === pIdx);
                      if (!point) {
                        return (
                          <td key={pIdx} style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                            —
                          </td>
                        );
                      }

                      return (
                        <td
                          key={pIdx}
                          style={{
                            textAlign: 'center',
                            backgroundColor: getHeatmapColor(point.percentage),
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                          title={`${point.percentage.toFixed(1)}% (${point.returningCount} users)`}
                        >
                          {point.percentage.toFixed(1)}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
