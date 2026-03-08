import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {
  ensureAlertSchema,
  listEnabledBindingsWithProfile,
  listEtfSamplesInRange,
  upsertEtfSample1m,
  upsertEtfBar,
  listRecentBars,
  upsertSignalEvent,
  listSignalEventsByDay,
  insertNotifyLog
} from './db.mjs';
import { resolveBindingRuntimeConfig } from './config.mjs';
import { fetchBenchmarkLatestPrice } from './market.mjs';
import {
  isBarCloseMinute,
  resolveBarWindow,
  aggregatePseudoBar,
  evaluateDirectionSignal,
  buildReviewSummary,
  isTradingMinute,
  formatHHmm
} from './engine.mjs';
import { ALERT_DIRECTIONS, ALERT_STAGES, ALERT_TIMEFRAMES } from './defaults.mjs';
import { buildFeishuMessageText, sendFeishuTextMessage } from './notifier.mjs';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = (...args) => {
  console.log('[fund-alert-worker]', ...args);
};

const nowInTz = (tz) => dayjs().tz(tz).second(0).millisecond(0);

const isSamplingMinute = (input, tz) => {
  const hhmm = formatHHmm(input, tz);
  const morning = hhmm >= '09:31' && hhmm <= '11:30';
  const afternoon = hhmm >= '13:01' && hhmm <= '14:59';
  return morning || afternoon;
};

const loadRuntimeBindings = async () => {
  const rows = await listEnabledBindingsWithProfile();
  return rows.map((row) => resolveBindingRuntimeConfig(row));
};

const sampleBenchmarks = async ({ runtimeBindings, timestamp }) => {
  const benchmarkMap = new Map();
  for (const binding of runtimeBindings) {
    if (binding?.benchmarkFundCode) {
      benchmarkMap.set(binding.benchmarkFundCode, binding);
    }
  }

  for (const [benchmarkCode] of benchmarkMap.entries()) {
    try {
      const quote = await fetchBenchmarkLatestPrice(benchmarkCode);
      await upsertEtfSample1m({
        benchmarkFundCode: benchmarkCode,
        sampleTime: timestamp.toDate(),
        price: quote.price
      });
    } catch (error) {
      log('sample_failed', benchmarkCode, error.message);
    }
  }
};

const aggregateClosedBars = async ({ runtimeBindings, timestamp, timezoneName }) => {
  const hhmm = timestamp.format('HH:mm');
  const uniqueBenchmarkCodes = [...new Set(runtimeBindings.map((item) => item.benchmarkFundCode).filter(Boolean))];

  for (const timeframe of ALERT_TIMEFRAMES) {
    if (!isBarCloseMinute(timeframe, hhmm)) {
      continue;
    }

    const barWindow = resolveBarWindow(timestamp, timeframe, hhmm, timezoneName);
    if (!barWindow) {
      continue;
    }

    for (const benchmarkCode of uniqueBenchmarkCodes) {
      const samples = await listEtfSamplesInRange({
        benchmarkFundCode: benchmarkCode,
        startTime: barWindow.start.toDate(),
        endTime: barWindow.end.toDate()
      });

      const bar = aggregatePseudoBar(samples);
      if (!bar) {
        continue;
      }

      await upsertEtfBar({
        benchmarkFundCode: benchmarkCode,
        timeframe,
        barEndTime: barWindow.end.toDate(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close
      });
    }
  }
};

const evaluateBindingSignal = async ({ binding, cutoffTime }) => {
  const barsByTimeframe = {};

  for (const timeframe of ALERT_TIMEFRAMES) {
    const bars = await listRecentBars({
      benchmarkFundCode: binding.benchmarkFundCode,
      timeframe,
      barEndTimeLte: cutoffTime.toDate(),
      limit: 240
    });

    barsByTimeframe[timeframe] = bars;
  }

  const bull = evaluateDirectionSignal({
    barsByTimeframe,
    params: binding.params,
    direction: ALERT_DIRECTIONS.BULL
  });

  const bear = evaluateDirectionSignal({
    barsByTimeframe,
    params: binding.params,
    direction: ALERT_DIRECTIONS.BEAR
  });

  return { bull, bear };
};

const stageAlreadySent = (events, stage) => {
  return events.some((event) => event.event_stage === stage && event.sent);
};

const notifyStage = async ({
  stage,
  direction,
  binding,
  eventDate,
  payload,
  webhookUrl
}) => {
  let eventRecord = await upsertSignalEvent({
    eventDate,
    stage,
    direction,
    targetFundCode: binding.targetFundCode,
    benchmarkFundCode: binding.benchmarkFundCode,
    payload,
    sent: false
  });

  let notifyResult;
  let success = false;

  try {
    const text = buildFeishuMessageText({
      stage,
      direction,
      binding,
      payload
    });

    notifyResult = await sendFeishuTextMessage({
      webhookUrl,
      text
    });

    success = Boolean(notifyResult.success);

    eventRecord = await upsertSignalEvent({
      eventDate,
      stage,
      direction,
      targetFundCode: binding.targetFundCode,
      benchmarkFundCode: binding.benchmarkFundCode,
      payload,
      sent: success
    });

    await insertNotifyLog({
      channel: 'FEISHU',
      eventId: eventRecord?.id || null,
      targetFundCode: binding.targetFundCode,
      request: notifyResult.requestBody || {},
      response: notifyResult.responseBody || {},
      success
    });
  } catch (error) {
    notifyResult = { error: error.message };

    await insertNotifyLog({
      channel: 'FEISHU',
      eventId: eventRecord?.id || null,
      targetFundCode: binding.targetFundCode,
      request: {},
      response: notifyResult,
      success: false
    });
  }

  return {
    success,
    eventRecord,
    notifyResult
  };
};

const processStageForDirection = async ({
  stage,
  direction,
  result,
  binding,
  eventDate,
  webhookUrl,
  dayEvents
}) => {
  if (stageAlreadySent(dayEvents, stage)) {
    return;
  }

  if (stage === ALERT_STAGES.PRE && !result.preMatched) {
    return;
  }

  if (stage === ALERT_STAGES.EXEC && !result.execMatched) {
    return;
  }

  const payload = {
    stage,
    direction,
    preMatched: result.preMatched,
    execMatched: result.execMatched,
    reason: result.reason,
    params: binding.params
  };

  await notifyStage({
    stage,
    direction,
    binding,
    eventDate,
    payload,
    webhookUrl
  });
};

const processReviewStage = async ({
  binding,
  direction,
  result,
  eventDate,
  webhookUrl,
  dayEvents
}) => {
  if (stageAlreadySent(dayEvents, ALERT_STAGES.REVIEW)) {
    return;
  }

  const preSent = dayEvents.some((item) => item.event_stage === ALERT_STAGES.PRE && item.sent);
  const execSent = dayEvents.some((item) => item.event_stage === ALERT_STAGES.EXEC && item.sent);

  const review = buildReviewSummary({
    preSent,
    execSent,
    result
  });

  if (!review.shouldNotify) {
    return;
  }

  const payload = {
    stage: ALERT_STAGES.REVIEW,
    direction,
    status: review.status,
    reason: review.reason,
    preSent,
    execSent,
    params: binding.params
  };

  await notifyStage({
    stage: ALERT_STAGES.REVIEW,
    direction,
    binding,
    eventDate,
    payload,
    webhookUrl
  });
};

const processBindingStages = async ({ binding, timestamp, timezoneName, webhookUrl }) => {
  const eventDate = timestamp.format('YYYY-MM-DD');
  const hhmm = timestamp.format('HH:mm');

  const needPre = hhmm === binding.params.pre_alert_time;
  const needExec = hhmm === binding.params.exec_alert_time;
  const needReview = hhmm === binding.params.review_time;

  if (!needPre && !needExec && !needReview) {
    return;
  }

  const signal = await evaluateBindingSignal({
    binding,
    cutoffTime: timestamp
  });

  const directionResultMap = {
    [ALERT_DIRECTIONS.BULL]: signal.bull,
    [ALERT_DIRECTIONS.BEAR]: signal.bear
  };

  for (const direction of [ALERT_DIRECTIONS.BULL, ALERT_DIRECTIONS.BEAR]) {
    const dayEvents = await listSignalEventsByDay({
      eventDate,
      targetFundCode: binding.targetFundCode,
      direction
    });

    const result = directionResultMap[direction];

    if (needPre) {
      await processStageForDirection({
        stage: ALERT_STAGES.PRE,
        direction,
        result,
        binding,
        eventDate,
        webhookUrl,
        dayEvents
      });
    }

    if (needExec) {
      await processStageForDirection({
        stage: ALERT_STAGES.EXEC,
        direction,
        result,
        binding,
        eventDate,
        webhookUrl,
        dayEvents
      });
    }

    if (needReview) {
      await processReviewStage({
        binding,
        direction,
        result,
        eventDate,
        webhookUrl,
        dayEvents
      });
    }
  }
};

export const runWorkerTick = async ({ timezoneName, webhookUrl }) => {
  await ensureAlertSchema();

  const now = nowInTz(timezoneName);
  const runtimeBindings = await loadRuntimeBindings();

  if (!runtimeBindings.length) {
    log('tick_skip_no_binding', now.format());
    return;
  }

  if (isSamplingMinute(now, timezoneName)) {
    await sampleBenchmarks({ runtimeBindings, timestamp: now });
  }

  await aggregateClosedBars({
    runtimeBindings,
    timestamp: now,
    timezoneName
  });

  for (const binding of runtimeBindings) {
    await processBindingStages({
      binding,
      timestamp: now,
      timezoneName,
      webhookUrl
    });
  }

  log('tick_done', now.format(), `bindings=${runtimeBindings.length}`);
};

export const startWorkerLoop = async ({ timezoneName, webhookUrl }) => {
  if (String(process.env.ENABLE_ALERT_WORKER || 'true').toLowerCase() !== 'true') {
    log('worker_disabled_by_env');
    return;
  }

  log('worker_started', `timezone=${timezoneName}`);

  await runWorkerTick({ timezoneName, webhookUrl });

  const scheduleNext = async () => {
    const now = dayjs().tz(timezoneName);
    const nextMinute = now.add(1, 'minute').second(0).millisecond(0);
    const waitMs = Math.max(100, nextMinute.diff(now, 'millisecond'));

    setTimeout(async () => {
      try {
        const tickNow = dayjs().tz(timezoneName);
        const hhmm = tickNow.format('HH:mm');
        const inReviewWindow = hhmm >= '14:50' && hhmm <= '15:00';
        if (isTradingMinute(tickNow, timezoneName) || inReviewWindow) {
          await runWorkerTick({ timezoneName, webhookUrl });
        }
      } catch (error) {
        log('tick_error', error.message);
      } finally {
        await scheduleNext();
      }
    }, waitMs);
  };

  await scheduleNext();
};


