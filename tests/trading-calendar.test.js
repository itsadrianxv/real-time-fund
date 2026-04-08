import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isTradingDay,
  loadHolidaysForYear
} from '../src/market/trading-calendar.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('trading calendar', () => {
  it('always treats weekends as non-trading days', () => {
    expect(isTradingDay(dayjs('2026-04-11'))).toBe(false);
    expect(isTradingDay(dayjs('2026-04-12'))).toBe(false);
  });

  it('treats fetched legal holidays as non-trading weekdays', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        holidays: {
          '2026-04-06': { name: 'qingming' }
        }
      })
    }));

    const holidays = await loadHolidaysForYear(2026);

    expect(holidays.has('2026-04-06')).toBe(true);
    expect(isTradingDay(dayjs('2026-04-06'))).toBe(false);
  });
});
