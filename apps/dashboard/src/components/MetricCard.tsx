import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, LucideIcon, Info } from 'lucide-react';
import { CardSkeleton } from './Skeleton.js';
import { WidgetError } from './WidgetError.js';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon | React.ComponentType<{ size?: number; color?: string }> | React.ReactNode;
  iconColor?: string;
  change?: number | null; // percentage change, e.g. +12.4 or -5.2
  changePercent?: number | null;
  comparisonValue?: string;
  invertChangeColor?: boolean; // e.g. for Bounce Rate, lower is good!
  comparisonLabel?: string;
  subtext?: string;
  infoTooltip?: string;
  tooltip?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  iconColor = 'var(--color-accent)',
  change,
  changePercent,
  comparisonValue,
  invertChangeColor = false,
  comparisonLabel = 'vs prev. period',
  subtext,
  infoTooltip,
  tooltip,
  loading,
  error,
  onRetry,
}) => {
  const effectiveChange = change !== undefined ? change : changePercent;
  const effectiveTooltip = infoTooltip || tooltip;

  const renderIcon = () => {
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null)) {
      const IconComponent = icon as React.ComponentType<{ size?: number; color?: string }>;
      return <IconComponent size={16} color={iconColor} />;
    }
    return null;
  };

  if (loading) {
    return <CardSkeleton />;
  }

  if (error) {
    return (
      <div className="card kpi-card">
        <div className="kpi-header">
          <span className="kpi-title">{title}</span>
          <div className="kpi-icon-wrap">{renderIcon()}</div>
        </div>
        <WidgetError message={error} onRetry={onRetry} height="80px" />
      </div>
    );
  }

  // Calculate change styling
  let isPositive = false;
  let isNegative = false;
  let isZero = true;

  if (effectiveChange !== undefined && effectiveChange !== null) {
    if (effectiveChange > 0) {
      isPositive = true;
      isZero = false;
    } else if (effectiveChange < 0) {
      isNegative = true;
      isZero = false;
    }
  }

  // Determine good vs bad based on invertChangeColor (e.g. bounce rate decreasing is good)
  const isGood = invertChangeColor ? isNegative : isPositive;
  const isBad = invertChangeColor ? isPositive : isNegative;

  const deltaClass = isZero
    ? 'delta-pill delta-neutral'
    : isGood
    ? 'delta-pill delta-positive'
    : 'delta-pill delta-negative';

  return (
    <div className="card kpi-card card-hover">
      <div>
        <div className="kpi-header">
          <span className="kpi-title">{title}</span>
          <div className="kpi-icon-wrap">{renderIcon()}</div>
        </div>

        <div className="kpi-value tabular-nums">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      </div>

      <div className="kpi-footer">
        {effectiveChange !== undefined && effectiveChange !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className={deltaClass}>
              {isPositive ? (
                <ArrowUpRight size={11} strokeWidth={2.5} />
              ) : isNegative ? (
                <ArrowDownRight size={11} strokeWidth={2.5} />
              ) : (
                <Minus size={11} strokeWidth={2.5} />
              )}
              {isPositive ? `+${effectiveChange}%` : `${effectiveChange}%`}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
              {comparisonValue ? `vs ${comparisonValue}` : comparisonLabel}
            </span>
          </div>
        ) : subtext ? (
          <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
            {subtext}
          </span>
        ) : (
          <div />
        )}

        {effectiveTooltip && (
          <span
            title={effectiveTooltip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
              cursor: 'help',
              marginLeft: 'auto',
            }}
            aria-label={effectiveTooltip}
          >
            <Info size={12} />
          </span>
        )}
      </div>
    </div>
  );
};
