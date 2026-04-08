import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const stringifyJson = (value) => JSON.stringify(value ?? {});

export const openDatabase = (databasePath) => {
  const absolutePath = path.resolve(String(databasePath));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return new DatabaseSync(absolutePath);
};

export const ensureSchema = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fund_valuation_sample_1m (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      fund_name TEXT NOT NULL,
      sample_minute TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      estimate_nav REAL NOT NULL,
      estimate_change_percent REAL,
      latest_nav REAL,
      nav_date TEXT,
      estimate_time TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (fund_code, sample_minute)
    );

    CREATE TABLE IF NOT EXISTS fund_bar_60m (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      fund_name TEXT NOT NULL,
      bar_end_time TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (fund_code, bar_end_time)
    );

    CREATE TABLE IF NOT EXISTS strategy_state (
      fund_code TEXT PRIMARY KEY,
      position_state TEXT NOT NULL,
      pending_anchor_bar_end_time TEXT NOT NULL DEFAULT '',
      last_consumed_anchor_bar_end_time TEXT NOT NULL DEFAULT '',
      last_entry_bar_end_time TEXT NOT NULL DEFAULT '',
      last_exit_bar_end_time TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS strategy_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      fund_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      trigger_bar_end_time TEXT NOT NULL,
      anchor_bar_end_time TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (fund_code, event_type, trigger_bar_end_time, anchor_bar_end_time)
    );

    CREATE TABLE IF NOT EXISTS notify_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      channel TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES strategy_event(id)
    );
  `);
};

export const countRows = (db, tableName) => {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  return Number(row.count);
};

export const upsertFundValuationSample1m = (db, sample) => {
  db.prepare(`
    INSERT INTO fund_valuation_sample_1m (
      fund_code,
      fund_name,
      sample_minute,
      trade_date,
      estimate_nav,
      estimate_change_percent,
      latest_nav,
      nav_date,
      estimate_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (fund_code, sample_minute) DO UPDATE SET
      fund_name = excluded.fund_name,
      trade_date = excluded.trade_date,
      estimate_nav = excluded.estimate_nav,
      estimate_change_percent = excluded.estimate_change_percent,
      latest_nav = excluded.latest_nav,
      nav_date = excluded.nav_date,
      estimate_time = excluded.estimate_time
  `).run(
    sample.fundCode,
    sample.fundName,
    sample.sampleMinute,
    sample.tradeDate,
    sample.estimateNav,
    sample.estimateChangePercent,
    sample.latestNav,
    sample.navDate,
    sample.estimateTime
  );
};

export const upsertFundBar60m = (db, bar) => {
  const existing = db.prepare(`
    SELECT id
    FROM fund_bar_60m
    WHERE fund_code = ?
      AND bar_end_time = ?
  `).get(bar.fundCode, bar.barEndTime);

  if (existing) {
    db.prepare(`
      UPDATE fund_bar_60m
      SET
        fund_name = ?,
        open = ?,
        high = ?,
        low = ?,
        close = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE fund_code = ?
        AND bar_end_time = ?
    `).run(
      bar.fundName,
      bar.open,
      bar.high,
      bar.low,
      bar.close,
      bar.fundCode,
      bar.barEndTime
    );

    return { inserted: false };
  }

  db.prepare(`
    INSERT INTO fund_bar_60m (
      fund_code,
      fund_name,
      bar_end_time,
      open,
      high,
      low,
      close
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    bar.fundCode,
    bar.fundName,
    bar.barEndTime,
    bar.open,
    bar.high,
    bar.low,
    bar.close
  );

  return { inserted: true };
};

export const upsertStrategyEvent = (db, event) => {
  const insertResult = db.prepare(`
    INSERT OR IGNORE INTO strategy_event (
      fund_code,
      fund_name,
      event_type,
      trigger_bar_end_time,
      anchor_bar_end_time,
      payload_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event.fundCode,
    event.fundName,
    event.eventType,
    event.triggerBarEndTime,
    event.anchorBarEndTime ?? '',
    stringifyJson(event.payload)
  );

  const row = db.prepare(`
    SELECT id, fund_code, fund_name, event_type, trigger_bar_end_time, anchor_bar_end_time, payload_json
    FROM strategy_event
    WHERE fund_code = ?
      AND event_type = ?
      AND trigger_bar_end_time = ?
      AND anchor_bar_end_time = ?
  `).get(
    event.fundCode,
    event.eventType,
    event.triggerBarEndTime,
    event.anchorBarEndTime ?? ''
  );

  return {
    inserted: insertResult.changes > 0,
    row
  };
};

export const listFundValuationSamplesInRange = (db, { fundCode, startMinute, endMinute }) =>
  db.prepare(`
    SELECT fund_code, fund_name, sample_minute, trade_date, estimate_nav, estimate_change_percent, latest_nav, nav_date, estimate_time
    FROM fund_valuation_sample_1m
    WHERE fund_code = ?
      AND sample_minute >= ?
      AND sample_minute <= ?
    ORDER BY sample_minute ASC
  `).all(fundCode, startMinute, endMinute);

export const listBarsForFund = (db, fundCode, limit = 100) =>
  db.prepare(`
    SELECT fund_code, fund_name, bar_end_time AS barEndTime, open, high, low, close
    FROM fund_bar_60m
    WHERE fund_code = ?
    ORDER BY bar_end_time ASC
    LIMIT ?
  `).all(fundCode, limit);

export const getStrategyState = (db, fundCode) =>
  db.prepare(`
    SELECT
      fund_code AS fundCode,
      position_state AS positionState,
      pending_anchor_bar_end_time AS pendingAnchorBarEndTime,
      last_consumed_anchor_bar_end_time AS lastConsumedAnchorBarEndTime,
      last_entry_bar_end_time AS lastEntryBarEndTime,
      last_exit_bar_end_time AS lastExitBarEndTime,
      updated_at AS updatedAt
    FROM strategy_state
    WHERE fund_code = ?
  `).get(fundCode);

export const upsertStrategyState = (db, state) => {
  db.prepare(`
    INSERT INTO strategy_state (
      fund_code,
      position_state,
      pending_anchor_bar_end_time,
      last_consumed_anchor_bar_end_time,
      last_entry_bar_end_time,
      last_exit_bar_end_time,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (fund_code) DO UPDATE SET
      position_state = excluded.position_state,
      pending_anchor_bar_end_time = excluded.pending_anchor_bar_end_time,
      last_consumed_anchor_bar_end_time = excluded.last_consumed_anchor_bar_end_time,
      last_entry_bar_end_time = excluded.last_entry_bar_end_time,
      last_exit_bar_end_time = excluded.last_exit_bar_end_time,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    state.fundCode,
    state.positionState,
    state.pendingAnchorBarEndTime ?? '',
    state.lastConsumedAnchorBarEndTime ?? '',
    state.lastEntryBarEndTime ?? '',
    state.lastExitBarEndTime ?? ''
  );
};

export const seedPositionStates = (db, funds) => {
  const statement = db.prepare(`
    INSERT INTO strategy_state (
      fund_code,
      position_state,
      pending_anchor_bar_end_time,
      last_consumed_anchor_bar_end_time,
      last_entry_bar_end_time,
      last_exit_bar_end_time,
      updated_at
    )
    VALUES (?, ?, '', '', '', '', CURRENT_TIMESTAMP)
    ON CONFLICT (fund_code) DO UPDATE SET
      position_state = excluded.position_state,
      updated_at = CURRENT_TIMESTAMP
  `);

  for (const fund of funds || []) {
    statement.run(
      fund.code,
      Number(fund.shares || 0) > 0 ? 'LONG' : 'FLAT'
    );
  }
};

export const insertNotifyLog = (db, entry) => {
  db.prepare(`
    INSERT INTO notify_log (
      event_id,
      channel,
      request_json,
      response_json,
      success
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    entry.eventId ?? null,
    entry.channel,
    stringifyJson(entry.request),
    stringifyJson(entry.response),
    entry.success ? 1 : 0
  );
};

export const getStateReport = (db, fundCode) => ({
  state: getStrategyState(db, fundCode) || null,
  events: db.prepare(`
    SELECT
      id,
      fund_code AS fundCode,
      fund_name AS fundName,
      event_type AS eventType,
      trigger_bar_end_time AS triggerBarEndTime,
      anchor_bar_end_time AS anchorBarEndTime,
      payload_json AS payloadJson,
      created_at AS createdAt
    FROM strategy_event
    WHERE fund_code = ?
    ORDER BY trigger_bar_end_time DESC, id DESC
    LIMIT 10
  `).all(fundCode)
});
