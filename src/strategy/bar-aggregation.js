import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TRADING_WINDOWS = [
  ['09:31', '11:30'],
  ['13:01', '15:00']
];

const BAR_WINDOWS = {
  '10:30': ['09:31', '10:30'],
  '11:30': ['10:31', '11:30'],
  '14:00': ['13:01', '14:00'],
  '15:00': ['14:01', '15:00']
};

const toDayjs = (input, timezoneName) => dayjs(input).tz(timezoneName);

const toMinutes = (hhmm) => {
  const [hours, minutes] = String(hhmm).split(':').map(Number);
  return (hours * 60) + minutes;
};

export const formatMinute = (input, timezoneName) => toDayjs(input, timezoneName).format('HH:mm');

export const truncateToMinute = (input, timezoneName) =>
  toDayjs(input, timezoneName).second(0).millisecond(0);

export const isTradingMinute = (input, timezoneName) => {
  const minute = toMinutes(formatMinute(input, timezoneName));
  return TRADING_WINDOWS.some(([start, end]) => minute >= toMinutes(start) && minute <= toMinutes(end));
};

export const isBarCloseMinute = (input, barCloses, timezoneName) => {
  const hhmm = formatMinute(input, timezoneName);
  return (barCloses || []).includes(hhmm);
};

export const getBarWindowForClose = (closeTime, timezoneName) => {
  const base = toDayjs(closeTime, timezoneName);
  const closeMinute = base.format('HH:mm');
  const window = BAR_WINDOWS[closeMinute];
  if (!window) {
    return null;
  }

  const dateText = base.format('YYYY-MM-DD');
  return {
    start: dayjs.tz(`${dateText} ${window[0]}`, 'YYYY-MM-DD HH:mm', timezoneName),
    end: dayjs.tz(`${dateText} ${window[1]}`, 'YYYY-MM-DD HH:mm', timezoneName)
  };
};

export const aggregateBarFromSamples = (samples) => {
  const prices = (Array.isArray(samples) ? samples : [])
    .map((sample) => Number(sample.estimate_nav ?? sample.estimateNav ?? sample.price))
    .filter((value) => Number.isFinite(value));

  if (!prices.length) {
    return null;
  }

  return {
    open: prices[0],
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: prices[prices.length - 1]
  };
};
