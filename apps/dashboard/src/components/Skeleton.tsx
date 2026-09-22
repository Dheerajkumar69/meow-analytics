import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--radius-sm)',
  className = '',
  style,
}) => {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: 'var(--color-surface-hover)',
        ...style,
      }}
    />
  );
};

export const CardSkeleton: React.FC<{ height?: string | number }> = ({ height }) => {
  return (
    <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', ...(height ? { minHeight: height } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="45%" height="0.875rem" />
        <Skeleton width="18px" height="18px" borderRadius="50%" />
      </div>
      <Skeleton width="60%" height="2rem" style={{ margin: 'var(--space-1) 0' }} />
      <Skeleton width="75%" height="0.75rem" />
    </div>
  );
};

export const ChartSkeleton: React.FC = () => {
  return (
    <div className="card" style={{ padding: 'var(--space-5)', minHeight: '320px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="200px" height="1.25rem" />
        <Skeleton width="160px" height="2rem" borderRadius="var(--radius-md)" />
      </div>
      <Skeleton width="100%" height="220px" borderRadius="var(--radius-md)" />
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width="100%" height="38px" borderRadius="var(--radius-sm)" />
      ))}
    </div>
  );
};
