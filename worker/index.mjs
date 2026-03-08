import { startWorkerLoop } from '../app/lib/alert/worker.mjs';

const timezoneName = process.env.ALERT_TIMEZONE || 'Asia/Shanghai';
const webhookUrl = process.env.FEISHU_WEBHOOK_URL || '';

startWorkerLoop({ timezoneName, webhookUrl }).catch((error) => {
  console.error('[fund-alert-worker] fatal', error);
  process.exit(1);
});
