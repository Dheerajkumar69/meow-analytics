import React from 'react';
import { PageItem } from '@meow-analytics/shared';
import { TableSkeleton } from './Skeleton.js';
import { WidgetError } from './WidgetError.js';
import { ArrowUpDown, ArrowUp, ArrowDown, FileText } from 'lucide-react';

interface TopPagesTableProps {
  pages: PageItem[];
  totalViews?: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  sortBy: 'visitors' | 'page_views' | 'sessions';
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: 'visitors' | 'page_views' | 'sessions') => void;
  onFilterPath?: (path: string) => void;
}

export const TopPagesTable: React.FC<TopPagesTableProps> = ({
  pages,
  loading,
  error,
  onRetry,
  sortBy,
  sortOrder,
  onSortChange,
  onFilterPath,
}) => {
  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  if (error) {
    return <WidgetError message={error} onRetry={onRetry} height="200px" />;
  }

  const renderSortIcon = (column: 'visitors' | 'page_views' | 'sessions') => {
    if (sortBy !== column) {
      return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    }
    return sortOrder === 'desc' ? (
      <ArrowDown size={12} style={{ color: 'var(--color-accent)' }} />
    ) : (
      <ArrowUp size={12} style={{ color: 'var(--color-accent)' }} />
    );
  };

  const maxViews = Math.max(...pages.map((p) => p.pageViews || 0), 1);

  return (
    <div className="card" style={{ width: '100%' }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FileText size={16} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Top Pages</h3>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {pages.length} {pages.length === 1 ? 'page' : 'pages'}
        </span>
      </div>

      <div className="table-container">
        {pages.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No page traffic recorded for this period.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Path</th>
                <th
                  style={{ width: '18%', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => onSortChange('visitors')}
                  title="Click to sort by unique visitors"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                    <span>Visitors</span>
                    {renderSortIcon('visitors')}
                  </div>
                </th>
                <th
                  style={{ width: '18%', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => onSortChange('page_views')}
                  title="Click to sort by page views"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                    <span>Views</span>
                    {renderSortIcon('page_views')}
                  </div>
                </th>
                <th
                  style={{ width: '19%', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => onSortChange('sessions')}
                  title="Click to sort by sessions"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                    <span>Sessions</span>
                    {renderSortIcon('sessions')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, idx) => {
                const percent = Math.min(100, Math.round(((p.pageViews || 0) / maxViews) * 100));
                return (
                  <tr key={idx} style={{ position: 'relative' }}>
                    <td style={{ position: 'relative' }}>
                      {/* Background Bar */}
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
                          zIndex: 0,
                          pointerEvents: 'none',
                        }}
                      />
                      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            color: 'var(--color-text-primary)',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={p.path}
                        >
                          {p.path}
                        </span>
                        {onFilterPath && (
                          <button
                            type="button"
                            onClick={() => onFilterPath(p.path)}
                            title={`Filter by path: ${p.path}`}
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 5px', fontSize: '0.7rem', opacity: 0.7 }}
                          >
                            Filter
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8125rem' }}>
                      {p.visitors.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8125rem' }}>
                      {p.pageViews.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.8125rem' }}>
                      {p.sessions.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
