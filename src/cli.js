import { pathToFileURL } from 'node:url';
import {
  ensureSchema,
  getStateReport,
  openDatabase,
  seedPositionStates
} from './db/sqlite.js';
import { startDaemon, runDaemonTick } from './daemon/service.js';
import { loadConfig } from './config/config.js';
import { fetchFundRealtimeValuation } from './market/fund-valuation.js';
import { isTradingDay, loadHolidaysForYears } from './market/trading-calendar.js';
import { sendFeishuTextMessage } from './notify/feishu.js';

const parseOptions = (argv) => {
  const options = {};

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }

  return options;
};

export const parseCliArgs = (argv) => {
  const command = String(argv?.[0] || '').trim();
  if (!command) {
    throw new Error('command is required');
  }

  const options = parseOptions(argv);
  if (!options.config) {
    throw new Error('--config is required');
  }

  if (command === 'state' && !options.fund) {
    throw new Error('--fund is required for state');
  }

  return { command, options };
};

const createDependencies = (config) => ({
  fetchValuation: fetchFundRealtimeValuation,
  sendNotification: ({ text }) => sendFeishuTextMessage({
    webhookUrl: config.notification.webhookUrl,
    text
  }),
  isTradingDayFn: isTradingDay
});

export const runCli = async (argv = process.argv.slice(2)) => {
  const { command, options } = parseCliArgs(argv);
  const config = await loadConfig(options.config);
  const currentYear = new Date().getFullYear();
  await loadHolidaysForYears([currentYear - 1, currentYear, currentYear + 1]);

  if (command === 'config:validate') {
    process.stdout.write(`${JSON.stringify({
      timezone: config.timezone,
      sqlitePath: config.sqlitePath,
      funds: config.funds.length
    }, null, 2)}\n`);
    return 0;
  }

  const db = openDatabase(config.sqlitePath);
  ensureSchema(db);
  seedPositionStates(db, config.funds);

  try {
    const dependencies = createDependencies(config);

    if (command === 'state') {
      process.stdout.write(`${JSON.stringify(getStateReport(db, options.fund), null, 2)}\n`);
      return 0;
    }

    if (command === 'daemon:once') {
      const result = await runDaemonTick({
        config,
        db,
        ...dependencies
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (command === 'daemon') {
      await startDaemon({
        config,
        db,
        ...dependencies
      });
      return 0;
    }

    throw new Error(`unsupported command: ${command}`);
  } finally {
    if (command !== 'daemon') {
      db.close();
    }
  }
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
