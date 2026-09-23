import React, { useState, useRef } from 'react';
import { TrendingUp, Users, Layers, Eye, Calendar } from 'lucide-react';
import { TimeseriesResponse } from '../lib/api.js';
import { ChartSkeleton } from './Skeleton.js';
import { WidgetError } from './WidgetError.js';

interface TrafficChartProps {
  data: TimeseriesResponse | null;
  metric?: 'visitors' | 'sessions' | 'views';
  onChangeMetric?: (m: 'visitors' | 'sessions' | 'views') => void;
  resolution?: 'auto' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  onChangeResolution?: (r: 'auto' | 'hourly' | 'daily' | 'weekly' | 'monthly') => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  comparisonLabel?: string;
  comparison?: any;
}

export const TrafficChart: React.FC<TrafficChartProps> = ({
  data,
  metric = 'visitors',
  onChangeMetric,
  resolution = 'auto',
  onChangeResolution,
  loading,
  error,
  onRetry,
  comparisonLabel = 'Previous Period',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (loading) {
    return <ChartSkeleton />;
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 'var(--space-5)', minHeight: '300px' }}>
        <WidgetError message={error} onRetry={onRetry} height="240px" />
      </div>
    );
  }

  const series = data?.series || [];
  const hasData = series.length > 0 && series.some((p) => p.value > 0 || (p.comparisonValue && p.comparisonValue > 0));

  // Find max value for Y-axis scale
  let maxVal = 0;
  for (const p of series) {
    if (p.value > maxVal) maxVal = p.value;
    if (p.comparisonValue && p.comparisonValue > maxVal) maxVal = p.comparisonValue;
  }
  if (maxVal <= 0) maxVal = 10;
  const tickStep = Math.ceil(maxVal / 4);
  const effectiveMax = tickStep * 4;

  // Chart SVG Dimensions
  const svgWidth = 800;
  const svgHeight = 260;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const getX = (idx: number) => {
    if (series.length <= 1) return padLeft + chartW / 2;
    return padLeft + (idx / (series.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    const clamped = Math.max(0, Math.min(effectiveMax, val));
    return padTop + (1 - clamped / effectiveMax) * chartH;
  };

  // Build SVG path strings
  let primaryPath = '';
  let primaryArea = '';
  let comparisonPath = '';

  if (series.length > 0) {
    const points = series.map((p, i) => `${getX(i)},${getY(p.value)}`);
    primaryPath = `M ${points.join(' L ')}`;
    primaryArea = `M ${getX(0)},${padTop + chartH} L ${points.join(' L ')} L ${getX(series.length - 1)},${padTop + chartH} Z`;

    const hasComparison = series.some((p) => p.comparisonValue !== undefined && p.comparisonValue !== null);
    if (hasComparison) {
      const compPoints = series.map((p, i) => `${getX(i)},${getY(p.comparisonValue ?? 0)}`);
      comparisonPath = `M ${compPoints.join(' L ')}`;
    }
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!series.length || !containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = (clientX - (padLeft / svgWidth) * rect.width) / ((chartW / svgWidth) * rect.width);
    const rawIdx = Math.round(ratio * (series.length - 1));
    const clampedIdx = Math.max(0, Math.min(series.length - 1, rawIdx));
    setHoverIndex(clampedIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint = hoverIndex !== null && series[hoverIndex] ? series[hoverIndex] : null;

  return (
    <div className="card" style={{ padding: 'var(--space-5)' }} ref={containerRef}>
      {/* Chart Header: Title, Metric Switcher, Resolution, Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <TrendingUp size={18} style={{ color: 'var(--color-accent)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Traffic Trend
            </h3>
          </div>

          {/* Metric Selector Pills */}
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '2px',
            }}
          >
            {[
              { id: 'visitors', label: 'Visitors', icon: Users },
              { id: 'sessions', label: 'Sessions', icon: Layers },
              { id: 'views', label: 'Page Views', icon: Eye },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = metric === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangeMetric?.(m.id as any)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 600 : 500,
                    backgroundColor: isSelected ? 'var(--color-surface-hover)' : 'transparent',
                    color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <Icon size={12} style={{ color: isSelected ? 'var(--color-accent)' : 'inherit' }} />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right side: Legend & Resolution Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '3px', borderRadius: '1px', backgroundColor: 'var(--color-accent)', display: 'inline-block' }} />
              <span>Current</span>
            </div>
            {comparisonPath && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '2px', borderRadius: '1px', borderTop: '2px dashed var(--color-text-muted)', display: 'inline-block' }} />
                <span>{comparisonLabel}</span>
              </div>
            )}
          </div>

          {/* Resolution Pills */}
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '2px',
            }}
          >
            {(['auto', 'hourly', 'daily', 'weekly', 'monthly'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChangeResolution?.(r)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.6875rem',
                  fontWeight: resolution === r ? 600 : 500,
                  backgroundColor: resolution === r ? 'var(--color-surface-hover)' : 'transparent',
                  color: resolution === r ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {r === 'auto' && data ? `Auto (${data.resolution})` : r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main SVG Chart Area */}
      {!hasData ? (
        <div
          style={{
            height: '240px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            color: 'var(--color-text-muted)',
            fontSize: '0.875rem',
          }}
        >
          <Calendar size={28} style={{ opacity: 0.5 }} />
          <span>No traffic data recorded in selected range.</span>
        </div>
      ) : (
        <div style={{ position: 'relative', width: '100%' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            role="img"
            aria-label={`Traffic trend showing ${metric}`}
          >
            <defs>
              <linearGradient id="primaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Y-Axis Horizontal Grid Lines & Ticks */}
            {[0, 1, 2, 3, 4].map((i) => {
              const tickVal = tickStep * (4 - i);
              const yPos = padTop + (i / 4) * chartH;
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={yPos}
                    x2={padLeft + chartW}
                    y2={yPos}
                    stroke="var(--color-border)"
                    strokeDasharray={i === 4 ? 'none' : '3 3'}
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={yPos + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--color-text-muted)"
                    fontFamily="var(--font-mono)"
                  >
                    {tickVal.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* X-Axis Date Labels */}
            {series.map((p, i) => {
              const total = series.length;
              const step = Math.max(1, Math.floor(total / 6));
              if (i % step !== 0 && i !== total - 1) return null;
              const xPos = getX(i);
              return (
                <text
                  key={i}
                  x={xPos}
                  y={padTop + chartH + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--color-text-muted)"
                  fontFamily="var(--font-mono)"
                >
                  {p.label}
                </text>
              );
            })}

            {/* Comparison Line (Dashed) */}
            {comparisonPath && (
              <path
                d={comparisonPath}
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="1.8"
                strokeDasharray="4 4"
                opacity="0.75"
              />
            )}

            {/* Primary Area Fill */}
            {primaryArea && <path d={primaryArea} fill="url(#primaryAreaGrad)" />}

            {/* Primary Solid Line */}
            {primaryPath && (
              <path
                d={primaryPath}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Hover Crosshair & Indicator Point */}
            {hoverIndex !== null && activePoint && (
              <g>
                <line
                  x1={getX(hoverIndex)}
                  y1={padTop}
                  x2={getX(hoverIndex)}
                  y2={padTop + chartH}
                  stroke="var(--color-accent)"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  opacity="0.8"
                />

                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(activePoint.value)}
                  r="5"
                  fill="var(--color-surface-base)"
                  stroke="var(--color-accent)"
                  strokeWidth="2.5"
                />

                {activePoint.comparisonValue !== undefined && activePoint.comparisonValue !== null && (
                  <circle
                    cx={getX(hoverIndex)}
                    cy={getY(activePoint.comparisonValue)}
                    r="4"
                    fill="var(--color-surface-base)"
                    stroke="var(--color-text-muted)"
                    strokeWidth="2"
                  />
                )}
              </g>
            )}
          </svg>

          {/* Floating Tooltip Box */}
          {hoverIndex !== null && activePoint && (
            <div
              style={{
                position: 'absolute',
                left: `${(getX(hoverIndex) / svgWidth) * 100}%`,
                top: '10px',
                transform: getX(hoverIndex) > svgWidth * 0.7 ? 'translateX(-105%)' : 'translateX(10px)',
                pointerEvents: 'none',
                backgroundColor: 'var(--color-surface-base)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2) var(--space-3)',
                boxShadow: 'var(--shadow-md)',
                zIndex: 30,
                minWidth: '140px',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                {activePoint.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)' }}>
                  Current:
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {activePoint.value.toLocaleString()}
                </span>
              </div>
              {activePoint.comparisonValue !== undefined && activePoint.comparisonValue !== null && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                    marginTop: '2px',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <span>Previous:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {activePoint.comparisonValue.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
