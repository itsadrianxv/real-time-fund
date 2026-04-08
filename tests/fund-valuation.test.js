import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFundRealtimeValuation } from '../src/market/fund-valuation.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchFundRealtimeValuation', () => {
  it('parses eastmoney jsonp valuation payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'jsonpgz({"fundcode":"161725","name":"招商中证白酒","gsz":"1.0321","gszzl":"0.23","dwjz":"1.0250","jzrq":"2026-04-07","gztime":"2026-04-08 14:58"});'
    }));

    const result = await fetchFundRealtimeValuation('161725');

    expect(result.name).toBe('招商中证白酒');
    expect(result.estimateNav).toBe(1.0321);
    expect(result.latestNav).toBe(1.025);
  });

  it('rejects invalid fund codes before issuing the request', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(fetchFundRealtimeValuation('abc')).rejects.toThrow(/invalid fund code/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
