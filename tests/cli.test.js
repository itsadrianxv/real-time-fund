import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/cli.js';

describe('parseCliArgs', () => {
  it('parses config and fund arguments for the state command', () => {
    const result = parseCliArgs(['state', '--config', './config/fund-alert.json', '--fund', '161725']);

    expect(result.command).toBe('state');
    expect(result.options.config).toBe('./config/fund-alert.json');
    expect(result.options.fund).toBe('161725');
  });

  it('throws when --config is missing', () => {
    expect(() => parseCliArgs(['daemon'])).toThrow(/--config/i);
  });
});
