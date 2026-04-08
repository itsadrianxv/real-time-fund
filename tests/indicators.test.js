import { describe, expect, it } from 'vitest';
import { buildIndicatorSeries, calculateEmaSeries } from '../src/strategy/indicators.js';

const bar = (index, overrides = {}) => ({
  barEndTime: `2026-04-${String(index + 1).padStart(2, '0')}T02:30:00.000Z`,
  open: 1 + (index * 0.01),
  high: 1.02 + (index * 0.01),
  low: 0.99 + (index * 0.01),
  close: 1.01 + (index * 0.01),
  ...overrides
});

describe('indicator helpers', () => {
  it('calculates a standard EMA series', () => {
    const series = calculateEmaSeries([1, 2, 3], 2);

    expect(series[0]).toBeCloseTo(1, 6);
    expect(series[1]).toBeCloseTo(1.666667, 6);
    expect(series[2]).toBeCloseTo(2.555556, 6);
  });

  it('keeps DI and ADX at zero on a flat series', () => {
    const flatBars = Array.from({ length: 30 }, (_, index) =>
      bar(index, { open: 1, high: 1, low: 1, close: 1 })
    );

    const enriched = buildIndicatorSeries(flatBars);
    const last = enriched[enriched.length - 1];

    expect(last.plusDi).toBe(0);
    expect(last.minusDi).toBe(0);
    expect(last.adx14).toBe(0);
  });

  it('produces a positive trend signature on a steady rising series', () => {
    const risingBars = Array.from({ length: 40 }, (_, index) => bar(index));

    const enriched = buildIndicatorSeries(risingBars);
    const last = enriched[enriched.length - 1];

    expect(last.ema20).toBeGreaterThan(last.ema60);
    expect(last.plusDi).toBeGreaterThan(last.minusDi);
    expect(last.adx14).toBeGreaterThan(0);
  });
});
