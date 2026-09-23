import React, { useState } from 'react';
import { Plus, X, Filter, Trash2 } from 'lucide-react';
import { FilterClause, FilterField, FilterOperator } from '@meow-analytics/shared';

interface FilterBarProps {
  filters: FilterClause[];
  onFiltersChange: (filters: FilterClause[]) => void;
}

const FILTER_FIELDS: { key: FilterField; label: string; placeholder: string }[] = [
  { key: 'path', label: 'Path', placeholder: 'e.g. /pricing or /blog' },
  { key: 'route', label: 'Route', placeholder: 'e.g. /blog/:slug' },
  { key: 'country', label: 'Country', placeholder: 'e.g. US, IN, DE' },
  { key: 'device', label: 'Device', placeholder: 'e.g. desktop, mobile, tablet' },
  { key: 'os', label: 'OS', placeholder: 'e.g. macOS, Windows, Linux, iOS' },
  { key: 'browser', label: 'Browser', placeholder: 'e.g. Chrome, Firefox, Safari' },
  { key: 'referrer', label: 'Referrer', placeholder: 'e.g. google.com, twitter.com' },
  { key: 'source', label: 'Source', placeholder: 'e.g. Google, Direct, GitHub' },
  { key: 'utm_source', label: 'UTM Source', placeholder: 'e.g. newsletter, producthunt' },
  { key: 'utm_medium', label: 'UTM Medium', placeholder: 'e.g. email, cpc, social' },
  { key: 'utm_campaign', label: 'UTM Campaign', placeholder: 'e.g. summer_sale, launch' },
];

const OPERATORS: { key: FilterOperator; label: string; symbol: string }[] = [
  { key: 'equals', label: 'equals', symbol: '=' },
  { key: 'not_equals', label: 'not equals', symbol: '≠' },
  { key: 'contains', label: 'contains', symbol: '∋' },
  { key: 'starts_with', label: 'starts with', symbol: '^=' },
  { key: 'ends_with', label: 'ends with', symbol: '$=' },
];

export const FilterBar: React.FC<FilterBarProps> = ({ filters, onFiltersChange }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedField, setSelectedField] = useState<FilterField>('path');
  const [selectedOp, setSelectedOp] = useState<FilterOperator>('equals');
  const [filterValue, setFilterValue] = useState('');

  const handleAddFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterValue.trim()) return;

    const newFilter: FilterClause = {
      field: selectedField,
      operator: selectedOp,
      value: filterValue.trim(),
    };

    onFiltersChange([...filters, newFilter]);
    setFilterValue('');
    setIsAdding(false);
  };

  const handleRemoveFilter = (index: number) => {
    const updated = filters.filter((_, i) => i !== index);
    onFiltersChange(updated);
  };

  const handleClearAll = () => {
    onFiltersChange([]);
  };

  const currentFieldDef = FILTER_FIELDS.find((f) => f.key === selectedField);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        backgroundColor: 'var(--color-surface-base)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-3) var(--space-4)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)', color: 'var(--color-text-secondary)', fontSize: '0.8125rem', fontWeight: 600 }}>
            <Filter size={14} style={{ color: 'var(--color-accent)' }} />
            <span>Filters:</span>
          </div>

          {filters.length === 0 && !isAdding && (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              No active filters (showing all traffic)
            </span>
          )}

          {/* Active Filter Badges */}
          {filters.map((f, idx) => {
            const fieldLabel = FILTER_FIELDS.find((item) => item.key === f.field)?.label || f.field;
            const opSymbol = OPERATORS.find((op) => op.key === f.operator)?.symbol || f.operator;

            return (
              <div
                key={idx}
                id={`filter-pill-${idx}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1-5)',
                  backgroundColor: 'var(--color-surface-subtle)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.1875rem 0.625rem',
                  fontSize: '0.75rem',
                  animation: 'fadeIn 120ms ease-out',
                }}
              >
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{fieldLabel}</span>
                <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{opSymbol}</span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>"{f.value}"</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter(idx)}
                  title={`Remove filter: ${fieldLabel}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '1px',
                    marginLeft: '2px',
                    borderRadius: 'var(--radius-full)',
                  }}
                  aria-label={`Remove filter: ${fieldLabel}`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {/* Add Filter Button */}
          {!isAdding && (
            <button
              id="add-filter-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsAdding(true)}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', minHeight: '28px' }}
            >
              <Plus size={12} style={{ color: 'var(--color-accent)' }} />
              <span>Add Filter</span>
            </button>
          )}
        </div>

        {/* Clear All Button */}
        {filters.length > 0 && (
          <button
            id="clear-filters-btn"
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleClearAll}
            style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}
          >
            <Trash2 size={12} />
            <span>Clear all ({filters.length})</span>
          </button>
        )}
      </div>

      {/* Filter Creator Inline Form */}
      {isAdding && (
        <form
          id="filter-creator-form"
          onSubmit={handleAddFilter}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            paddingTop: 'var(--space-2)',
            borderTop: '1px dashed var(--color-border)',
            animation: 'fadeIn 150ms ease-out',
          }}
        >
          {/* Field Selection */}
          <select
            id="filter-field-select"
            className="select"
            value={selectedField}
            onChange={(e) => setSelectedField(e.target.value as FilterField)}
            style={{ width: 'auto', minWidth: '130px', fontSize: '0.75rem', padding: '0.25rem 0.5rem', minHeight: '30px' }}
            aria-label="Filter dimension"
          >
            {FILTER_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Operator Selection */}
          <select
            id="filter-operator-select"
            className="select"
            value={selectedOp}
            onChange={(e) => setSelectedOp(e.target.value as FilterOperator)}
            style={{ width: 'auto', minWidth: '120px', fontSize: '0.75rem', padding: '0.25rem 0.5rem', minHeight: '30px' }}
            aria-label="Filter operator"
          >
            {OPERATORS.map((op) => (
              <option key={op.key} value={op.key}>
                {op.label} ({op.symbol})
              </option>
            ))}
          </select>

          {/* Value Input */}
          <input
            id="filter-value-input"
            type="text"
            className="input"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            placeholder={currentFieldDef?.placeholder || 'Enter value...'}
            autoFocus
            style={{ flex: '1 1 180px', minWidth: '140px', fontSize: '0.75rem', padding: '0.25rem 0.5rem', minHeight: '30px' }}
            aria-label="Filter value"
          />

          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button
              id="submit-filter-btn"
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!filterValue.trim()}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', minHeight: '30px' }}
            >
              Add
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setIsAdding(false);
                setFilterValue('');
              }}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minHeight: '30px' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
