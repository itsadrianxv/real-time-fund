import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateConfig } from '../src/config/config.js';
import { countRows, ensureSchema, openDatabase, seedPositionStates } from '../src/db/sqlite.js';
import { runDaemonTick } from '../src/daemon/service.js';

const tempPaths = [];
const openDatabases = [];

afterEach(async () => {
  while (openDatabases.length > 0) {
    openDatabases.pop().close();
  }
  while (tempPaths.length > 0) {
    await fs.rm(tempPaths.pop(), { recursive: true, force: true });
  }
});

const createFixture = async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fund-alert-daemon-'));
  tempPaths.push(tempDir);
  const configPath = path.join(tempDir, 'fund-alert.json');
  const databasePath = path.join(tempDir, 'fund-alert.db');
  const config = validateConfig({
    timezone: 'Asia/Shanghai',
    sqlite_path: './fund-alert.db',
    notification: {
      channel: 'feishu',
      webhook_url: 'https://open.feishu.cn/test'
    },
    runtime: {
      sample_interval_seconds: 60,
      log_level: 'info'
    },
    market: {
      bar_timeframe: '60m',
      bar_closes: ['10:30', '11:30', '14:00', '15:00']
    },
    funds: [
      {
        code: '161725',
        name: '招商中证白酒',
        enabled: true,
        shares: 0
      }
    ]
  }, { configPath });

  const db = openDatabase(databasePath);
  openDatabases.push(db);
  ensureSchema(db);
  seedPositionStates(db, config.funds);

  return { config, db };
};

describe('runDaemonTick', () => {
  it('skips sampling outside trading minutes', async () => {
    const { config, db } = await createFixture();
    const fetchValuation = vi.fn();

    const result = await runDaemonTick({
      config,
      db,
      now: '2026-04-08T04:00:00.000Z',
      fetchValuation,
      sendNotification: vi.fn(),
      isTradingDayFn: () => true
    });

    expect(result.sampledFunds).toBe(0);
    expect(fetchValuation).not.toHaveBeenCalled();
    expect(countRows(db, 'fund_valuation_sample_1m')).toBe(0);
  });

  it('samples and aggregates one 60m bar at a close minute without producing events during warmup', async () => {
    const { config, db } = await createFixture();
    const fetchValuation = vi.fn().mockResolvedValue({
      code: '161725',
      name: '招商中证白酒',
      estimateNav: 1.032,
      estimateChangePercent: 0.21,
      latestNav: 1.025,
      navDate: '2026-04-07',
      estimateTime: '2026-04-08 15:00:00'
    });

    const result = await runDaemonTick({
      config,
      db,
      now: '2026-04-08T07:00:00.000Z',
      fetchValuation,
      sendNotification: vi.fn(),
      isTradingDayFn: () => true
    });

    expect(result.sampledFunds).toBe(1);
    expect(result.aggregatedBars).toBe(1);
    expect(result.recordedEvents).toBe(0);
    expect(countRows(db, 'fund_valuation_sample_1m')).toBe(1);
    expect(countRows(db, 'fund_bar_60m')).toBe(1);
    expect(countRows(db, 'strategy_event')).toBe(0);
  });

  it('does not duplicate samples or bars when rerunning the same close tick', async () => {
    const { config, db } = await createFixture();
    const fetchValuation = vi.fn().mockResolvedValue({
      code: '161725',
      name: '招商中证白酒',
      estimateNav: 1.032,
      estimateChangePercent: 0.21,
      latestNav: 1.025,
      navDate: '2026-04-07',
      estimateTime: '2026-04-08 15:00:00'
    });

    await runDaemonTick({
      config,
      db,
      now: '2026-04-08T07:00:00.000Z',
      fetchValuation,
      sendNotification: vi.fn(),
      isTradingDayFn: () => true
    });
    await runDaemonTick({
      config,
      db,
      now: '2026-04-08T07:00:00.000Z',
      fetchValuation,
      sendNotification: vi.fn(),
      isTradingDayFn: () => true
    });

    expect(countRows(db, 'fund_valuation_sample_1m')).toBe(1);
    expect(countRows(db, 'fund_bar_60m')).toBe(1);
    expect(countRows(db, 'strategy_event')).toBe(0);
  });
});
