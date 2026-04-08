import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {
  getStrategyState,
  insertNotifyLog,
  listBarsForFund,
  listFundValuationSamplesInRange,
  upsertFundBar60m,
  upsertFundValuationSample1m,
  upsertStrategyEvent,
  upsertStrategyState
} from '../db/sqlite.js';
import {
  aggregateBarFromSamples,
  getBarWindowForClose,
  isBarCloseMinute,
  isTradingMinute,
  truncateToMinute
} from '../strategy/bar-aggregation.js';
import { evaluateFundSignal } from '../strategy/engine.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const toNow = (input, timezoneName) =>
  (input ? dayjs(input) : dayjs()).tz(timezoneName).second(0).millisecond(0);

const buildNotificationMessage = (fund, event) => ({
  text: [
    `基金提醒: ${event.eventType}`,
    `基金: ${fund.name} (${fund.code})`,
    `bar: ${event.triggerBarEndTime}`,
    `anchor: ${event.anchorBarEndTime || '-'}`,
    `payload: ${JSON.stringify(event.payload)}`
  ].join('\n')
});

export const runDaemonTick = async ({
  config,
  db,
  now,
  fetchValuation,
  sendNotification,
  isTradingDayFn
}) => {
  const current = toNow(now, config.timezone);
  const enabledFunds = config.funds.filter((fund) => fund.enabled);

  if (!isTradingDayFn(current) || !isTradingMinute(current, config.timezone)) {
    return {
      sampledFunds: 0,
      aggregatedBars: 0,
      recordedEvents: 0
    };
  }

  const sampleMinute = truncateToMinute(current, config.timezone).toISOString();
  let sampledFunds = 0;
  let aggregatedBars = 0;
  let recordedEvents = 0;

  for (const fund of enabledFunds) {
    const valuation = await fetchValuation(fund.code);

    upsertFundValuationSample1m(db, {
      fundCode: fund.code,
      fundName: fund.name,
      sampleMinute,
      tradeDate: current.format('YYYY-MM-DD'),
      estimateNav: valuation.estimateNav,
      estimateChangePercent: valuation.estimateChangePercent ?? null,
      latestNav: valuation.latestNav ?? null,
      navDate: valuation.navDate ?? null,
      estimateTime: valuation.estimateTime ?? null
    });
    sampledFunds += 1;

    if (!isBarCloseMinute(current, config.market.barCloses, config.timezone)) {
      continue;
    }

    const barWindow = getBarWindowForClose(current, config.timezone);
    if (!barWindow) {
      continue;
    }

    const samples = listFundValuationSamplesInRange(db, {
      fundCode: fund.code,
      startMinute: barWindow.start.toISOString(),
      endMinute: barWindow.end.toISOString()
    });
    const aggregated = aggregateBarFromSamples(samples);
    if (!aggregated) {
      continue;
    }

    const barWrite = upsertFundBar60m(db, {
      fundCode: fund.code,
      fundName: fund.name,
      barEndTime: barWindow.end.toISOString(),
      ...aggregated
    });
    if (!barWrite.inserted) {
      continue;
    }
    aggregatedBars += 1;

    const state = getStrategyState(db, fund.code) || {
      fundCode: fund.code,
      positionState: Number(fund.shares || 0) > 0 ? 'LONG' : 'FLAT',
      pendingAnchorBarEndTime: '',
      lastConsumedAnchorBarEndTime: '',
      lastEntryBarEndTime: '',
      lastExitBarEndTime: '',
      updatedAt: ''
    };
    const bars = listBarsForFund(db, fund.code, 100);
    const evaluation = evaluateFundSignal({ bars, state });
    upsertStrategyState(db, {
      ...evaluation.nextState,
      fundCode: fund.code
    });

    for (const event of evaluation.events) {
      const stored = upsertStrategyEvent(db, {
        fundCode: fund.code,
        fundName: fund.name,
        eventType: event.eventType,
        triggerBarEndTime: event.triggerBarEndTime,
        anchorBarEndTime: event.anchorBarEndTime,
        payload: event.payload
      });
      if (!stored.inserted) {
        continue;
      }

      recordedEvents += 1;
      if (event.eventType === 'SETUP_INVALIDATED') {
        continue;
      }

      const request = buildNotificationMessage(fund, event);
      const response = await sendNotification(request);
      insertNotifyLog(db, {
        eventId: stored.row.id,
        channel: config.notification.channel,
        request,
        response,
        success: Boolean(response?.success)
      });
    }
  }

  return {
    sampledFunds,
    aggregatedBars,
    recordedEvents
  };
};

export const startDaemon = async ({
  config,
  db,
  fetchValuation,
  sendNotification,
  isTradingDayFn,
  log = console.log
}) => {
  log(`[fund-alert] daemon started timezone=${config.timezone}`);

  const scheduleNext = async () => {
    const now = dayjs().tz(config.timezone);
    const intervalSeconds = Math.max(1, Number(config.runtime.sampleIntervalSeconds || 60));
    const nextTick = now
      .add(intervalSeconds, 'second')
      .second(0)
      .millisecond(0);
    const waitMs = Math.max(100, nextTick.diff(now, 'millisecond'));

    setTimeout(async () => {
      try {
        await runDaemonTick({
          config,
          db,
          fetchValuation,
          sendNotification,
          isTradingDayFn
        });
      } catch (error) {
        log(`[fund-alert] tick error: ${error.message}`);
      } finally {
        await scheduleNext();
      }
    }, waitMs);
  };

  await runDaemonTick({
    config,
    db,
    fetchValuation,
    sendNotification,
    isTradingDayFn
  });

  await scheduleNext();
};
