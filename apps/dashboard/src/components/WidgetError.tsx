import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface WidgetErrorProps {
  message?: string;
  onRetry?: () => void;
  height?: string | number;
}

export const WidgetError: React.FC<WidgetErrorProps> = ({
  message = 'Unable to load data.',
  onRetry,
  height = '140px',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-4)',
        backgroundColor: 'var(--color-surface-subtle)',
        borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--color-border)',
        minHeight: height,
        textAlign: 'center',
      }}
    >
      <AlertCircle size={20} color="var(--color-danger)" />
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', maxWidth: '280px' }}>
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 'var(--space-1)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <RotateCcw size={13} />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
