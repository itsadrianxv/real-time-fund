# Architecture

## Components

- `src/cli.js`: command parsing and entrypoints
- `src/daemon/service.js`: tick orchestration and loop scheduling
- `src/market/fund-valuation.js`: Eastmoney realtime valuation fetch
- `src/market/trading-calendar.js`: A-share trading day checks
- `src/strategy/*`: fixed 60m window aggregation, indicator generation, strategy evaluation
- `src/db/sqlite.js`: SQLite schema and repository helpers
- `src/notify/feishu.js`: Feishu webhook delivery

## Runtime Flow

1. Load JSON config.
2. Open SQLite and ensure schema.
3. Seed `strategy_state.position_state` from `funds[].shares`.
4. Every trading minute, fetch each enabled fund valuation.
5. Persist 1m samples.
6. At each configured close minute, aggregate one simulated 60m bar.
7. If the bar is new, evaluate the strategy on completed bars.
8. Persist `strategy_state`, `strategy_event`, and `notify_log`.
9. Send Feishu only for `ENTRY` and `EXIT`.

## Persistence

- `fund_valuation_sample_1m`: per-fund minute valuations
- `fund_bar_60m`: simulated OHLC bars
- `strategy_state`: current position and anchor bookkeeping
- `strategy_event`: deduplicated strategy events
- `notify_log`: webhook audit trail
