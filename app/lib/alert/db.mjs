import pg from 'pg';
import { ALERT_DEFAULT_PARAMS } from './defaults.mjs';

const { Pool } = pg;
const poolKey = '__fundDailyAlertPool__';

const buildPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL
    };
  }

  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'fund_alert'
  };
};

const getPool = () => {
  if (!globalThis[poolKey]) {
    globalThis[poolKey] = new Pool(buildPoolConfig());
  }
  return globalThis[poolKey];
};

const pool = getPool();
let schemaReadyPromise = null;

const normalizeJsonObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
};

export const ensureAlertSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS strategy_profile (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_strategy_profile_enabled
          ON strategy_profile(enabled);

        CREATE TABLE IF NOT EXISTS fund_binding (
          target_fund_code VARCHAR(32) PRIMARY KEY,
          target_fund_name TEXT NOT NULL,
          benchmark_fund_code VARCHAR(32) NOT NULL,
          benchmark_fund_name TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          strategy_profile_id BIGINT REFERENCES strategy_profile(id) ON DELETE SET NULL,
          params_override_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_fund_binding_enabled
          ON fund_binding(enabled);

        CREATE INDEX IF NOT EXISTS idx_fund_binding_benchmark
          ON fund_binding(benchmark_fund_code);

        CREATE TABLE IF NOT EXISTS etf_sample_1m (
          id BIGSERIAL PRIMARY KEY,
          benchmark_fund_code VARCHAR(32) NOT NULL,
          sample_time TIMESTAMPTZ NOT NULL,
          price NUMERIC(18, 6) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(benchmark_fund_code, sample_time)
        );

        CREATE INDEX IF NOT EXISTS idx_etf_sample_code_time
          ON etf_sample_1m(benchmark_fund_code, sample_time DESC);

        CREATE TABLE IF NOT EXISTS etf_bar (
          id BIGSERIAL PRIMARY KEY,
          benchmark_fund_code VARCHAR(32) NOT NULL,
          bar_timeframe VARCHAR(8) NOT NULL,
          bar_end_time TIMESTAMPTZ NOT NULL,
          open NUMERIC(18, 6) NOT NULL,
          high NUMERIC(18, 6) NOT NULL,
          low NUMERIC(18, 6) NOT NULL,
          close NUMERIC(18, 6) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(benchmark_fund_code, bar_timeframe, bar_end_time)
        );

        CREATE INDEX IF NOT EXISTS idx_etf_bar_code_tf_time
          ON etf_bar(benchmark_fund_code, bar_timeframe, bar_end_time DESC);

        CREATE TABLE IF NOT EXISTS signal_event (
          id BIGSERIAL PRIMARY KEY,
          event_date DATE NOT NULL,
          event_stage VARCHAR(16) NOT NULL,
          direction VARCHAR(16) NOT NULL,
          target_fund_code VARCHAR(32) NOT NULL,
          benchmark_fund_code VARCHAR(32) NOT NULL,
          payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          sent BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(event_date, event_stage, direction, target_fund_code)
        );

        CREATE INDEX IF NOT EXISTS idx_signal_event_lookup
          ON signal_event(event_date, target_fund_code, event_stage, direction);

        CREATE TABLE IF NOT EXISTS notify_log (
          id BIGSERIAL PRIMARY KEY,
          channel VARCHAR(32) NOT NULL,
          event_id BIGINT REFERENCES signal_event(id) ON DELETE SET NULL,
          target_fund_code VARCHAR(32) NOT NULL,
          request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          success BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_notify_log_event_id
          ON notify_log(event_id);
      `);

      await pool.query(
        `
          INSERT INTO strategy_profile(name, params_json, enabled)
          VALUES ($1, $2::jsonb, TRUE)
          ON CONFLICT (name) DO NOTHING
        `,
        ['default-v1', JSON.stringify(ALERT_DEFAULT_PARAMS)]
      );
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
};

export const listStrategyProfiles = async ({ enabled } = {}) => {
  await ensureAlertSchema();

  const where = [];
  const values = [];

  if (typeof enabled === 'boolean') {
    values.push(enabled);
    where.push(`enabled = $${values.length}`);
  }

  const sql = `
    SELECT id, name, params_json, enabled, created_at, updated_at
    FROM strategy_profile
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id ASC
  `;

  const result = await pool.query(sql, values);
  return result.rows;
};

export const createStrategyProfile = async ({ name, params_json, enabled = true }) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      INSERT INTO strategy_profile(name, params_json, enabled)
      VALUES ($1, $2::jsonb, $3)
      RETURNING id, name, params_json, enabled, created_at, updated_at
    `,
    [String(name || '').trim(), JSON.stringify(normalizeJsonObject(params_json)), Boolean(enabled)]
  );

  return result.rows[0];
};

export const updateStrategyProfile = async (id, payload) => {
  await ensureAlertSchema();

  const fields = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    values.push(String(payload.name || '').trim());
    fields.push(`name = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'params_json')) {
    values.push(JSON.stringify(normalizeJsonObject(payload.params_json)));
    fields.push(`params_json = $${values.length}::jsonb`);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'enabled')) {
    values.push(Boolean(payload.enabled));
    fields.push(`enabled = $${values.length}`);
  }

  if (!fields.length) {
    return null;
  }

  values.push(Number(id));

  const result = await pool.query(
    `
      UPDATE strategy_profile
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING id, name, params_json, enabled, created_at, updated_at
    `,
    values
  );

  return result.rows[0] || null;
};

export const deleteStrategyProfile = async (id) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      DELETE FROM strategy_profile
      WHERE id = $1
      RETURNING id
    `,
    [Number(id)]
  );

  return result.rows[0] || null;
};

export const listFundBindings = async ({ enabled } = {}) => {
  await ensureAlertSchema();

  const where = [];
  const values = [];

  if (typeof enabled === 'boolean') {
    values.push(enabled);
    where.push(`fb.enabled = $${values.length}`);
  }

  const sql = `
    SELECT
      fb.target_fund_code,
      fb.target_fund_name,
      fb.benchmark_fund_code,
      fb.benchmark_fund_name,
      fb.enabled,
      fb.strategy_profile_id,
      fb.params_override_json,
      fb.created_at,
      fb.updated_at,
      sp.name AS strategy_profile_name,
      sp.params_json AS strategy_params_json,
      sp.enabled AS strategy_enabled
    FROM fund_binding fb
    LEFT JOIN strategy_profile sp ON sp.id = fb.strategy_profile_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY fb.target_fund_code ASC
  `;

  const result = await pool.query(sql, values);
  return result.rows;
};

export const createFundBinding = async (payload) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      INSERT INTO fund_binding(
        target_fund_code,
        target_fund_name,
        benchmark_fund_code,
        benchmark_fund_name,
        enabled,
        strategy_profile_id,
        params_override_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING
        target_fund_code,
        target_fund_name,
        benchmark_fund_code,
        benchmark_fund_name,
        enabled,
        strategy_profile_id,
        params_override_json,
        created_at,
        updated_at
    `,
    [
      String(payload.target_fund_code || '').trim(),
      String(payload.target_fund_name || '').trim(),
      String(payload.benchmark_fund_code || '').trim(),
      String(payload.benchmark_fund_name || '').trim(),
      payload.enabled === undefined ? true : Boolean(payload.enabled),
      payload.strategy_profile_id ? Number(payload.strategy_profile_id) : null,
      JSON.stringify(normalizeJsonObject(payload.params_override_json))
    ]
  );

  return result.rows[0];
};

export const updateFundBinding = async (targetFundCode, payload) => {
  await ensureAlertSchema();

  const fields = [];
  const values = [];

  const fieldMap = [
    ['target_fund_name', 'target_fund_name', (value) => String(value || '').trim()],
    ['benchmark_fund_code', 'benchmark_fund_code', (value) => String(value || '').trim()],
    ['benchmark_fund_name', 'benchmark_fund_name', (value) => String(value || '').trim()],
    ['enabled', 'enabled', (value) => Boolean(value)],
    ['strategy_profile_id', 'strategy_profile_id', (value) => (value ? Number(value) : null)]
  ];

  for (const [key, column, mapper] of fieldMap) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      values.push(mapper(payload[key]));
      fields.push(`${column} = $${values.length}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'params_override_json')) {
    values.push(JSON.stringify(normalizeJsonObject(payload.params_override_json)));
    fields.push(`params_override_json = $${values.length}::jsonb`);
  }

  if (!fields.length) {
    return null;
  }

  values.push(String(targetFundCode));

  const result = await pool.query(
    `
      UPDATE fund_binding
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE target_fund_code = $${values.length}
      RETURNING
        target_fund_code,
        target_fund_name,
        benchmark_fund_code,
        benchmark_fund_name,
        enabled,
        strategy_profile_id,
        params_override_json,
        created_at,
        updated_at
    `,
    values
  );

  return result.rows[0] || null;
};

export const deleteFundBinding = async (targetFundCode) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      DELETE FROM fund_binding
      WHERE target_fund_code = $1
      RETURNING target_fund_code
    `,
    [String(targetFundCode)]
  );

  return result.rows[0] || null;
};

export const listEnabledBindingsWithProfile = async () => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      SELECT
        fb.target_fund_code,
        fb.target_fund_name,
        fb.benchmark_fund_code,
        fb.benchmark_fund_name,
        fb.enabled,
        fb.strategy_profile_id,
        fb.params_override_json,
        sp.name AS strategy_profile_name,
        sp.params_json AS strategy_params_json,
        sp.enabled AS strategy_enabled
      FROM fund_binding fb
      LEFT JOIN strategy_profile sp ON sp.id = fb.strategy_profile_id
      WHERE fb.enabled = TRUE
      ORDER BY fb.target_fund_code ASC
    `
  );

  return result.rows;
};

export const upsertEtfSample1m = async ({ benchmarkFundCode, sampleTime, price }) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      INSERT INTO etf_sample_1m(benchmark_fund_code, sample_time, price)
      VALUES ($1, $2, $3)
      ON CONFLICT (benchmark_fund_code, sample_time)
      DO UPDATE SET price = EXCLUDED.price
      RETURNING id, benchmark_fund_code, sample_time, price
    `,
    [String(benchmarkFundCode), sampleTime, Number(price)]
  );

  return result.rows[0];
};

export const listEtfSamplesInRange = async ({ benchmarkFundCode, startTime, endTime }) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      SELECT sample_time, price
      FROM etf_sample_1m
      WHERE benchmark_fund_code = $1
        AND sample_time >= $2
        AND sample_time <= $3
      ORDER BY sample_time ASC
    `,
    [String(benchmarkFundCode), startTime, endTime]
  );

  return result.rows;
};

export const upsertEtfBar = async ({
  benchmarkFundCode,
  timeframe,
  barEndTime,
  open,
  high,
  low,
  close
}) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      INSERT INTO etf_bar(
        benchmark_fund_code,
        bar_timeframe,
        bar_end_time,
        open,
        high,
        low,
        close
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (benchmark_fund_code, bar_timeframe, bar_end_time)
      DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        updated_at = NOW()
      RETURNING
        id,
        benchmark_fund_code,
        bar_timeframe,
        bar_end_time,
        open,
        high,
        low,
        close
    `,
    [
      String(benchmarkFundCode),
      String(timeframe),
      barEndTime,
      Number(open),
      Number(high),
      Number(low),
      Number(close)
    ]
  );

  return result.rows[0];
};

export const listRecentBars = async ({
  benchmarkFundCode,
  timeframe,
  barEndTimeLte,
  limit = 240
}) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      SELECT bar_end_time, open, high, low, close
      FROM etf_bar
      WHERE benchmark_fund_code = $1
        AND bar_timeframe = $2
        AND bar_end_time <= $3
      ORDER BY bar_end_time DESC
      LIMIT $4
    `,
    [String(benchmarkFundCode), String(timeframe), barEndTimeLte, Number(limit)]
  );

  return result.rows.reverse();
};

export const upsertSignalEvent = async ({
  eventDate,
  stage,
  direction,
  targetFundCode,
  benchmarkFundCode,
  payload,
  sent
}) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      INSERT INTO signal_event(
        event_date,
        event_stage,
        direction,
        target_fund_code,
        benchmark_fund_code,
        payload_json,
        sent
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      ON CONFLICT (event_date, event_stage, direction, target_fund_code)
      DO UPDATE SET
        benchmark_fund_code = EXCLUDED.benchmark_fund_code,
        payload_json = EXCLUDED.payload_json,
        sent = EXCLUDED.sent,
        updated_at = NOW()
      RETURNING
        id,
        event_date,
        event_stage,
        direction,
        target_fund_code,
        benchmark_fund_code,
        payload_json,
        sent,
        created_at,
        updated_at
    `,
    [
      eventDate,
      stage,
      direction,
      String(targetFundCode),
      String(benchmarkFundCode),
      JSON.stringify(normalizeJsonObject(payload)),
      Boolean(sent)
    ]
  );

  return result.rows[0];
};

export const listSignalEventsByDay = async ({ eventDate, targetFundCode, direction }) => {
  await ensureAlertSchema();

  const where = ['event_date = $1'];
  const values = [eventDate];

  if (targetFundCode) {
    values.push(String(targetFundCode));
    where.push(`target_fund_code = $${values.length}`);
  }

  if (direction) {
    values.push(String(direction));
    where.push(`direction = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT
        id,
        event_date,
        event_stage,
        direction,
        target_fund_code,
        benchmark_fund_code,
        payload_json,
        sent,
        created_at,
        updated_at
      FROM signal_event
      WHERE ${where.join(' AND ')}
      ORDER BY created_at ASC
    `,
    values
  );

  return result.rows;
};

export const insertNotifyLog = async ({
  channel,
  eventId,
  targetFundCode,
  request,
  response,
  success
}) => {
  await ensureAlertSchema();

  const result = await pool.query(
    `
      INSERT INTO notify_log(
        channel,
        event_id,
        target_fund_code,
        request_json,
        response_json,
        success
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
      RETURNING id
    `,
    [
      String(channel || 'FEISHU'),
      eventId || null,
      String(targetFundCode || ''),
      JSON.stringify(normalizeJsonObject(request)),
      JSON.stringify(normalizeJsonObject(response)),
      Boolean(success)
    ]
  );

  return result.rows[0];
};
