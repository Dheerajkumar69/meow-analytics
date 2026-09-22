/**
 * Web Vitals Thresholds and Classification Utilities
 * Based strictly on standard Google Web Vitals definitions:
 * - LCP: https://web.dev/articles/lcp
 * - INP: https://web.dev/articles/inp
 * - CLS: https://web.dev/articles/cls
 * - FCP: https://web.dev/articles/fcp
 * - TTFB: https://web.dev/articles/ttfb
 */

export type MetricRating = 'good' | 'needs-improvement' | 'poor';
export type WebVitalMetric = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

export interface MetricThreshold {
  good: number; // <= this value is good
  poor: number; // > this value is poor; in between is needs-improvement
  unit: 'ms' | 'score';
  description: string;
}

export const WEB_VITALS_THRESHOLDS: Record<WebVitalMetric, MetricThreshold> = {
  lcp: {
    good: 2500,
    poor: 4000,
    unit: 'ms',
    description: 'Largest Contentful Paint: Measures loading performance (<= 2.5s is Good)',
  },
  inp: {
    good: 200,
    poor: 500,
    unit: 'ms',
    description: 'Interaction to Next Paint: Measures visual responsiveness (<= 200ms is Good)',
  },
  cls: {
    good: 0.1,
    poor: 0.25,
    unit: 'score',
    description: 'Cumulative Layout Shift: Measures visual stability (<= 0.1 is Good)',
  },
  fcp: {
    good: 1800,
    poor: 3000,
    unit: 'ms',
    description: 'First Contentful Paint: Marks when the first DOM content is rendered (<= 1.8s is Good)',
  },
  ttfb: {
    good: 800,
    poor: 1800,
    unit: 'ms',
    description: 'Time to First Byte: Measures backend and network responsiveness (<= 800ms is Good)',
  },
};

/**
 * Classify a metric value using standard documented thresholds.
 */
export function classifyMetric(metric: WebVitalMetric, value: number | null | undefined): MetricRating | null {
  if (value === null || value === undefined || isNaN(value)) {
    return null;
  }

  const threshold = WEB_VITALS_THRESHOLDS[metric];
  if (!threshold) return null;

  if (value <= threshold.good) {
    return 'good';
  }
  if (value <= threshold.poor) {
    return 'needs-improvement';
  }
  return 'poor';
}

/**
 * Calculate percentile from an array of numbers using linear interpolation (same as standard quantile/percentile_cont).
 * @param values Array of numbers
 * @param p Percentile between 0 and 1 (e.g. 0.5, 0.75, 0.9, 0.95)
 */
export function calculatePercentile(values: number[], p: number): number {
  if (!values || values.length === 0) return 0;
  if (values.length === 1) return Number(values[0]!.toFixed(3));

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return Number(sorted[lower]!.toFixed(3));
  }

  const interpolated = sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
  return Number(interpolated.toFixed(3));
}

/**
 * Generate a unique ID for a performance metrics row.
 */
export function generatePerformanceId(): string {
  const chars = '0123456789abcdef';
  let rand = '';
  for (let i = 0; i < 24; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return `perf_${Date.now().toString(36)}_${rand}`;
}
