import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  countRows,
  ensureSchema,
  openDatabase,
  upsertFundBar60m,
  upsertFundValuationSample1m,
  upsertStrategyEvent
} from '../src/db/sqlite.js';

const tempPaths = [];
const openDatabases = [];

afterEach(async () => {
  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db.close();
  }
  while (tempPaths.length > 0) {
    const target = tempPaths.pop();
    await fs.rm(target, { recursive: true, force: true });
  }
});

const createDatabase = async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fund-alert-db-'));
  tempPaths.push(tempDir);
  const databasePath = path.join(tempDir, 'fund-alert.db');
  const db = openDatabase(databasePath);
  openDatabases.push(db);
  ensureSchema(db);
  return { db, databasePath };
};

describe('sqlite repository', () => {
  it('upserts duplicate 1m valuation samples instead of inserting twice', async () => {
    const { db } = await createDatabase();

    upsertFundValuationSample1m(db, {
      fundCode: '161725',
      fundName: '招商中证白酒',
      sampleMinute: '2026-04-08T01:30:00.000Z',
      tradeDate: '2026-04-08',
      estimateNav: 1.032,
      estimateChangePercent: 0.21,
      latestNav: 1.025,
      navDate: '2026-04-07',
      estimateTime: '2026-04-08 09:30:00'
    });
    upsertFundValuationSample1m(db, {
      fundCode: '161725',
      fundName: '招商中证白酒',
      sampleMinute: '2026-04-08T01:30:00.000Z',
      tradeDate: '2026-04-08',
      estimateNav: 1.033,
      estimateChangePercent: 0.22,
      latestNav: 1.025,
      navDate: '2026-04-07',
      estimateTime: '2026-04-08 09:30:00'
    });

    expect(countRows(db, 'fund_valuation_sample_1m')).toBe(1);
  });

  it('upserts duplicate 60m bars instead of inserting twice', async () => {
    const { db } = await createDatabase();

    upsertFundBar60m(db, {
      fundCode: '161725',
      fundName: '招商中证白酒',
      barEndTime: '2026-04-08T02:30:00.000Z',
      open: 1.01,
      high: 1.03,
      low: 1.00,
      close: 1.02
    });
    upsertFundBar60m(db, {
      fundCode: '161725',
      fundName: '招商中证白酒',
      barEndTime: '2026-04-08T02:30:00.000Z',
      open: 1.02,
      high: 1.04,
      low: 1.01,
      close: 1.03
    });

    expect(countRows(db, 'fund_bar_60m')).toBe(1);
  });

  it('deduplicates the same strategy event by fund, type, trigger bar and anchor bar', async () => {
    const { db } = await createDatabase();

    const first = upsertStrategyEvent(db, {
      fundCode: '161725',
      fundName: '招商中证白酒',
      eventType: 'ENTRY',
      triggerBarEndTime: '2026-04-08T02:30:00.000Z',
      anchorBarEndTime: '2026-04-08T01:30:00.000Z',
      payload: { entry_mode: 'INITIAL' }
    });
    const second = upsertStrategyEvent(db, {
      fundCode: '161725',
      fundName: '招商中证白酒',
      eventType: 'ENTRY',
      triggerBarEndTime: '2026-04-08T02:30:00.000Z',
      anchorBarEndTime: '2026-04-08T01:30:00.000Z',
      payload: { entry_mode: 'INITIAL' }
    });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(countRows(db, 'strategy_event')).toBe(1);
  });
});
