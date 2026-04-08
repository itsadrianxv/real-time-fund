import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { validateConfig } from '../src/config/config.js';

const makeConfig = () => ({
  timezone: 'Asia/Shanghai',
  sqlite_path: './var/fund-alert.db',
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
      shares: 1000
    }
  ]
});

describe('validateConfig', () => {
  it('normalizes a valid config and resolves the sqlite path', () => {
    const configPath = path.join(process.cwd(), 'config', 'fund-alert.json');

    const result = validateConfig(makeConfig(), { configPath });

    expect(result.sqlitePath).toBe(path.join(process.cwd(), 'config', 'var', 'fund-alert.db'));
    expect(result.notification.channel).toBe('feishu');
    expect(result.funds).toHaveLength(1);
  });

  it('rejects duplicate fund codes', () => {
    const config = makeConfig();
    config.funds.push({
      code: '161725',
      name: '重复基金',
      enabled: true,
      shares: 0
    });

    expect(() => validateConfig(config, { configPath: '/tmp/fund-alert.json' })).toThrow(
      /duplicate fund code/i
    );
  });

  it('rejects negative shares', () => {
    const config = makeConfig();
    config.funds[0].shares = -1;

    expect(() => validateConfig(config, { configPath: '/tmp/fund-alert.json' })).toThrow(
      /shares/i
    );
  });

  it('rejects an empty webhook url', () => {
    const config = makeConfig();
    config.notification.webhook_url = ' ';

    expect(() => validateConfig(config, { configPath: '/tmp/fund-alert.json' })).toThrow(
      /webhook/i
    );
  });
});
