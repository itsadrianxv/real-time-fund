import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    timezone: 'Asia/Shanghai',
    sqlitePath: '/tmp/fund-alert.db',
    notification: { channel: 'feishu', webhookUrl: 'https://open.feishu.cn/test' },
    runtime: { sampleIntervalSeconds: 60, logLevel: 'info' },
    market: { barTimeframe: '60m', barCloses: ['10:30', '11:30', '14:00', '15:00'] },
    funds: []
  })
}));

vi.mock('../src/db/sqlite.js', () => ({
  ensureSchema: vi.fn(),
  getStateReport: vi.fn(),
  openDatabase: vi.fn(() => ({ close: vi.fn() })),
  seedPositionStates: vi.fn()
}));

vi.mock('../src/market/trading-calendar.js', () => ({
  isTradingDay: vi.fn(),
  loadHolidaysForYears: vi.fn().mockResolvedValue(undefined)
}));

describe('runCli', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not open the sqlite database for config validation', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const sqliteModule = await import('../src/db/sqlite.js');
    const { runCli } = await import('../src/cli.js');

    await runCli(['config:validate', '--config', './config/fund-alert.example.json']);

    expect(sqliteModule.openDatabase).not.toHaveBeenCalled();
    stdoutWrite.mockRestore();
  });
});
