const normalizeCode = (code) => String(code || '').trim();

export const toTencentSymbol = (fundCode) => {
  const code = normalizeCode(fundCode);
  if (!/^\d{5,6}$/.test(code)) {
    throw new Error(`invalid benchmark fund code: ${fundCode}`);
  }

  if (code.length === 5) {
    return `hk${code}`;
  }

  if (code.startsWith('5') || code.startsWith('6') || code.startsWith('9')) {
    return `sh${code}`;
  }

  return `sz${code}`;
};

const parseTencentQuote = (text) => {
  const quoted = text.match(/"([^"]+)"/);
  if (!quoted?.[1]) {
    return null;
  }

  const parts = quoted[1].split('~');
  const candidates = [parts[3], parts[4], parts[5], parts[6]].map(Number);
  const price = candidates.find((value) => Number.isFinite(value) && value > 0);

  if (!Number.isFinite(price)) {
    return null;
  }

  return {
    name: parts[1] || '',
    code: parts[2] || '',
    price
  };
};

export const fetchBenchmarkLatestPrice = async (benchmarkFundCode) => {
  const symbol = toTencentSymbol(benchmarkFundCode);
  const url = `https://qt.gtimg.cn/q=${symbol}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Referer: 'https://qt.gtimg.cn/'
    }
  });

  if (!response.ok) {
    throw new Error(`fetch quote failed: ${response.status}`);
  }

  const text = await response.text();
  const parsed = parseTencentQuote(text);

  if (!parsed) {
    throw new Error('quote payload parse failed');
  }

  return parsed;
};
