export const ALERT_TIMEFRAMES = ['15m', '30m', '60m'];

export const ALERT_DEFAULT_PARAMS = {
  macd_fast: 12,
  macd_slow: 26,
  macd_signal: 9,
  td_mode: 'TD8',
  pivot_left: 2,
  pivot_right_confirm: 2,
  pivot_right_preview: 0,
  min_sep_bars: {
    '15m': 8,
    '30m': 4,
    '60m': 2
  },
  eps_price: 0.001,
  eps_diff_std_window: 60,
  eps_diff_std_mul: 0.1,
  pre_alert_time: '14:50',
  exec_alert_time: '14:58',
  review_time: '15:00'
};

export const ALERT_BAR_CLOSES = {
  '15m': [
    '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30',
    '13:15', '13:30', '13:45', '14:00', '14:15', '14:30', '14:45', '15:00'
  ],
  '30m': ['10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00'],
  '60m': ['10:30', '11:30', '14:00', '15:00']
};

export const ALERT_STAGES = {
  PRE: 'PRE',
  EXEC: 'EXEC',
  REVIEW: 'REVIEW'
};

export const ALERT_DIRECTIONS = {
  BULL: 'BULL',
  BEAR: 'BEAR'
};
