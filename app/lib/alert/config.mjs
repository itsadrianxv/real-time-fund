import { ALERT_DEFAULT_PARAMS } from './defaults.mjs';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const deepMerge = (base, incoming) => {
  const output = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
};

const normalizeTime = (value, fallback) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return fallback;
  }

  const [hour, minute] = trimmed.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const normalizeParams = (params) => {
  const output = { ...params };

  output.macd_fast = Number(output.macd_fast || ALERT_DEFAULT_PARAMS.macd_fast);
  output.macd_slow = Number(output.macd_slow || ALERT_DEFAULT_PARAMS.macd_slow);
  output.macd_signal = Number(output.macd_signal || ALERT_DEFAULT_PARAMS.macd_signal);
  output.pivot_left = Number(output.pivot_left || ALERT_DEFAULT_PARAMS.pivot_left);
  output.pivot_right_confirm = Number(output.pivot_right_confirm || ALERT_DEFAULT_PARAMS.pivot_right_confirm);
  output.pivot_right_preview = Number(output.pivot_right_preview || ALERT_DEFAULT_PARAMS.pivot_right_preview);
  output.eps_price = Number(output.eps_price || ALERT_DEFAULT_PARAMS.eps_price);
  output.eps_diff_std_window = Number(output.eps_diff_std_window || ALERT_DEFAULT_PARAMS.eps_diff_std_window);
  output.eps_diff_std_mul = Number(output.eps_diff_std_mul || ALERT_DEFAULT_PARAMS.eps_diff_std_mul);

  output.td_mode = output.td_mode || ALERT_DEFAULT_PARAMS.td_mode;

  output.min_sep_bars = {
    ...ALERT_DEFAULT_PARAMS.min_sep_bars,
    ...(isPlainObject(output.min_sep_bars) ? output.min_sep_bars : {})
  };

  output.pre_alert_time = normalizeTime(output.pre_alert_time, ALERT_DEFAULT_PARAMS.pre_alert_time);
  output.exec_alert_time = normalizeTime(output.exec_alert_time, ALERT_DEFAULT_PARAMS.exec_alert_time);
  output.review_time = normalizeTime(output.review_time, ALERT_DEFAULT_PARAMS.review_time);

  return output;
};

export const mergeAlertParams = ({ strategyParams, overrideParams } = {}) => {
  const merged = deepMerge(
    deepMerge(ALERT_DEFAULT_PARAMS, isPlainObject(strategyParams) ? strategyParams : {}),
    isPlainObject(overrideParams) ? overrideParams : {}
  );

  return normalizeParams(merged);
};

export const resolveBindingRuntimeConfig = (bindingRow) => {
  const params = mergeAlertParams({
    strategyParams: bindingRow?.strategy_enabled === false ? {} : bindingRow?.strategy_params_json,
    overrideParams: bindingRow?.params_override_json
  });

  return {
    targetFundCode: bindingRow?.target_fund_code,
    targetFundName: bindingRow?.target_fund_name,
    benchmarkFundCode: bindingRow?.benchmark_fund_code,
    benchmarkFundName: bindingRow?.benchmark_fund_name,
    strategyProfileId: bindingRow?.strategy_profile_id,
    strategyProfileName: bindingRow?.strategy_profile_name || null,
    params
  };
};

