const FUND_CODE_RE = /^\d{5,6}$/;
const REQUEST_TIMEOUT_MS = 10_000;

const normalizeNullableNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const parseJsonpPayload = (text) => {
  const raw = String(text || '').trim();
  const matched = raw.match(/^jsonpgz\(([\s\S]+)\)\s*;?\s*$/);
  if (!matched?.[1]) {
    throw new Error('Invalid valuation payload');
  }

  return JSON.parse(matched[1]);
};

export const fetchFundRealtimeValuation = async (fundCode) => {
  const code = String(fundCode || '').trim();
  if (!FUND_CODE_RE.test(code)) {
    throw new Error(`Invalid fund code: ${fundCode}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`, {
      method: 'GET',
      headers: {
        Referer: 'https://fund.eastmoney.com/',
        'User-Agent': 'real-time-fund/1.0'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Fetch valuation failed: ${response.status}`);
    }

    const payload = parseJsonpPayload(await response.text());
    const estimateNav = normalizeNullableNumber(payload?.gsz);

    if (estimateNav === null) {
      throw new Error(`Realtime valuation unavailable: ${code}`);
    }

    return {
      code,
      name: String(payload?.name || '').trim() || code,
      estimateNav,
      estimateChangePercent: normalizeNullableNumber(payload?.gszzl),
      latestNav: normalizeNullableNumber(payload?.dwjz),
      navDate: String(payload?.jzrq || '').trim() || null,
      estimateTime: String(payload?.gztime || '').trim() || null
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
