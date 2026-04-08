import { buildIndicatorSeries } from './indicators.js';
import { evaluateCurrentBar } from './evaluator.js';

export const MIN_REQUIRED_BARS = 63;

export const evaluateFundSignal = ({ bars, state }) => {
  if (!Array.isArray(bars) || bars.length < MIN_REQUIRED_BARS) {
    return {
      nextState: { ...state },
      events: []
    };
  }

  const indicatorSeries = buildIndicatorSeries(bars);
  return evaluateCurrentBar({
    series: indicatorSeries,
    state
  });
};
