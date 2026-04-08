export const sendFeishuTextMessage = async ({ webhookUrl, text }) => {
  if (!String(webhookUrl || '').trim()) {
    throw new Error('Feishu webhook url is required');
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
  let responseBody;

  try {
    responseBody = JSON.parse(responseText);
  } catch (_error) {
    responseBody = { raw: responseText };
  }

  return {
    success: response.ok && (responseBody?.StatusCode === 0 || responseBody?.code === 0 || responseBody?.msg === 'success'),
    status: response.status,
    requestBody,
    responseBody
  };
};
