import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitMerge,
  Plus,
  Trash2,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  Layers,
  Filter,
} from 'lucide-react';
import {
  Project,
  api,
  FunnelStep,
  FunnelResponse,
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

interface FunnelsViewProps {
  project: Project | null;
}

const DEFAULT_STEPS: FunnelStep[] = [
  { name: 'Landing Page', type: 'pageview', target: '/' },
  { name: 'Sign Up', type: 'pageview', target: '/signup' },
  { name: 'Dashboard', type: 'pageview', target: '/dashboard' },
];

export const FunnelsView: React.FC<FunnelsViewProps> = ({ project }) => {
  const initialUrlState = useRef(parseDashboardUrlState());

  const [dateRangePreset, setDateRangePreset] = useState<TimeRangePreset>(initialUrlState.current.range);
  const [customFrom, setCustomFrom] = useState<string | undefined>(initialUrlState.current.from);
  const [customTo, setCustomTo] = useState<string | undefined>(initialUrlState.current.to);
  const [comparison, setComparison] = useState<ComparisonType>(initialUrlState.current.compare);
  const [filters, setFilters] = useState<FilterClause[]>(initialUrlState.current.filters);

  // Funnel Steps Configuration
  const [steps, setSteps] = useState<FunnelStep[]>(DEFAULT_STEPS);

  // Data States
  const [funnelData, setFunnelData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchFunnel = useCallback(async () => {
    if (!project?.site_id || steps.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getDates();
      const res = await api.getFunnels(project.site_id, steps, {
        from,
        to,
        filters: filters.length > 0 ? filters : undefined,
      });
      setFunnelData(res);
    } catch (err: any) {
      setError(err.message || 'Unable to calculate funnel conversion.');
    } finally {
      setLoading(false);
    }
  }, [project?.site_id, steps, getDates, filters]);

  useEffect(() => {
    fetchFunnel();
  }, [fetchFunnel]);

  const handleAddStep = () => {
    const nextIdx = steps.length + 1;
    setSteps((prev) => [
      ...prev,
      { name: `Step ${nextIdx}`, type: 'pageview', target: `/step-${nextIdx}` },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateStep = (index: number, field: keyof FunnelStep, value: string) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, [field]: value } : step))
    );
  };

  if (!project) {
    return (
      <EmptyAnalytics
        title="Conversion Funnels"
        description="Select or create a project to configure multi-step funnels and track conversion drop-offs."
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
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Conversion Funnels</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 'var(--space-1) 0 0' }}>
              Sequential multi-step conversion analysis to identify step-by-step drop-off and conversion rates.
            </p>
          </div>

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

        <FilterBar filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <MetricCard
          title="Overall Conversion Rate"
          value={funnelData ? `${funnelData.overallConversionRate.toFixed(1)}%` : '—'}
          tooltip="Percentage of visitors who started step 1 and completed the final funnel step."
          icon={<CheckCircle2 size={16} />}
        />
        <MetricCard
          title="Total Funnel Starts"
          value={funnelData ? funnelData.totalStarted.toLocaleString() : '—'}
          tooltip="Visitors who entered Step 1 of the funnel."
          icon={<GitMerge size={16} />}
        />
        <MetricCard
          title="Total Completed"
          value={funnelData ? funnelData.totalCompleted.toLocaleString() : '—'}
          tooltip="Visitors who reached the final objective."
          icon={<CheckCircle2 size={16} />}
        />
      </div>

      {/* Funnel Builder Configurator Card */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Layers size={16} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Funnel Step Sequence</h3>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleAddStep}
          >
            <Plus size={14} />
            <span>Add Step</span>
          </button>
        </div>

        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {steps.map((step, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-subtle)',
                border: '1px solid var(--color-border)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, width: '60px' }}>Step {idx + 1}</span>

              <input
                type="text"
                className="input input-sm"
                style={{ width: '180px' }}
                placeholder="Step Name (e.g. Landing)"
                value={step.name}
                onChange={(e) => handleUpdateStep(idx, 'name', e.target.value)}
              />

              <select
                className="select select-sm"
                value={step.type}
                onChange={(e) => handleUpdateStep(idx, 'type', e.target.value as any)}
              >
                <option value="pageview">Page View</option>
                <option value="event">Custom Event</option>
              </select>

              <input
                type="text"
                className="input input-sm"
                style={{ flex: 1, minWidth: '160px', fontFamily: 'monospace' }}
                placeholder={step.type === 'pageview' ? '/path' : 'event_name'}
                value={step.target}
                onChange={(e) => handleUpdateStep(idx, 'target', e.target.value)}
              />

              {steps.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  title="Remove step"
                  onClick={() => handleRemoveStep(idx)}
                >
                  <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Visual Funnel Progression */}
      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Funnel Visual Flow</h3>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--space-6)' }}><TableSkeleton rows={4} /></div>
        ) : error ? (
          <WidgetError message={error} height="200px" onRetry={fetchFunnel} />
        ) : !funnelData || funnelData.steps.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No traffic recorded through these funnel steps.
          </div>
        ) : (
          <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {funnelData.steps.map((st, idx) => {
              const started = funnelData.totalStarted || 1;
              const barPercent = Math.max(8, Math.round((st.visitors / started) * 100));

              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>Step {st.stepIndex}</span>
                      <strong style={{ fontSize: '0.9375rem' }}>{st.name}</strong>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>({st.target})</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', fontSize: '0.875rem' }}>
                      <span><strong>{st.visitors.toLocaleString()}</strong> visitors</span>
                      <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{st.conversionRate.toFixed(1)}%</span>
                      {st.dropOffRate > 0 && (
                        <span style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>
                          -{st.dropOffRate.toFixed(1)}% drop-off ({st.dropOffCount})
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '24px', backgroundColor: 'var(--color-surface-hover)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${barPercent}%`,
                        height: '100%',
                        backgroundColor: 'var(--color-accent)',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
