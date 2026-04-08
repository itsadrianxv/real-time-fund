const DEFAULT_PERIOD = 14;

export const calculateEmaSeries = (values, period) => {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const safePeriod = Math.max(1, Number(period) || 1);
  const alpha = 2 / (safePeriod + 1);
  const series = [];
  let previous = Number(values[0]);

  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (index === 0) {
      previous = value;
    } else {
      previous = (value * alpha) + (previous * (1 - alpha));
    }
    series.push(previous);
  }

  return series;
};

const calculateTrueRange = (current, previous) => {
  if (!previous) {
    return Number(current.high) - Number(current.low);
  }

  return Math.max(
    Number(current.high) - Number(current.low),
    Math.abs(Number(current.high) - Number(previous.close)),
    Math.abs(Number(current.low) - Number(previous.close))
  );
};

const calculateDirectionalMoves = (current, previous) => {
  if (!previous) {
    return { plusDm: 0, minusDm: 0 };
  }

  const upMove = Number(current.high) - Number(previous.high);
  const downMove = Number(previous.low) - Number(current.low);

  return {
    plusDm: upMove > downMove && upMove > 0 ? upMove : 0,
    minusDm: downMove > upMove && downMove > 0 ? downMove : 0
  };
};

export const buildIndicatorSeries = (bars, period = DEFAULT_PERIOD) => {
  const closes = bars.map((item) => Number(item.close));
  const ema20Series = calculateEmaSeries(closes, 20);
  const ema60Series = calculateEmaSeries(closes, 60);

  const trValues = [];
  const plusDmValues = [];
  const minusDmValues = [];

  let trSmooth = 0;
  let plusDmSmooth = 0;
  let minusDmSmooth = 0;
  let dxSum = 0;
  let adx = 0;

  return bars.map((item, index) => {
    const previous = bars[index - 1];
    const tr = calculateTrueRange(item, previous);
    const { plusDm, minusDm } = calculateDirectionalMoves(item, previous);

    trValues.push(tr);
    plusDmValues.push(plusDm);
    minusDmValues.push(minusDm);

    if (index === period - 1) {
      trSmooth = trValues.slice(0, period).reduce((sum, value) => sum + value, 0);
      plusDmSmooth = plusDmValues.slice(0, period).reduce((sum, value) => sum + value, 0);
      minusDmSmooth = minusDmValues.slice(0, period).reduce((sum, value) => sum + value, 0);
    } else if (index >= period) {
      trSmooth = trSmooth - (trSmooth / period) + tr;
      plusDmSmooth = plusDmSmooth - (plusDmSmooth / period) + plusDm;
      minusDmSmooth = minusDmSmooth - (minusDmSmooth / period) + minusDm;
    }

    let plusDi = 0;
    let minusDi = 0;
    let dx = 0;

    if (index >= period - 1 && trSmooth > 0) {
      plusDi = (plusDmSmooth / trSmooth) * 100;
      minusDi = (minusDmSmooth / trSmooth) * 100;
      const denominator = plusDi + minusDi;
      dx = denominator === 0 ? 0 : (Math.abs(plusDi - minusDi) / denominator) * 100;
    }

    if (index >= period - 1 && index < ((period * 2) - 1)) {
      dxSum += dx;
      if (index === ((period * 2) - 2)) {
        adx = dxSum / period;
      }
    } else if (index >= ((period * 2) - 1)) {
      adx = ((adx * (period - 1)) + dx) / period;
    }

    return {
      ...item,
      ema20: ema20Series[index],
      ema60: ema60Series[index],
      plusDi,
      minusDi,
      adx14: adx
    };
  });
};
