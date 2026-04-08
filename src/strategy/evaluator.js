const MAX_ANCHOR_LOOKBACK = 4;

const isTrendEstablished = (series, currentIndex) => {
  if (currentIndex < 3) {
    return false;
  }

  const current = series[currentIndex];
  const minusThree = series[currentIndex - 3];

  return (
    current.close > current.ema20
    && current.ema20 > current.ema60
    && current.ema60 > minusThree.ema60
    && current.adx14 >= 20
    && current.plusDi > current.minusDi
  );
};

const isRestartConfirmed = (series, currentIndex) => {
  if (currentIndex < 1) {
    return false;
  }

  const current = series[currentIndex];
  const previous = series[currentIndex - 1];

  return (
    current.close > previous.high
    && current.close > current.ema20
    && current.close > current.open
  );
};

const isAnchorCandidate = (item) =>
  item.low <= (item.ema20 * 1.003)
  && item.close >= item.ema60;

const selectPendingAnchorBarEndTime = (series, currentIndex, lastConsumedAnchorBarEndTime) => {
  const startIndex = Math.max(0, currentIndex - MAX_ANCHOR_LOOKBACK);

  for (let index = currentIndex - 1; index >= startIndex; index -= 1) {
    const candidate = series[index];
    if (!isAnchorCandidate(candidate)) {
      continue;
    }
    if (candidate.barEndTime === lastConsumedAnchorBarEndTime) {
      return '';
    }
    return candidate.barEndTime;
  }

  return '';
};

const buildExitReasons = (series, currentIndex, positionState) => {
  if (positionState !== 'LONG' || currentIndex < 1) {
    return [];
  }

  const current = series[currentIndex];
  const previous = series[currentIndex - 1];
  const reasons = [];

  if (current.close < current.ema60 && previous.close < previous.ema60) {
    reasons.push('EMA60_TWO_CLOSES_BREAK');
  }

  if (currentIndex >= 10) {
    const recentLows = series.slice(currentIndex - 10, currentIndex).map((item) => item.low);
    const lowestLow = Math.min(...recentLows);
    if (current.close < lowestLow) {
      reasons.push('CHANNEL_10_LOW_BREAK');
    }
  }

  return reasons;
};

const buildInvalidationReasons = (current, pendingAnchorBarEndTime) => {
  if (!pendingAnchorBarEndTime) {
    return [];
  }

  const reasons = [];
  if (current.close < current.ema60) {
    reasons.push('CLOSE_BELOW_EMA60');
  }
  if (current.plusDi <= current.minusDi) {
    reasons.push('DI_CROSSDOWN');
  }
  return reasons;
};

const canEmitAddEntry = (series, currentIndex, lastEntryBarEndTime) => {
  if (!lastEntryBarEndTime) {
    return true;
  }

  const lastEntryIndex = series.findIndex((item) => item.barEndTime === lastEntryBarEndTime);
  if (lastEntryIndex < 0) {
    return true;
  }

  return (currentIndex - lastEntryIndex) >= 2;
};

const buildMetricSnapshot = (current) => ({
  close: current.close,
  ema20: current.ema20,
  ema60: current.ema60,
  adx14: current.adx14,
  plusDi: current.plusDi,
  minusDi: current.minusDi
});

export const evaluateCurrentBar = ({ series, state }) => {
  const currentIndex = (series || []).length - 1;
  if (currentIndex < 0) {
    return {
      nextState: { ...state },
      events: []
    };
  }

  const current = series[currentIndex];
  const nextState = {
    ...state,
    pendingAnchorBarEndTime: selectPendingAnchorBarEndTime(
      series,
      currentIndex,
      state.lastConsumedAnchorBarEndTime
    ),
    updatedAt: current.barEndTime
  };
  const events = [];

  const invalidationReasons = buildInvalidationReasons(current, nextState.pendingAnchorBarEndTime);
  if (invalidationReasons.length > 0) {
    events.push({
      eventType: 'SETUP_INVALIDATED',
      triggerBarEndTime: current.barEndTime,
      anchorBarEndTime: nextState.pendingAnchorBarEndTime,
      payload: {
        invalidate_reasons: invalidationReasons,
        ...buildMetricSnapshot(current)
      }
    });
    nextState.pendingAnchorBarEndTime = '';
  }

  const exitReasons = buildExitReasons(series, currentIndex, state.positionState);
  if (exitReasons.length > 0) {
    events.push({
      eventType: 'EXIT',
      triggerBarEndTime: current.barEndTime,
      anchorBarEndTime: nextState.pendingAnchorBarEndTime,
      payload: {
        exit_reasons: exitReasons,
        ...buildMetricSnapshot(current)
      }
    });
    nextState.positionState = 'FLAT';
    nextState.pendingAnchorBarEndTime = '';
    nextState.lastExitBarEndTime = current.barEndTime;
    return { nextState, events };
  }

  if (!nextState.pendingAnchorBarEndTime) {
    return { nextState, events };
  }

  if (!isTrendEstablished(series, currentIndex) || !isRestartConfirmed(series, currentIndex)) {
    return { nextState, events };
  }

  const entryMode = state.positionState === 'FLAT'
    ? 'INITIAL'
    : (
        nextState.pendingAnchorBarEndTime !== state.lastConsumedAnchorBarEndTime
        && canEmitAddEntry(series, currentIndex, state.lastEntryBarEndTime)
      )
      ? 'ADD'
      : '';

  if (!entryMode) {
    return { nextState, events };
  }

  events.push({
    eventType: 'ENTRY',
    triggerBarEndTime: current.barEndTime,
    anchorBarEndTime: nextState.pendingAnchorBarEndTime,
    payload: {
      entry_mode: entryMode,
      ...buildMetricSnapshot(current)
    }
  });

  nextState.positionState = 'LONG';
  nextState.lastEntryBarEndTime = current.barEndTime;
  nextState.lastConsumedAnchorBarEndTime = nextState.pendingAnchorBarEndTime;
  nextState.pendingAnchorBarEndTime = '';

  return { nextState, events };
};
