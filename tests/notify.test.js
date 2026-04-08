import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendFeishuTextMessage } from '../src/notify/feishu.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendFeishuTextMessage', () => {
  it('treats a code=0 payload as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ code: 0, msg: 'success' })
    }));

    const result = await sendFeishuTextMessage({
      webhookUrl: 'https://open.feishu.cn/test',
      text: 'hello'
    });

    expect(result.success).toBe(true);
    expect(result.requestBody.content.text).toBe('hello');
  });

  it('rejects empty webhook urls', async () => {
    await expect(sendFeishuTextMessage({ webhookUrl: '', text: 'hello' })).rejects.toThrow(/webhook/i);
  });
});
