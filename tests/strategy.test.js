import { describe, expect, it } from 'vitest';
import { evaluateCurrentBar } from '../src/strategy/evaluator.js';

const state = (overrides = {}) => ({
  positionState: 'FLAT',
  pendingAnchorBarEndTime: '',
  lastConsumedAnchorBarEndTime: '',
  lastEntryBarEndTime: '',
  lastExitBarEndTime: '',
  updatedAt: '',
  ...overrides
});

const bar = ({
  barEndTime,
  open,
  high,
  low,
  close,
  ema20,
  ema60,
  adx14,
  plusDi,
  minusDi
}) => ({
  barEndTime,
  open,
  high,
  low,
  close,
  ema20,
  ema60,
  adx14,
  plusDi,
  minusDi
});

describe('evaluateCurrentBar', () => {
  it('creates an INITIAL entry when a fresh anchor, trend and restart confirmation align', () => {
    const series = [
      bar({ barEndTime: '2026-04-01T02:30:00.000Z', open: 1.00, high: 1.02, low: 0.99, close: 1.01, ema20: 1.00, ema60: 0.98, adx14: 23, plusDi: 28, minusDi: 11 }),
      bar({ barEndTime: '2026-04-01T03:30:00.000Z', open: 1.01, high: 1.03, low: 1.00, close: 1.02, ema20: 1.01, ema60: 0.99, adx14: 24, plusDi: 29, minusDi: 10 }),
      bar({ barEndTime: '2026-04-01T06:00:00.000Z', open: 1.02, high: 1.04, low: 1.01, close: 1.03, ema20: 1.02, ema60: 1.00, adx14: 25, plusDi: 30, minusDi: 9 }),
      bar({ barEndTime: '2026-04-01T07:00:00.000Z', open: 1.03, high: 1.05, low: 1.02, close: 1.04, ema20: 1.03, ema60: 1.01, adx14: 25, plusDi: 30, minusDi: 9 }),
      bar({ barEndTime: '2026-04-02T02:30:00.000Z', open: 1.04, high: 1.06, low: 1.039, close: 1.05, ema20: 1.04, ema60: 1.02, adx14: 26, plusDi: 31, minusDi: 8 }),
      bar({ barEndTime: '2026-04-02T03:30:00.000Z', open: 1.05, high: 1.07, low: 1.049, close: 1.06, ema20: 1.05, ema60: 1.03, adx14: 27, plusDi: 32, minusDi: 8 }),
      bar({ barEndTime: '2026-04-02T06:00:00.000Z', open: 1.06, high: 1.08, low: 1.059, close: 1.07, ema20: 1.06, ema60: 1.04, adx14: 28, plusDi: 33, minusDi: 8 }),
      bar({ barEndTime: '2026-04-02T07:00:00.000Z', open: 1.07, high: 1.09, low: 1.068, close: 1.08, ema20: 1.07, ema60: 1.05, adx14: 29, plusDi: 34, minusDi: 8 }),
      bar({ barEndTime: '2026-04-03T02:30:00.000Z', open: 1.08, high: 1.10, low: 1.079, close: 1.09, ema20: 1.08, ema60: 1.06, adx14: 30, plusDi: 35, minusDi: 8 }),
      bar({ barEndTime: '2026-04-03T03:30:00.000Z', open: 1.09, high: 1.11, low: 1.089, close: 1.10, ema20: 1.09, ema60: 1.07, adx14: 31, plusDi: 36, minusDi: 8 }),
      bar({ barEndTime: '2026-04-03T06:00:00.000Z', open: 1.10, high: 1.11, low: 1.091, close: 1.105, ema20: 1.09, ema60: 1.08, adx14: 32, plusDi: 34, minusDi: 9 }),
      bar({ barEndTime: '2026-04-03T07:00:00.000Z', open: 1.106, high: 1.14, low: 1.104, close: 1.13, ema20: 1.10, ema60: 1.09, adx14: 33, plusDi: 37, minusDi: 8 })
    ];

    const result = evaluateCurrentBar({ series, state: state() });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('ENTRY');
    expect(result.events[0].payload.entry_mode).toBe('INITIAL');
    expect(result.nextState.positionState).toBe('LONG');
    expect(result.nextState.pendingAnchorBarEndTime).toBe('');
    expect(result.nextState.lastConsumedAnchorBarEndTime).toBe('2026-04-03T06:00:00.000Z');
  });

  it('creates an ADD entry only when the anchor is new and at least two bars after the previous entry', () => {
    const series = [
      bar({ barEndTime: '2026-04-03T02:30:00.000Z', open: 1.05, high: 1.08, low: 1.04, close: 1.07, ema20: 1.06, ema60: 1.03, adx14: 26, plusDi: 31, minusDi: 11 }),
      bar({ barEndTime: '2026-04-03T03:30:00.000Z', open: 1.07, high: 1.10, low: 1.06, close: 1.09, ema20: 1.07, ema60: 1.04, adx14: 27, plusDi: 32, minusDi: 10 }),
      bar({ barEndTime: '2026-04-03T06:00:00.000Z', open: 1.09, high: 1.12, low: 1.08, close: 1.11, ema20: 1.08, ema60: 1.05, adx14: 28, plusDi: 33, minusDi: 9 }),
      bar({ barEndTime: '2026-04-03T07:00:00.000Z', open: 1.11, high: 1.13, low: 1.10, close: 1.12, ema20: 1.09, ema60: 1.06, adx14: 29, plusDi: 34, minusDi: 9 }),
      bar({ barEndTime: '2026-04-04T02:30:00.000Z', open: 1.12, high: 1.15, low: 1.099, close: 1.13, ema20: 1.11, ema60: 1.08, adx14: 30, plusDi: 35, minusDi: 8 }),
      bar({ barEndTime: '2026-04-04T03:30:00.000Z', open: 1.131, high: 1.17, low: 1.13, close: 1.16, ema20: 1.12, ema60: 1.09, adx14: 31, plusDi: 36, minusDi: 8 })
    ];

    const result = evaluateCurrentBar({
      series,
      state: state({
        positionState: 'LONG',
        lastEntryBarEndTime: '2026-04-03T03:30:00.000Z',
        lastConsumedAnchorBarEndTime: '2026-04-03T02:30:00.000Z'
      })
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('ENTRY');
    expect(result.events[0].payload.entry_mode).toBe('ADD');
  });

  it('does not reuse the same consumed anchor for another entry', () => {
    const series = [
      bar({ barEndTime: '2026-04-03T02:30:00.000Z', open: 1.05, high: 1.08, low: 1.04, close: 1.07, ema20: 1.06, ema60: 1.03, adx14: 26, plusDi: 31, minusDi: 11 }),
      bar({ barEndTime: '2026-04-03T03:30:00.000Z', open: 1.07, high: 1.10, low: 1.06, close: 1.09, ema20: 1.07, ema60: 1.04, adx14: 27, plusDi: 32, minusDi: 10 }),
      bar({ barEndTime: '2026-04-03T06:00:00.000Z', open: 1.09, high: 1.12, low: 1.08, close: 1.11, ema20: 1.08, ema60: 1.05, adx14: 28, plusDi: 33, minusDi: 9 }),
      bar({ barEndTime: '2026-04-03T07:00:00.000Z', open: 1.111, high: 1.14, low: 1.11, close: 1.13, ema20: 1.09, ema60: 1.06, adx14: 29, plusDi: 34, minusDi: 9 })
    ];

    const result = evaluateCurrentBar({
      series,
      state: state({
        positionState: 'LONG',
        lastConsumedAnchorBarEndTime: '2026-04-03T06:00:00.000Z'
      })
    });

    expect(result.events).toEqual([]);
  });

  it('records invalidation before exit and suppresses entry on the same bar', () => {
    const series = [
      bar({ barEndTime: '2026-04-03T02:30:00.000Z', open: 1.05, high: 1.08, low: 1.04, close: 1.07, ema20: 1.06, ema60: 1.03, adx14: 26, plusDi: 31, minusDi: 11 }),
      bar({ barEndTime: '2026-04-03T03:30:00.000Z', open: 1.07, high: 1.10, low: 1.06, close: 1.09, ema20: 1.07, ema60: 1.04, adx14: 27, plusDi: 32, minusDi: 10 }),
      bar({ barEndTime: '2026-04-03T06:00:00.000Z', open: 1.09, high: 1.12, low: 1.08, close: 1.04, ema20: 1.08, ema60: 1.05, adx14: 28, plusDi: 33, minusDi: 9 }),
      bar({ barEndTime: '2026-04-03T07:00:00.000Z', open: 1.11, high: 1.12, low: 1.00, close: 1.01, ema20: 1.09, ema60: 1.06, adx14: 30, plusDi: 8, minusDi: 35 })
    ];

    const result = evaluateCurrentBar({
      series,
      state: state({
        positionState: 'LONG',
        pendingAnchorBarEndTime: '2026-04-03T06:00:00.000Z'
      })
    });

    expect(result.events.map((event) => event.eventType)).toEqual(['SETUP_INVALIDATED', 'EXIT']);
    expect(result.events[0].payload.invalidate_reasons).toContain('DI_CROSSDOWN');
    expect(result.nextState.positionState).toBe('FLAT');
  });
});
