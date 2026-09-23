import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { TimeRangePreset } from '../lib/urlState.js';
import { ComparisonType } from '../lib/api.js';

interface DateRangeSelectorProps {
  preset: TimeRangePreset;
  customFrom?: string;
  customTo?: string;
  compare?: ComparisonType;
  comparison?: ComparisonType | string;
  onRangeChange?: (preset: TimeRangePreset, customFrom?: string, customTo?: string) => void;
  onCompareChange?: (compare: ComparisonType) => void;
  onPresetChange?: (preset: TimeRangePreset) => void;
  onCustomDateChange?: (customFrom?: string, customTo?: string) => void;
  onComparisonChange?: (compare: any) => void;
}

const PRESETS: { key: TimeRangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '14d', label: '14 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: '6m', label: '6 months' },
  { key: '12m', label: '12 months' },
  { key: 'custom', label: 'Custom' },
];

const COMPARISONS: { key: ComparisonType; label: string }[] = [
  { key: 'none', label: 'No comparison' },
  { key: 'previous_period', label: 'Previous period' },
  { key: 'previous_year', label: 'Previous year' },
];

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  preset,
  customFrom,
  customTo,
  compare,
  comparison,
  onRangeChange,
  onCompareChange,
  onPresetChange,
  onCustomDateChange,
  onComparisonChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(customFrom || '');
  const [tempTo, setTempTo] = useState(customTo || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeCompare = (compare || (comparison as ComparisonType) || 'previous_period');

  const triggerRangeChange = (newPreset: TimeRangePreset, newFrom?: string, newTo?: string) => {
    if (onRangeChange) {
      onRangeChange(newPreset, newFrom, newTo);
    }
    if (onPresetChange) {
      onPresetChange(newPreset);
    }
    if (onCustomDateChange) {
      onCustomDateChange(newFrom, newTo);
    }
  };

  const triggerCompareChange = (newCompare: ComparisonType) => {
    if (onCompareChange) {
      onCompareChange(newCompare);
    }
    if (onComparisonChange) {
      onComparisonChange(newCompare);
    }
  };

  useEffect(() => {
    setTempFrom(customFrom || '');
    setTempTo(customTo || '');
  }, [customFrom, customTo]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const activePresetLabel = PRESETS.find((p) => p.key === preset)?.label || 'Custom';
  const activeCompareLabel = COMPARISONS.find((c) => c.key === activeCompare)?.label || 'No comparison';

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempFrom && tempTo) {
      triggerRangeChange('custom', tempFrom, tempTo);
      setIsOpen(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }} ref={dropdownRef}>
      {/* Date Range Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          id="date-range-toggle-btn"
          type="button"
          className="btn btn-secondary"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: '0.8125rem',
            padding: '0.375rem 0.75rem',
          }}
        >
          <Calendar size={15} style={{ color: 'var(--color-accent)' }} />
          <span>
            {preset === 'custom' && customFrom && customTo
              ? `${customFrom} to ${customTo}`
              : activePresetLabel}
          </span>
          <ChevronDown size={14} style={{ opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {isOpen && (
          <div
            id="date-range-popover"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 100,
              width: '320px',
              backgroundColor: 'var(--color-surface-base)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: 'var(--space-3)',
              animation: 'fadeIn 120ms ease-out',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Select Time Range
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
              {PRESETS.filter((p) => p.key !== 'custom').map((p) => {
                const isSelected = preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                    style={{
                      padding: '0.3rem 0.4rem',
                      fontSize: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={() => {
                      triggerRangeChange(p.key);
                      setIsOpen(false);
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Range Picker */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                Custom Date Range
              </div>
              <form onSubmit={handleApplyCustom} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input
                    id="custom-date-from"
                    type="date"
                    className="input"
                    value={tempFrom}
                    onChange={(e) => setTempFrom(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>to</span>
                  <input
                    id="custom-date-to"
                    type="date"
                    className="input"
                    value={tempTo}
                    onChange={(e) => setTempTo(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.5rem' }}
                    required
                  />
                </div>
                <button
                  id="custom-date-apply-btn"
                  type="submit"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', marginTop: 'var(--space-1)' }}
                  disabled={!tempFrom || !tempTo}
                >
                  Apply Custom Range
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Comparison Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>vs.</span>
        <select
          id="compare-selector"
          className="select"
          value={activeCompare}
          onChange={(e) => triggerCompareChange(e.target.value as ComparisonType)}
          style={{
            fontSize: '0.8125rem',
            padding: '0.375rem 0.75rem',
            width: 'auto',
            minWidth: '145px',
            backgroundColor: 'var(--color-surface-subtle)',
            cursor: 'pointer',
          }}
        >
          {COMPARISONS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
