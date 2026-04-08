import fs from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_BAR_CLOSES = ['10:30', '11:30', '14:00', '15:00'];
const FUND_CODE_RE = /^\d{5,6}$/;

const ensureObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
};

const ensureText = (value, label) => {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
};

const ensureNonNegativeNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return number;
};

const normalizeFund = (value, seenCodes) => {
  const fund = ensureObject(value, 'fund');
  const code = ensureText(fund.code, 'fund.code');
  if (!FUND_CODE_RE.test(code)) {
    throw new Error(`fund.code is invalid: ${code}`);
  }
  if (seenCodes.has(code)) {
    throw new Error(`duplicate fund code: ${code}`);
  }
  seenCodes.add(code);

  return {
    code,
    name: ensureText(fund.name, `fund.name(${code})`),
    enabled: fund.enabled !== false,
    shares: ensureNonNegativeNumber(fund.shares ?? 0, `fund.shares(${code})`)
  };
};

export const validateConfig = (rawConfig, { configPath } = {}) => {
  const config = ensureObject(rawConfig, 'config');
  const absoluteConfigPath = path.resolve(ensureText(configPath, 'configPath'));
  const configDir = path.dirname(absoluteConfigPath);

  const notification = ensureObject(config.notification, 'notification');
  const runtime = ensureObject(config.runtime, 'runtime');
  const market = ensureObject(config.market, 'market');

  const barCloses = Array.isArray(market.bar_closes) ? market.bar_closes.map((item) => String(item).trim()) : [];
  if (JSON.stringify(barCloses) !== JSON.stringify(EXPECTED_BAR_CLOSES)) {
    throw new Error(`market.bar_closes must equal ${EXPECTED_BAR_CLOSES.join(', ')}`);
  }

  const funds = Array.isArray(config.funds) ? config.funds : [];
  const seenCodes = new Set();

  return {
    configPath: absoluteConfigPath,
    configDir,
    timezone: ensureText(config.timezone, 'timezone'),
    sqlitePath: path.resolve(configDir, ensureText(config.sqlite_path, 'sqlite_path')),
    notification: {
      channel: ensureText(notification.channel, 'notification.channel'),
      webhookUrl: ensureText(notification.webhook_url, 'notification.webhook_url')
    },
    runtime: {
      sampleIntervalSeconds: ensureNonNegativeNumber(
        runtime.sample_interval_seconds,
        'runtime.sample_interval_seconds'
      ),
      logLevel: ensureText(runtime.log_level, 'runtime.log_level')
    },
    market: {
      barTimeframe: ensureText(market.bar_timeframe, 'market.bar_timeframe'),
      barCloses
    },
    funds: funds.map((item) => normalizeFund(item, seenCodes))
  };
};

export const loadConfig = async (configPath) => {
  const absolutePath = path.resolve(ensureText(configPath, 'configPath'));
  const rawText = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(rawText);
  return validateConfig(parsed, { configPath: absolutePath });
};
