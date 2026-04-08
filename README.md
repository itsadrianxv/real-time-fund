# Real-time Fund Alert Daemon

Headless Node.js daemon for fund valuation sampling, simulated 60m K-line construction, SQLite persistence, and Feishu alerts.

## Runtime

- Node.js `>= 20.9.0`
- JSON config at `config/fund-alert.json`
- SQLite runtime database, defaulting to `config/var/fund-alert.db`
- Ubuntu 24.04 deployment via `systemd`

## Commands

```bash
npm install
npm run config:validate -- --config ./config/fund-alert.example.json
npm run daemon:once -- --config ./config/fund-alert.example.json
npm run state -- --config ./config/fund-alert.example.json --fund 161725
npm run daemon -- --config ./config/fund-alert.json
```

## Config

Copy the example and replace the webhook and funds you want to monitor:

```bash
cp config/fund-alert.example.json config/fund-alert.json
```

`funds[].shares` is only used to seed the startup position state:

- `shares > 0` => `LONG`
- `shares <= 0` => `FLAT`

The daemon does not write positions back into JSON.

## Data Flow

1. Sample enabled funds once per minute during trading hours.
2. Persist 1m valuation points into SQLite.
3. Aggregate fixed `60m` windows at `10:30`, `11:30`, `14:00`, `15:00`.
4. Build indicators from completed bars and evaluate `ENTRY`, `EXIT`, and `SETUP_INVALIDATED`.
5. Persist state/events and send Feishu notifications for `ENTRY` and `EXIT`.

## Testing

```bash
npm test
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for Ubuntu 24.04 and `systemd` setup.
