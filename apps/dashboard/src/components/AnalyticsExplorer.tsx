import React from 'react';
import { BreakdownDimension, BreakdownItem, FilterClause } from '@meow-analytics/shared';
import { TableSkeleton } from './Skeleton.js';
import { WidgetError } from './WidgetError.js';
import { Layers, Globe, Laptop, Compass, Link2, Target, Monitor, FileCode2, LucideIcon, Filter } from 'lucide-react';

interface AnalyticsExplorerProps {
  currentDimension: BreakdownDimension;
  onDimensionChange: (dim: BreakdownDimension) => void;
  items: BreakdownItem[];
  totalViews?: number;
  totalVisitors?: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onAddFilter?: (filter: FilterClause) => void;
}

const DIMENSIONS: { key: BreakdownDimension; label: string; icon: LucideIcon }[] = [
  { key: 'source', label: 'Sources', icon: Compass },
  { key: 'country', label: 'Countries', icon: Globe },
  { key: 'device', label: 'Devices', icon: Laptop },
  { key: 'os', label: 'Operating Systems', icon: Monitor },
  { key: 'browser', label: 'Browsers', icon: Layers },
  { key: 'path', label: 'Paths', icon: FileCode2 },
  { key: 'referrer', label: 'Referrers', icon: Link2 },
  { key: 'utm', label: 'UTM Campaigns', icon: Target },
];

export const AnalyticsExplorer: React.FC<AnalyticsExplorerProps> = ({
  currentDimension,
  onDimensionChange,
  items,
  loading,
  error,
  onRetry,
  onAddFilter,
}) => {
  const maxViews = Math.max(...items.map((i) => i.pageViews || 0), 1);
  const totalViews = items.reduce((acc, curr) => acc + (curr.pageViews || 0), 0);

  const renderContent = () => {
    if (loading) {
      return <TableSkeleton rows={6} />;
    }

    if (error) {
      return <WidgetError message={error} onRetry={onRetry} height="200px" />;
    }

    if (items.length === 0) {
      return (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No data recorded for {DIMENSIONS.find((d) => d.key === currentDimension)?.label.toLowerCase()} in this period.
          </p>
        </div>
      );
    }

    return (
      <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '42%' }}>
                {DIMENSIONS.find((d) => d.key === currentDimension)?.label.replace(/s$/, '') || 'Dimension Item'}
              </th>
              <th style={{ width: '18%', textAlign: 'right' }}>Visitors</th>
              <th style={{ width: '18%', textAlign: 'right' }}>Page Views</th>
              <th style={{ width: '14%', textAlign: 'right' }}>Sessions</th>
              <th style={{ width: '8%', textAlign: 'right' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const displayName = item.label || item.key || '(none)';
              const views = item.pageViews || 0;
              const percent = totalViews > 0 ? Math.round((views / totalViews) * 100) : item.percentage || 0;
              const barPercent = Math.min(100, Math.round((views / maxViews) * 100));

              return (
                <tr key={idx} style={{ position: 'relative' }}>
                  <td style={{ position: 'relative' }}>
                    {/* Visual proportion fill */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '12%',
                        bottom: '12%',
                        width: `${barPercent}%`,
                        backgroundColor: 'var(--color-accent-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        opacity: 0.4,
                        zIndex: 0,
                        pointerEvents: 'none',
                      }}
                    />
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          color: 'var(--color-text-primary)',
                          maxWidth: '280px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={displayName}
                      >
                        {displayName}
                      </span>
                      {onAddFilter && item.key && (
                        <button
                          type="button"
                          onClick={() => {
                            const fieldKey = currentDimension === 'utm' ? 'utm_campaign' : currentDimension;
                            onAddFilter({
                              field: fieldKey as any,
                              operator: 'equals',
                              value: item.key,
                            });
                          }}
                          title={`Filter by ${displayName}`}
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 6px', fontSize: '0.6875rem', minHeight: '22px', color: 'var(--color-accent)' }}
                        >
                          <Filter size={10} style={{ marginRight: '2px' }} />
                          Filter
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="table-cell-numeric">
                    {item.visitors.toLocaleString()}
                  </td>
                  <td className="table-cell-numeric">
                    {views.toLocaleString()}
                  </td>
                  <td className="table-cell-numeric">
                    {item.sessions.toLocaleString()}
                  </td>
                  <td className="table-cell-numeric" style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
                    {percent}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="card" style={{ width: '100%' }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Layers size={16} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>Analytics Explorer & Group By</h3>
        </div>

        {/* Dimension Selector Tabs / Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {DIMENSIONS.map((dim) => {
            const Icon = dim.icon;
            const isSelected = currentDimension === dim.key;
            return (
              <button
                key={dim.key}
                id={`explorer-tab-${dim.key}`}
                type="button"
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => onDimensionChange(dim.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.75rem',
                  minHeight: '28px',
                }}
              >
                <Icon size={12} />
                <span>{dim.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {renderContent()}
    </div>
  );
};
