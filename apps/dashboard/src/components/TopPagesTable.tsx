import React, { useState } from 'react';
import { PageItem } from '@meow-analytics/shared';
import { TableSkeleton } from './Skeleton.js';
import { WidgetError } from './WidgetError.js';
import { ArrowUpDown, ArrowUp, ArrowDown, FileText, Copy, Check, Filter } from 'lucide-react';

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
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  if (loading) {
    return <TableSkeleton rows={6} />;
  }

  if (error) {
    return <WidgetError message={error} onRetry={onRetry} height="200px" />;
  }

  const renderSortIcon = (column: 'visitors' | 'page_views' | 'sessions') => {
    if (sortBy !== column) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35 }} />;
    }
    return sortOrder === 'desc' ? (
      <ArrowDown size={12} style={{ color: 'var(--color-accent)' }} />
    ) : (
      <ArrowUp size={12} style={{ color: 'var(--color-accent)' }} />
    );
  };

  const handleCopy = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  const maxViews = Math.max(...pages.map((p) => p.pageViews || 0), 1);

  return (
    <div className="card" style={{ width: '100%' }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FileText size={16} style={{ color: 'var(--color-accent)' }} />
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0 }}>Top Visited Pages</h3>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          {pages.length} {pages.length === 1 ? 'route' : 'routes'}
        </span>
      </div>

      <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
        {pages.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No page traffic recorded for this period.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '46%' }}>Route Path</th>
                <th
                  style={{ width: '18%', cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}
                  onClick={() => onSortChange('visitors')}
                  title="Sort by unique visitors"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span>Visitors</span>
                    {renderSortIcon('visitors')}
                  </div>
                </th>
                <th
                  style={{ width: '18%', cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}
                  onClick={() => onSortChange('page_views')}
                  title="Sort by page views"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span>Page Views</span>
                    {renderSortIcon('page_views')}
                  </div>
                </th>
                <th
                  style={{ width: '18%', cursor: 'pointer', userSelect: 'none', textAlign: 'right' }}
                  onClick={() => onSortChange('sessions')}
                  title="Sort by total sessions"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span>Sessions</span>
                    {renderSortIcon('sessions')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, idx) => {
                const percent = Math.min(100, Math.round(((p.pageViews || 0) / maxViews) * 100));
                const isCopied = copiedPath === p.path;

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
                          width: `${percent}%`,
                          backgroundColor: 'var(--color-accent-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          opacity: 0.4,
                          zIndex: 0,
                          pointerEvents: 'none',
                        }}
                      />
                      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span
                          className="table-cell-mono"
                          style={{
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            maxWidth: '340px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={p.path}
                        >
                          {p.path}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: 'auto' }}>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(p.path, e)}
                            title="Copy path URL"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 4px', minHeight: '22px', color: 'var(--color-text-muted)' }}
                            aria-label={`Copy path ${p.path}`}
                          >
                            {isCopied ? <Check size={11} style={{ color: 'var(--color-accent)' }} /> : <Copy size={11} />}
                          </button>

                          {onFilterPath && (
                            <button
                              type="button"
                              onClick={() => onFilterPath(p.path)}
                              title={`Filter by path: ${p.path}`}
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 6px', fontSize: '0.6875rem', minHeight: '22px', color: 'var(--color-accent)' }}
                            >
                              <Filter size={10} style={{ marginRight: '2px' }} />
                              Filter
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell-numeric">
                      {p.visitors.toLocaleString()}
                    </td>
                    <td className="table-cell-numeric">
                      {p.pageViews.toLocaleString()}
                    </td>
                    <td className="table-cell-numeric">
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
