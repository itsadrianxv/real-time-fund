import { ALERT_STAGES } from './defaults.mjs';

const stageLabelMap = {
  [ALERT_STAGES.PRE]: '预警',
  [ALERT_STAGES.EXEC]: '执行提醒',
  [ALERT_STAGES.REVIEW]: '收盘复盘'
};

const directionLabelMap = {
  BULL: '偏多',
  BEAR: '偏空'
};

const nowTs = () => new Date().toISOString();

export const buildFeishuMessageText = ({
  stage,
  direction,
  binding,
  payload
}) => {
  const lines = [
    `基金日频提醒｜${stageLabelMap[stage] || stage}`,
    `方向：${directionLabelMap[direction] || direction}`,
    `交易基金：${binding.targetFundName}(${binding.targetFundCode})`,
    `驱动标的：${binding.benchmarkFundName}(${binding.benchmarkFundCode})`,
    `时间：${nowTs()}`
  ];

  if (payload?.status) {
    lines.push(`结论：${payload.status}`);
  }

  if (payload?.reason) {
    lines.push(`原因：${payload.reason}`);
  }

  if (payload?.params) {
    lines.push(`参数快照：${JSON.stringify(payload.params)}`);
  }

  return lines.join('\n');
};

export const sendFeishuTextMessage = async ({ webhookUrl, text }) => {
  if (!webhookUrl) {
    throw new Error('FEISHU_WEBHOOK_URL is empty');
  }

  const requestBody = {
    msg_type: 'text',
    content: {
      text
    }
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  let responseJson = null;

  try {
    responseJson = JSON.parse(responseText);
  } catch (_error) {
    responseJson = { raw: responseText };
  }

  const success = response.ok && (responseJson?.StatusCode === 0 || responseJson?.code === 0 || responseJson?.msg === 'success');

  return {
    success,
    status: response.status,
    requestBody,
    responseBody: responseJson
  };
};
