import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { ALERT_BAR_CLOSES } from './defaults.mjs';

dayjs.extend(utc);
dayjs.extend(timezone);

const MORNING_START = '09:31';
const MORNING_END = '11:30';
const AFTERNOON_START = '13:01';
const AFTERNOON_END = '15:00';

export const toDayjsInTimezone = (input, tz) => dayjs(input).tz(tz);

export const formatHHmm = (input, tz) => toDayjsInTimezone(input, tz).format('HH:mm');

const toMinutes = (hhmm) => {
  const [hour, minute] = String(hhmm).split(':').map(Number);
  return hour * 60 + minute;
};

const isInRange = (minuteOfDay, start, end) => {
  const startMinute = toMinutes(start);
  const endMinute = toMinutes(end);
  return minuteOfDay >= startMinute && minuteOfDay <= endMinute;
};

export const isTradingMinute = (input, tz) => {
  const hhmm = formatHHmm(input, tz);
  const minuteOfDay = toMinutes(hhmm);
  return (
    isInRange(minuteOfDay, MORNING_START, MORNING_END)
    || isInRange(minuteOfDay, AFTERNOON_START, AFTERNOON_END)
  );
};

export const isBarCloseMinute = (timeframe, hhmm) => {
  const closes = ALERT_BAR_CLOSES[timeframe] || [];
  return closes.includes(hhmm);
};

const addMinutesToHHmm = (hhmm, minutes) => {
  const [hour, minute] = hhmm.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  const safe = Math.max(total, 0);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

export const resolveBarWindow = (baseDate, timeframe, closeHHmm, tz) => {
  const closes = ALERT_BAR_CLOSES[timeframe] || [];
  const idx = closes.indexOf(closeHHmm);
  if (idx < 0) {
    return null;
  }

  const startHHmm = idx === 0 ? MORNING_START : addMinutesToHHmm(closes[idx - 1], 1);

  const dateStr = toDayjsInTimezone(baseDate, tz).format('YYYY-MM-DD');
  const start = dayjs.tz(`${dateStr} ${startHHmm}`, 'YYYY-MM-DD HH:mm', tz);
  const end = dayjs.tz(`${dateStr} ${closeHHmm}`, 'YYYY-MM-DD HH:mm', tz);

  return { start, end };
};

export const aggregatePseudoBar = (samples) => {
  if (!Array.isArray(samples) || !samples.length) {
    return null;
  }

  const prices = samples
    .map((row) => Number(row.price))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!prices.length) {
    return null;
  }

  const open = prices[0];
  const close = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);

  return { open, high, low, close };
};

const ema = (values, period) => {
  if (!values.length) {
    return [];
  }

  const alpha = 2 / (period + 1);
  const output = [];
  let prev = values[0];

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (i === 0) {
      prev = value;
    } else {
      prev = value * alpha + prev * (1 - alpha);
    }
    output.push(prev);
  }

  return output;
};

const calcStd = (values) => {
  if (!values.length) {
    return 0;
  }

  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
};

const findPivotIndices = (bars, type, left, right) => {
  const indices = [];
  const total = bars.length;

  if (total < left + right + 1) {
    return indices;
  }

  for (let i = left; i < total - right; i += 1) {
    const value = Number(type === 'high' ? bars[i].high : bars[i].low);
    if (!Number.isFinite(value)) {
      continue;
    }

    let valid = true;

    for (let j = i - left; j <= i + right; j += 1) {
      if (j === i) {
        continue;
      }
      const compareValue = Number(type === 'high' ? bars[j].high : bars[j].low);
      if (!Number.isFinite(compareValue)) {
        valid = false;
        break;
      }

      if (type === 'high' && value < compareValue) {
        valid = false;
        break;
      }

      if (type === 'low' && value > compareValue) {
        valid = false;
        break;
      }
    }

    if (valid) {
      indices.push(i);
    }
  }

  return indices;
};

const buildTdCounter = (closes) => {
  const up = new Array(closes.length).fill(0);
  const down = new Array(closes.length).fill(0);

  for (let i = 4; i < closes.length; i += 1) {
    const current = closes[i];
    const compare = closes[i - 4];

    if (current > compare) {
      up[i] = up[i - 1] + 1;
      down[i] = 0;
    } else if (current < compare) {
      down[i] = down[i - 1] + 1;
      up[i] = 0;
    } else {
      up[i] = 0;
      down[i] = 0;
    }
  }

  return { up, down };
};

const listPriorPivots = (pivotIndices, currentIndex) => {
  const priors = [];
  for (let i = pivotIndices.length - 1; i >= 0; i -= 1) {
    if (pivotIndices[i] < currentIndex) {
      priors.push(pivotIndices[i]);
      if (priors.length >= 2) {
        break;
      }
    }
  }
  return priors;
};

const buildEpsDiffSeries = (diffs, windowSize, multiplier) => {
  return diffs.map((_, idx) => {
    const start = Math.max(0, idx - windowSize + 1);
    const subset = diffs.slice(start, idx + 1);
    return calcStd(subset) * multiplier;
  });
};

const isInvalidated = ({ direction, diffSeries, epsDiffSeries, startIndex }) => {
  if (startIndex === null || startIndex === undefined || startIndex < 0) {
    return true;
  }

  const anchor = diffSeries[startIndex];
  const eps = epsDiffSeries[startIndex] || 0;

  for (let i = startIndex + 1; i < diffSeries.length; i += 1) {
    if (direction === 'BULL' && diffSeries[i] < anchor - eps) {
      return true;
    }
    if (direction === 'BEAR' && diffSeries[i] > anchor + eps) {
      return true;
    }
  }

  return false;
};

export const buildTimeframeSignalState = ({ bars, params, timeframe, direction }) => {
  if (!Array.isArray(bars) || bars.length < 8) {
    return {
      timeframe,
      direction,
      activeA: false,
      activeB: false,
      hasEnoughBars: false,
      reason: 'bars_not_enough'
    };
  }

  const closes = bars.map((bar) => Number(bar.close));
  const highs = bars.map((bar) => Number(bar.high));
  const lows = bars.map((bar) => Number(bar.low));

  if (closes.some((value) => !Number.isFinite(value))) {
    return {
      timeframe,
      direction,
      activeA: false,
      activeB: false,
      hasEnoughBars: false,
      reason: 'bars_invalid'
    };
  }

  const emaFast = ema(closes, Math.max(2, Number(params.macd_fast || 12)));
  const emaSlow = ema(closes, Math.max(2, Number(params.macd_slow || 26)));
  const diffSeries = closes.map((_, idx) => emaFast[idx] - emaSlow[idx]);
  const td = buildTdCounter(closes);

  const left = Math.max(1, Number(params.pivot_left || 2));
  const right = Math.max(0, Number(params.pivot_right_confirm || 2));
  const minSep = Number(params?.min_sep_bars?.[timeframe] || 0);
  const epsPrice = Number(params.eps_price || 0.001);
  const epsDiffSeries = buildEpsDiffSeries(
    diffSeries,
    Math.max(5, Number(params.eps_diff_std_window || 60)),
    Number(params.eps_diff_std_mul || 0.1)
  );

  const pivotIndices = direction === 'BULL'
    ? findPivotIndices(bars, 'low', left, right)
    : findPivotIndices(bars, 'high', left, right);

  const eventA = new Array(bars.length).fill(false);
  const eventB = new Array(bars.length).fill(false);

  for (let i = 0; i < bars.length; i += 1) {
    const priors = listPriorPivots(pivotIndices, i);

    if (priors.length < 2) {
      continue;
    }

    const nearIndex = priors[0];
    const farIndex = priors[1];

    if (i - nearIndex < minSep) {
      continue;
    }

    const epsDiff = epsDiffSeries[i] || 0;

    if (direction === 'BULL') {
      const referencePrice = Math.min(lows[nearIndex], lows[farIndex]);
      const referenceDiff = Math.min(diffSeries[nearIndex], diffSeries[farIndex]);

      const priceNewLow = lows[i] <= referencePrice * (1 - epsPrice);
      const diffDull = diffSeries[i] >= referenceDiff - epsDiff;
      const td8 = td.down[i] >= 8;

      if (priceNewLow && diffDull && td8) {
        eventA[i] = true;
      }
    } else {
      const referencePrice = Math.max(highs[nearIndex], highs[farIndex]);
      const referenceDiff = Math.max(diffSeries[nearIndex], diffSeries[farIndex]);

      const priceNewHigh = highs[i] >= referencePrice * (1 + epsPrice);
      const diffDull = diffSeries[i] <= referenceDiff + epsDiff;
      const td8 = td.up[i] >= 8;

      if (priceNewHigh && diffDull && td8) {
        eventA[i] = true;
      }
    }
  }

  for (let i = 1; i < bars.length; i += 1) {
    if (!eventA[i - 1]) {
      continue;
    }

    if (direction === 'BULL' && closes[i] > closes[i - 1]) {
      eventB[i] = true;
    }

    if (direction === 'BEAR' && closes[i] < closes[i - 1]) {
      eventB[i] = true;
    }
  }

  const latestAIndex = (() => {
    for (let i = eventA.length - 1; i >= 0; i -= 1) {
      if (eventA[i]) {
        return i;
      }
    }
    return null;
  })();

  const latestBIndex = (() => {
    for (let i = eventB.length - 1; i >= 0; i -= 1) {
      if (eventB[i]) {
        return i;
      }
    }
    return null;
  })();

  const invalidA = isInvalidated({
    direction,
    diffSeries,
    epsDiffSeries,
    startIndex: latestAIndex
  });

  const invalidB = isInvalidated({
    direction,
    diffSeries,
    epsDiffSeries,
    startIndex: latestBIndex
  });

  const activeA = latestAIndex !== null && !invalidA;
  const activeB = latestBIndex !== null
    && !invalidB
    && latestAIndex !== null
    && latestBIndex >= latestAIndex;

  return {
    timeframe,
    direction,
    hasEnoughBars: true,
    activeA,
    activeB,
    invalidA,
    invalidB,
    latestAIndex,
    latestBIndex,
    latestClose: closes[closes.length - 1],
    latestDiff: diffSeries[diffSeries.length - 1]
  };
};

const evaluateStage = (tfStates) => {
  const s15 = tfStates['15m'];
  const s30 = tfStates['30m'];
  const s60 = tfStates['60m'];

  if (!s15 || !s30 || !s60) {
    return {
      preMatched: false,
      execMatched: false,
      reason: 'timeframe_missing'
    };
  }

  if (!s15.hasEnoughBars || !s30.hasEnoughBars || !s60.hasEnoughBars) {
    return {
      preMatched: false,
      execMatched: false,
      reason: 'bars_not_enough'
    };
  }

  const preMatched = s60.activeA && (s30.activeA || s30.activeB) && s15.activeA;
  const execMatched = s60.activeA && s30.activeB && (s15.activeB || s15.activeA) && !s60.invalidA && !s30.invalidA;

  if (execMatched) {
    return {
      preMatched,
      execMatched,
      reason: 'exec_matched'
    };
  }

  if (preMatched) {
    return {
      preMatched,
      execMatched,
      reason: 'pre_only'
    };
  }

  return {
    preMatched,
    execMatched,
    reason: 'condition_not_met'
  };
};

export const evaluateDirectionSignal = ({ barsByTimeframe, params, direction }) => {
  const tfStates = {};

  for (const timeframe of ['15m', '30m', '60m']) {
    tfStates[timeframe] = buildTimeframeSignalState({
      bars: barsByTimeframe[timeframe] || [],
      params,
      timeframe,
      direction
    });
  }

  const stage = evaluateStage(tfStates);

  return {
    direction,
    states: tfStates,
    ...stage
  };
};

export const buildReviewSummary = ({ preSent, execSent, result }) => {
  if (!preSent && !execSent) {
    return {
      shouldNotify: false,
      status: 'NO_SIGNAL',
      reason: 'no_pre_or_exec_signal'
    };
  }

  if (result.execMatched) {
    return {
      shouldNotify: true,
      status: 'VALID',
      reason: 'exec_rule_matched_at_close'
    };
  }

  if (result.preMatched) {
    return {
      shouldNotify: true,
      status: 'PARTIAL',
      reason: 'pre_rule_kept_but_exec_not_matched'
    };
  }

  return {
    shouldNotify: true,
    status: 'INVALID',
    reason: result.reason || 'condition_invalidated'
  };
};
