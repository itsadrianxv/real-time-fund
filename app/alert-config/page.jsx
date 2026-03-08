'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import { ALERT_DEFAULT_PARAMS } from '../lib/alert/defaults.mjs';

const DEFAULT_STRATEGY_FORM = {
  id: null,
  name: '',
  enabled: true,
  macd_fast: String(ALERT_DEFAULT_PARAMS.macd_fast),
  macd_slow: String(ALERT_DEFAULT_PARAMS.macd_slow),
  macd_signal: String(ALERT_DEFAULT_PARAMS.macd_signal),
  td_mode: String(ALERT_DEFAULT_PARAMS.td_mode),
  pivot_left: String(ALERT_DEFAULT_PARAMS.pivot_left),
  pivot_right_confirm: String(ALERT_DEFAULT_PARAMS.pivot_right_confirm),
  pivot_right_preview: String(ALERT_DEFAULT_PARAMS.pivot_right_preview),
  min_sep_15m: String(ALERT_DEFAULT_PARAMS.min_sep_bars['15m']),
  min_sep_30m: String(ALERT_DEFAULT_PARAMS.min_sep_bars['30m']),
  min_sep_60m: String(ALERT_DEFAULT_PARAMS.min_sep_bars['60m']),
  eps_price: String(ALERT_DEFAULT_PARAMS.eps_price),
  eps_diff_std_window: String(ALERT_DEFAULT_PARAMS.eps_diff_std_window),
  eps_diff_std_mul: String(ALERT_DEFAULT_PARAMS.eps_diff_std_mul),
  pre_alert_time: ALERT_DEFAULT_PARAMS.pre_alert_time,
  exec_alert_time: ALERT_DEFAULT_PARAMS.exec_alert_time,
  review_time: ALERT_DEFAULT_PARAMS.review_time
};

const DEFAULT_BINDING_FORM = {
  code: null,
  target_fund_code: '',
  target_fund_name: '',
  benchmark_fund_code: '',
  benchmark_fund_name: '',
  strategy_profile_id: '',
  enabled: true,
  params_override_json: ''
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    cache: 'no-store'
  });

  let body;
  try {
    body = await response.json();
  } catch (_error) {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    throw new Error(body?.error || `request failed (${response.status})`);
  }

  return body.data;
};

const parseNumber = (value, key) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number`);
  }
  return parsed;
};

const parseTime = (value, key) => {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    throw new Error(`${key} must use HH:mm`);
  }
  const [hour, minute] = text.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`${key} is not a valid time`);
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const buildStrategyParams = (form) => {
  const macd_fast = parseNumber(form.macd_fast, 'macd_fast');
  const macd_slow = parseNumber(form.macd_slow, 'macd_slow');
  const macd_signal = parseNumber(form.macd_signal, 'macd_signal');
  const pivot_left = parseNumber(form.pivot_left, 'pivot_left');
  const pivot_right_confirm = parseNumber(form.pivot_right_confirm, 'pivot_right_confirm');
  const pivot_right_preview = parseNumber(form.pivot_right_preview, 'pivot_right_preview');
  const min_sep_15m = parseNumber(form.min_sep_15m, 'min_sep_15m');
  const min_sep_30m = parseNumber(form.min_sep_30m, 'min_sep_30m');
  const min_sep_60m = parseNumber(form.min_sep_60m, 'min_sep_60m');
  const eps_price = parseNumber(form.eps_price, 'eps_price');
  const eps_diff_std_window = parseNumber(form.eps_diff_std_window, 'eps_diff_std_window');
  const eps_diff_std_mul = parseNumber(form.eps_diff_std_mul, 'eps_diff_std_mul');

  if (macd_fast <= 0 || macd_slow <= 0 || macd_signal <= 0) {
    throw new Error('MACD params must be greater than 0');
  }

  if (min_sep_15m < 0 || min_sep_30m < 0 || min_sep_60m < 0) {
    throw new Error('min_sep_bars cannot be less than 0');
  }

  return {
    macd_fast,
    macd_slow,
    macd_signal,
    td_mode: String(form.td_mode || 'TD8').trim() || 'TD8',
    pivot_left,
    pivot_right_confirm,
    pivot_right_preview,
    min_sep_bars: {
      '15m': min_sep_15m,
      '30m': min_sep_30m,
      '60m': min_sep_60m
    },
    eps_price,
    eps_diff_std_window,
    eps_diff_std_mul,
    pre_alert_time: parseTime(form.pre_alert_time, 'pre_alert_time'),
    exec_alert_time: parseTime(form.exec_alert_time, 'exec_alert_time'),
    review_time: parseTime(form.review_time, 'review_time')
  };
};

const strategyToForm = (row) => {
  const params = row?.params_json || {};
  return {
    id: row.id,
    name: String(row.name || ''),
    enabled: Boolean(row.enabled),
    macd_fast: String(params.macd_fast ?? ALERT_DEFAULT_PARAMS.macd_fast),
    macd_slow: String(params.macd_slow ?? ALERT_DEFAULT_PARAMS.macd_slow),
    macd_signal: String(params.macd_signal ?? ALERT_DEFAULT_PARAMS.macd_signal),
    td_mode: String(params.td_mode ?? ALERT_DEFAULT_PARAMS.td_mode),
    pivot_left: String(params.pivot_left ?? ALERT_DEFAULT_PARAMS.pivot_left),
    pivot_right_confirm: String(params.pivot_right_confirm ?? ALERT_DEFAULT_PARAMS.pivot_right_confirm),
    pivot_right_preview: String(params.pivot_right_preview ?? ALERT_DEFAULT_PARAMS.pivot_right_preview),
    min_sep_15m: String(params.min_sep_bars?.['15m'] ?? ALERT_DEFAULT_PARAMS.min_sep_bars['15m']),
    min_sep_30m: String(params.min_sep_bars?.['30m'] ?? ALERT_DEFAULT_PARAMS.min_sep_bars['30m']),
    min_sep_60m: String(params.min_sep_bars?.['60m'] ?? ALERT_DEFAULT_PARAMS.min_sep_bars['60m']),
    eps_price: String(params.eps_price ?? ALERT_DEFAULT_PARAMS.eps_price),
    eps_diff_std_window: String(params.eps_diff_std_window ?? ALERT_DEFAULT_PARAMS.eps_diff_std_window),
    eps_diff_std_mul: String(params.eps_diff_std_mul ?? ALERT_DEFAULT_PARAMS.eps_diff_std_mul),
    pre_alert_time: String(params.pre_alert_time ?? ALERT_DEFAULT_PARAMS.pre_alert_time),
    exec_alert_time: String(params.exec_alert_time ?? ALERT_DEFAULT_PARAMS.exec_alert_time),
    review_time: String(params.review_time ?? ALERT_DEFAULT_PARAMS.review_time)
  };
};

const bindingToForm = (row) => ({
  code: String(row.target_fund_code),
  target_fund_code: String(row.target_fund_code || ''),
  target_fund_name: String(row.target_fund_name || ''),
  benchmark_fund_code: String(row.benchmark_fund_code || ''),
  benchmark_fund_name: String(row.benchmark_fund_name || ''),
  strategy_profile_id: row.strategy_profile_id ? String(row.strategy_profile_id) : '',
  enabled: Boolean(row.enabled),
  params_override_json: row.params_override_json ? JSON.stringify(row.params_override_json, null, 2) : ''
});

export default function AlertConfigPage() {
  const [loading, setLoading] = useState(true);
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [savingBinding, setSavingBinding] = useState(false);
  const [strategies, setStrategies] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [strategyForm, setStrategyForm] = useState(DEFAULT_STRATEGY_FORM);
  const [bindingForm, setBindingForm] = useState(DEFAULT_BINDING_FORM);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const strategyOptions = useMemo(
    () => strategies.map((item) => ({ id: item.id, label: `${item.name}${item.enabled ? '' : ' (閸嬫粎鏁?'}` })),
    [strategies]
  );

  const overview = useMemo(() => ({
    strategyTotal: strategies.length,
    strategyEnabled: strategies.filter((item) => item.enabled).length,
    bindingTotal: bindings.length,
    bindingEnabled: bindings.filter((item) => item.enabled).length,
    bindingOverrides: bindings.filter((item) => item.params_override_json && Object.keys(item.params_override_json).length > 0).length
  }), [bindings, strategies]);

  const resetStrategyForm = () => setStrategyForm(DEFAULT_STRATEGY_FORM);
  const resetBindingForm = () => setBindingForm(DEFAULT_BINDING_FORM);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [strategyRows, bindingRows] = await Promise.all([
        requestJson('/api/alert/strategy-profiles'),
        requestJson('/api/alert/fund-bindings')
      ]);
      setStrategies(strategyRows || []);
      setBindings(bindingRows || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveStrategy = async (event) => {
    event.preventDefault();
    setSavingStrategy(true);
    setError('');
    setMessage('');
    try {
      const params_json = buildStrategyParams(strategyForm);
      const payload = {
        name: String(strategyForm.name || '').trim(),
        enabled: Boolean(strategyForm.enabled),
        params_json
      };

      if (!payload.name) {
        throw new Error('Strategy name is required');
      }

      if (strategyForm.id) {
        await requestJson(`/api/alert/strategy-profiles/${strategyForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setMessage('Strategy updated');
      } else {
        await requestJson('/api/alert/strategy-profiles', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setMessage('Strategy created');
      }

      resetStrategyForm();
      await loadData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingStrategy(false);
    }
  };

  const deleteStrategy = async (id) => {
    if (!window.confirm('Delete this strategy? Bound funds will fall back to default params.')) {
      return;
    }

    setError('');
    setMessage('');
    try {
      await requestJson(`/api/alert/strategy-profiles/${id}`, { method: 'DELETE' });
      setMessage('Strategy deleted');
      if (Number(strategyForm.id) === Number(id)) {
        resetStrategyForm();
      }
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const saveBinding = async (event) => {
    event.preventDefault();
    setSavingBinding(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        target_fund_code: String(bindingForm.target_fund_code || '').trim(),
        target_fund_name: String(bindingForm.target_fund_name || '').trim(),
        benchmark_fund_code: String(bindingForm.benchmark_fund_code || '').trim(),
        benchmark_fund_name: String(bindingForm.benchmark_fund_name || '').trim(),
        strategy_profile_id: bindingForm.strategy_profile_id ? Number(bindingForm.strategy_profile_id) : null,
        enabled: Boolean(bindingForm.enabled)
      };

      if (!payload.target_fund_code || !payload.target_fund_name || !payload.benchmark_fund_code || !payload.benchmark_fund_name) {
        throw new Error('Fund code and fund name are required');
      }

      if (bindingForm.params_override_json.trim()) {
        try {
          payload.params_override_json = JSON.parse(bindingForm.params_override_json);
        } catch (_parseError) {
          throw new Error('params_override_json must be valid JSON');
        }
      } else {
        payload.params_override_json = {};
      }

      if (bindingForm.code) {
        await requestJson(`/api/alert/fund-bindings/${bindingForm.code}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        setMessage('Binding updated');
      } else {
        await requestJson('/api/alert/fund-bindings', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setMessage('Binding created');
      }

      resetBindingForm();
      await loadData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingBinding(false);
    }
  };

  const deleteBinding = async (code) => {
    if (!window.confirm(`Delete fund binding ${code}?`)) {
      return;
    }

    setError('');
    setMessage('');
    try {
      await requestJson(`/api/alert/fund-bindings/${code}`, { method: 'DELETE' });
      setMessage('Binding deleted');
      if (bindingForm.code === code) {
        resetBindingForm();
      }
      await loadData();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };


  return (
    <main className={`container ${styles.page}`}>
      <section className={`card ${styles.headerCard}`}>
        <div className={styles.headerMain}>
          <div>
            <h1 className={`${styles.pageTitle} alertPageTitle`}>Alert Config</h1>
            <p className={styles.pageIntro}>
              Maintain strategy profiles, fund bindings, and per-fund overrides. Every save writes directly to PostgreSQL.
            </p>
          </div>

          <dl className={styles.metricRail}>
            <div className={styles.metricItem}>
              <dt>Strategies</dt>
              <dd>{overview.strategyTotal}</dd>
            </div>
            <div className={styles.metricItem}>
              <dt>Enabled</dt>
              <dd>{overview.strategyEnabled}</dd>
            </div>
            <div className={styles.metricItem}>
              <dt>Bindings</dt>
              <dd>{overview.bindingTotal}</dd>
            </div>
            <div className={styles.metricItem}>
              <dt>Overrides</dt>
              <dd>{overview.bindingOverrides}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.headerActions}>
          <button className="button secondary" type="button" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
          <Link className="button secondary" href="/">
            Back to app
          </Link>
        </div>
      </section>

      {error ? <div className={styles.errorBox}>{error}</div> : null}
      {message ? <div className={styles.successBox}>{message}</div> : null}

      <div className={styles.editorGrid}>
        <section className={`card ${styles.sectionCard}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>{strategyForm.id ? 'Edit strategy profile' : 'New strategy profile'}</h2>
              <p className={styles.sectionHint}>Keep reusable alert parameters in one place and bind them to funds when needed.</p>
            </div>
            <div className={styles.sectionMeta}>Enabled {overview.strategyEnabled} / {overview.strategyTotal}</div>
          </div>

          <form onSubmit={saveStrategy} className={styles.form}>
            <div className={styles.gridTwo}>
              <label className={styles.field}>
                <span>Strategy name</span>
                <input
                  className="input"
                  value={strategyForm.name}
                  onChange={(event) => setStrategyForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="default-v1 / conservative-v1"
                />
              </label>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={strategyForm.enabled}
                  onChange={(event) => setStrategyForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                Enable this strategy
              </label>
            </div>

            <div className={styles.gridThree}>
              <label className={styles.field}><span>macd_fast</span><input className="input" value={strategyForm.macd_fast} onChange={(event) => setStrategyForm((prev) => ({ ...prev, macd_fast: event.target.value }))} /></label>
              <label className={styles.field}><span>macd_slow</span><input className="input" value={strategyForm.macd_slow} onChange={(event) => setStrategyForm((prev) => ({ ...prev, macd_slow: event.target.value }))} /></label>
              <label className={styles.field}><span>macd_signal</span><input className="input" value={strategyForm.macd_signal} onChange={(event) => setStrategyForm((prev) => ({ ...prev, macd_signal: event.target.value }))} /></label>
              <label className={styles.field}><span>td_mode</span><input className="input" value={strategyForm.td_mode} onChange={(event) => setStrategyForm((prev) => ({ ...prev, td_mode: event.target.value }))} /></label>
              <label className={styles.field}><span>pivot_left</span><input className="input" value={strategyForm.pivot_left} onChange={(event) => setStrategyForm((prev) => ({ ...prev, pivot_left: event.target.value }))} /></label>
              <label className={styles.field}><span>pivot_right_confirm</span><input className="input" value={strategyForm.pivot_right_confirm} onChange={(event) => setStrategyForm((prev) => ({ ...prev, pivot_right_confirm: event.target.value }))} /></label>
              <label className={styles.field}><span>pivot_right_preview</span><input className="input" value={strategyForm.pivot_right_preview} onChange={(event) => setStrategyForm((prev) => ({ ...prev, pivot_right_preview: event.target.value }))} /></label>
              <label className={styles.field}><span>min_sep_15m</span><input className="input" value={strategyForm.min_sep_15m} onChange={(event) => setStrategyForm((prev) => ({ ...prev, min_sep_15m: event.target.value }))} /></label>
              <label className={styles.field}><span>min_sep_30m</span><input className="input" value={strategyForm.min_sep_30m} onChange={(event) => setStrategyForm((prev) => ({ ...prev, min_sep_30m: event.target.value }))} /></label>
              <label className={styles.field}><span>min_sep_60m</span><input className="input" value={strategyForm.min_sep_60m} onChange={(event) => setStrategyForm((prev) => ({ ...prev, min_sep_60m: event.target.value }))} /></label>
              <label className={styles.field}><span>eps_price</span><input className="input" value={strategyForm.eps_price} onChange={(event) => setStrategyForm((prev) => ({ ...prev, eps_price: event.target.value }))} /></label>
              <label className={styles.field}><span>eps_diff_std_window</span><input className="input" value={strategyForm.eps_diff_std_window} onChange={(event) => setStrategyForm((prev) => ({ ...prev, eps_diff_std_window: event.target.value }))} /></label>
              <label className={styles.field}><span>eps_diff_std_mul</span><input className="input" value={strategyForm.eps_diff_std_mul} onChange={(event) => setStrategyForm((prev) => ({ ...prev, eps_diff_std_mul: event.target.value }))} /></label>
              <label className={styles.field}><span>pre_alert_time</span><input className="input" value={strategyForm.pre_alert_time} onChange={(event) => setStrategyForm((prev) => ({ ...prev, pre_alert_time: event.target.value }))} placeholder="14:50" /></label>
              <label className={styles.field}><span>exec_alert_time</span><input className="input" value={strategyForm.exec_alert_time} onChange={(event) => setStrategyForm((prev) => ({ ...prev, exec_alert_time: event.target.value }))} placeholder="14:58" /></label>
              <label className={styles.field}><span>review_time</span><input className="input" value={strategyForm.review_time} onChange={(event) => setStrategyForm((prev) => ({ ...prev, review_time: event.target.value }))} placeholder="15:00" /></label>
            </div>

            <div className={styles.formActions}>
              <button className="button" type="submit" disabled={savingStrategy}>
                {savingStrategy ? 'Saving...' : strategyForm.id ? 'Update strategy' : 'Create strategy'}
              </button>
              {strategyForm.id ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={resetStrategyForm}
                  disabled={savingStrategy}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Key times</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.codeCell}>#{item.id}</td>
                    <td>{item.name}</td>
                    <td>{item.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td>
                      {item.params_json?.pre_alert_time || '--'} / {item.params_json?.exec_alert_time || '--'} / {item.params_json?.review_time || '--'}
                    </td>
                    <td className={styles.actionCell}>
                      <button className="button secondary" type="button" onClick={() => setStrategyForm(strategyToForm(item))}>Edit</button>
                      <button className="button secondary" type="button" onClick={() => deleteStrategy(item.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!strategies.length ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>No strategy profiles yet</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`card ${styles.sectionCard}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>{bindingForm.code ? 'Edit fund binding' : 'New fund binding'}</h2>
              <p className={styles.sectionHint}>Connect a tradable fund, its benchmark driver, and the strategy profile used for alerts.</p>
            </div>
            <div className={styles.sectionMeta}>Enabled {overview.bindingEnabled} / {overview.bindingTotal}</div>
          </div>

          <form onSubmit={saveBinding} className={styles.form}>
            <div className={styles.gridTwo}>
              <label className={styles.field}>
                <span>Target fund code</span>
                <input
                  className="input"
                  value={bindingForm.target_fund_code}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, target_fund_code: event.target.value }))}
                  placeholder="161725"
                />
              </label>
              <label className={styles.field}>
                <span>Target fund name</span>
                <input
                  className="input"
                  value={bindingForm.target_fund_name}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, target_fund_name: event.target.value }))}
                  placeholder="CSI Liquor Index"
                />
              </label>
              <label className={styles.field}>
                <span>Benchmark code</span>
                <input
                  className="input"
                  value={bindingForm.benchmark_fund_code}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, benchmark_fund_code: event.target.value }))}
                  placeholder="512690"
                />
              </label>
              <label className={styles.field}>
                <span>Benchmark name</span>
                <input
                  className="input"
                  value={bindingForm.benchmark_fund_name}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, benchmark_fund_name: event.target.value }))}
                  placeholder="Liquor ETF"
                />
              </label>
              <label className={styles.field}>
                <span>Strategy profile</span>
                <select
                  className="select"
                  value={bindingForm.strategy_profile_id}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, strategy_profile_id: event.target.value }))}
                >
                  <option value="">No strategy profile (use defaults)</option>
                  {strategyOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={bindingForm.enabled}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                Enable this binding
              </label>
            </div>

            <label className={styles.field}>
              <span>Override params (optional JSON)</span>
              <textarea
                className={styles.textarea}
                value={bindingForm.params_override_json}
                onChange={(event) => setBindingForm((prev) => ({ ...prev, params_override_json: event.target.value }))}
                placeholder='{"pre_alert_time":"14:45","min_sep_bars":{"15m":6}}'
              />
            </label>

            <div className={styles.formActions}>
              <button className="button" type="submit" disabled={savingBinding}>
                {savingBinding ? 'Saving...' : bindingForm.code ? 'Update binding' : 'Create binding'}
              </button>
              {bindingForm.code ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={resetBindingForm}
                  disabled={savingBinding}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Target fund</th>
                  <th>Benchmark</th>
                  <th>Strategy</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((item) => (
                  <tr key={item.target_fund_code}>
                    <td>{item.target_fund_name} ({item.target_fund_code})</td>
                    <td>{item.benchmark_fund_name} ({item.benchmark_fund_code})</td>
                    <td>{item.strategy_profile_name || 'default-v1'}</td>
                    <td>{item.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td className={styles.actionCell}>
                      <button className="button secondary" type="button" onClick={() => setBindingForm(bindingToForm(item))}>Edit</button>
                      <button className="button secondary" type="button" onClick={() => deleteBinding(item.target_fund_code)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!bindings.length ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>No fund bindings yet</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
