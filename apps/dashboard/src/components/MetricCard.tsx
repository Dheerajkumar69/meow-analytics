import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, LucideIcon, Info } from 'lucide-react';
import { CardSkeleton } from './Skeleton.js';
import { WidgetError } from './WidgetError.js';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  change?: number | null; // percentage change, e.g. +12.4 or -5.2
  invertChangeColor?: boolean; // e.g. for Bounce Rate, lower is good!
  comparisonLabel?: string;
  subtext?: string;
  infoTooltip?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor = 'var(--color-accent)',
  change,
  invertChangeColor = false,
  comparisonLabel = 'vs prev. period',
  subtext,
  infoTooltip,
  loading,
  error,
  onRetry,
}) => {
  if (loading) {
    return <CardSkeleton />;
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {title}
          </span>
          <Icon size={16} color={iconColor} />
        </div>
        <WidgetError message={error} onRetry={onRetry} height="80px" />
      </div>
    );
  }

  // Calculate change styling
  let isPositive = false;
  let isNegative = false;
  let isZero = true;

  if (change !== undefined && change !== null) {
    if (change > 0) {
      isPositive = true;
      isZero = false;
    } else if (change < 0) {
      isNegative = true;
      isZero = false;
    }
  }

  // Determine good vs bad based on invertChangeColor (e.g. bounce rate decreasing is good)
  const isGood = invertChangeColor ? isNegative : isPositive;
  const isBad = invertChangeColor ? isPositive : isNegative;

  const deltaBg = isGood
    ? 'var(--color-accent-subtle)'
    : isBad
    ? 'var(--color-danger-subtle)'
    : 'var(--color-surface-hover)';

  const deltaColor = isGood
    ? 'var(--color-accent-text)'
    : isBad
    ? 'var(--color-danger-text)'
    : 'var(--color-text-muted)';

  return (
    <div
      className="card hover-lift"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {title}
          </span>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={16} color={iconColor} />
          </div>
        </div>

        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            margin: 'var(--space-2) 0',
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-primary)',
          }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
        {change !== undefined && change !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: deltaBg,
                color: deltaColor,
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {isPositive ? (
                <ArrowUpRight size={12} />
              ) : isNegative ? (
                <ArrowDownRight size={12} />
              ) : (
                <Minus size={12} />
              )}
              {isPositive ? `+${change}%` : `${change}%`}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
              {comparisonLabel}
            </span>
          </div>
        ) : subtext ? (
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
            {subtext}
          </span>
        ) : null}

        {infoTooltip && (
          <span
            title={infoTooltip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
              cursor: 'help',
              marginLeft: 'auto',
            }}
          >
            <Info size={12} />
          </span>
        )}
      </div>
    </div>
  );
};
