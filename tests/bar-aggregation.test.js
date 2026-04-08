import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {
  aggregateBarFromSamples,
  getBarWindowForClose,
  isBarCloseMinute,
  isTradingMinute
} from '../src/strategy/bar-aggregation.js';

dayjs.extend(utc);
dayjs.extend(timezone);

describe('bar aggregation helpers', () => {
  it('treats 15:00 as a trading minute and 12:00 as non-trading', () => {
    const afternoonClose = dayjs.tz('2026-04-08 15:00', 'YYYY-MM-DD HH:mm', 'Asia/Shanghai');
    const lunchBreak = dayjs.tz('2026-04-08 12:00', 'YYYY-MM-DD HH:mm', 'Asia/Shanghai');

    expect(isTradingMinute(afternoonClose, 'Asia/Shanghai')).toBe(true);
    expect(isTradingMinute(lunchBreak, 'Asia/Shanghai')).toBe(false);
    expect(isBarCloseMinute(afternoonClose, ['10:30', '11:30', '14:00', '15:00'], 'Asia/Shanghai')).toBe(true);
  });

  it('resolves the fixed 14:01-15:00 window for the 15:00 close', () => {
    const closeTime = dayjs.tz('2026-04-08 15:00', 'YYYY-MM-DD HH:mm', 'Asia/Shanghai');

    const window = getBarWindowForClose(closeTime, 'Asia/Shanghai');

    expect(window.start.format('HH:mm')).toBe('14:01');
    expect(window.end.format('HH:mm')).toBe('15:00');
  });

  it('aggregates open, high, low and close without forward filling missing minutes', () => {
    const samples = [
      { estimate_nav: 1.032, sample_minute: '2026-04-08T06:01:00.000Z' },
      { estimate_nav: 1.038, sample_minute: '2026-04-08T06:18:00.000Z' },
      { estimate_nav: 1.029, sample_minute: '2026-04-08T06:42:00.000Z' },
      { estimate_nav: 1.041, sample_minute: '2026-04-08T07:00:00.000Z' }
    ];

    const bar = aggregateBarFromSamples(samples);

    expect(bar).toEqual({
      open: 1.032,
      high: 1.041,
      low: 1.029,
      close: 1.041
    });
  });
});
