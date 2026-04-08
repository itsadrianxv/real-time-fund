# Deployment

## Ubuntu 24.04

1. Install Node.js 20+ and npm.
2. Clone the repository into `/opt/real-time-fund`.
3. Install dependencies:

   ```bash
   cd /opt/real-time-fund
   npm install
   ```

4. Create the runtime config:

   ```bash
   cp config/fund-alert.example.json config/fund-alert.json
   ```

5. Edit `config/fund-alert.json` and set:
   - `notification.webhook_url`
   - `funds`
   - optional SQLite path if you do not want the default `config/var/fund-alert.db`

## systemd

1. Create a dedicated user:

   ```bash
   sudo useradd --system --home /opt/real-time-fund --shell /usr/sbin/nologin fundalert
   sudo chown -R fundalert:fundalert /opt/real-time-fund
   ```

2. Install the service unit:

   ```bash
   sudo cp systemd/fund-alert.service /etc/systemd/system/fund-alert.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now fund-alert.service
   ```

3. Check status:

   ```bash
   sudo systemctl status fund-alert.service --no-pager
   ```

## Config Updates

After changing `config/fund-alert.json`, restart the service:

```bash
bash scripts/restart-service.sh fund-alert.service
```

## Verification

Use these local commands before restart:

```bash
npm run config:validate -- --config ./config/fund-alert.json
npm run daemon:once -- --config ./config/fund-alert.json
npm run state -- --config ./config/fund-alert.json --fund 161725
```
