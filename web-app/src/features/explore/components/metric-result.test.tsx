/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';

import type { MetricConsole } from '../model/explore-signal-contract';
import { metricSeries, type MetricResultState } from '../model/explore-signal-model';
import { MetricResult } from './metric-result';

const persesRuntime = vi.hoisted(() => ({ failed: false }));

vi.mock('@/platform/perses', () => ({
  HertzBeatMetricTimeSeriesResult: ({
    ariaLabel,
    className,
    messages,
    outcome
  }: {
    ariaLabel: string;
    className?: string;
    messages: { runtimeError: string };
    outcome: { data: { series: Array<{ key: string }> } };
  }) => {
    if (persesRuntime.failed) return <div role="status">{messages.runtimeError}</div>;
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className={className}
        data-visualization-runtime="perses"
        data-series-count={outcome.data.series.length}
      />
    );
  }
}));

describe('MetricResult', () => {
  afterEach(() => {
    cleanup();
    persesRuntime.failed = false;
  });

  beforeAll(async () => {
    Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true });
    await initializeI18n();
    await loadLocale('en-US');
  });

  it('shows a populated series as a trend and inspectable samples', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Subject data={metricData} state={{ kind: 'ready', series: metricSeries(metricData) }} />
      </I18nextProvider>
    );
    expect(screen.getByRole('heading', { name: 'Metrics' })).toBeInTheDocument();
    expect(screen.getByText(i18n.t('explore.samples'))).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Metric trend' })).toHaveAttribute('data-visualization-runtime', 'perses');
    expect(screen.getByRole('img', { name: 'Metric trend' })).toHaveAttribute('data-series-count', '1');
    expect(screen.getByText('125 ms')).toBeInTheDocument();
    expect(screen.getAllByText('method=POST')).toHaveLength(2);
    expect(screen.queryByText('__name__=http.server.duration')).not.toBeInTheDocument();
  });

  it('keeps a true empty response distinct from a zero-valued series', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Subject data={metricData} state={{ kind: 'empty' }} />
      </I18nextProvider>
    );
    expect(screen.getByText('No metric series for this context.')).toBeInTheDocument();

    cleanup();
    render(
      <I18nextProvider i18n={i18n}>
        <Subject
          data={metricData}
          state={{
            kind: 'ready',
            series: [{ key: 'zero', name: 'zero', labels: {}, points: [[1_750_000_000_000, 0]] }]
          }}
        />
      </I18nextProvider>
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('125 ms')).not.toBeInTheDocument();
    expect(screen.queryByText('No metric series for this context.')).not.toBeInTheDocument();
  });

  it('passes every authorized series to the Perses runtime', () => {
    const series = Array.from({ length: 7 }, (_, index) => ({
      key: `series-${index}`,
      name: `series-${index}`,
      labels: {},
      points: [[1_750_000_000_000, index]]
    }));
    render(
      <I18nextProvider i18n={i18n}>
        <Subject data={metricData} state={{ kind: 'ready', series }} />
      </I18nextProvider>
    );

    const trend = screen.getByRole('img', { name: 'Metric trend' });
    expect(trend).toHaveAttribute('data-series-count', '7');
    expect(screen.getByText('series-6')).toBeInTheDocument();
  });

  it('keeps sample evidence visible when the Perses runtime fails', () => {
    persesRuntime.failed = true;
    render(
      <I18nextProvider i18n={i18n}>
        <Subject data={metricData} state={{ kind: 'ready', series: metricSeries(metricData) }} />
      </I18nextProvider>
    );

    expect(screen.getByRole('status')).toHaveTextContent(i18n.t('explore.perses.runtimeError'));
    expect(screen.getByText('125 ms')).toBeInTheDocument();
    expect(screen.getAllByText('method=POST')).toHaveLength(2);
  });

  it('shows only the latest one hundred samples in reverse order', () => {
    const points = Array.from({ length: 102 }, (_, index) => [1_750_000_000_000 + index, index]);
    render(
      <I18nextProvider i18n={i18n}>
        <Subject
          data={metricData}
          state={{ kind: 'ready', series: [{ key: 'bounded', name: 'bounded', labels: {}, points }] }}
        />
      </I18nextProvider>
    );

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(101);
    expect(within(rows[1]!).getByText('101')).toBeInTheDocument();
    expect(within(rows.at(-1)!).getByText('2')).toBeInTheDocument();
  });

  it('renders error state messages and exposes retry', () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nextProvider i18n={i18n}>
        <Subject data={metricData} state={{ kind: 'error', message: 'storage offline' }} retry={retry} />
      </I18nextProvider>
    );
    expect(screen.getByText('storage offline')).toBeInTheDocument();
    expect(screen.queryByText('No metric series for this context.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();

    cleanup();
    render(
      <I18nextProvider i18n={i18n}>
        <Subject data={metricData} state={{ kind: 'error' }} retry={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByText('The signal query failed.')).toBeInTheDocument();
  });

  it.each([
    ['storage_unavailable', 'storageUnavailable', true],
    ['missing_context', 'missingContext', false],
    ['unsupported_query', 'unsupportedQuery', false]
  ] as const)('renders explicit %s state with the correct retry policy', (kind, messageKey, retryable) => {
    render(
      <I18nextProvider i18n={i18n}>
        <Subject data={metricData} state={{ kind }} retry={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByText(i18n.t(`explore.states.${messageKey}`))).toBeInTheDocument();
    if (retryable) expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    else expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});

function Subject({
  data,
  state,
  retry = vi.fn()
}: {
  data: MetricConsole;
  state: MetricResultState;
  retry?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <MetricResult
      data={data}
      state={state}
      retry={retry}
      t={t}
      query={{ signal: 'metrics', timeRange: 'last-30m', query: 'http.server.duration' }}
      timeWindow={{ from: 1_750_000_000_000, to: 1_750_000_060_000 }}
      revision={0}
    />
  );
}

const metricData: MetricConsole = {
  context: null,
  query: null,
  datasource: 'greptime',
  queryMode: 'range',
  stats: { totalSeries: 1, nonEmptySeries: 1, latestObservedAt: null },
  results: {
    refId: null,
    msg: null,
    status: 200,
    frames: [
      {
        schema: {
          labels: { __name__: 'http.server.duration', service_name: 'checkout', method: 'POST' },
          meta: null,
          fields: [{ name: 'value', type: 'number', unit: 'ms' }]
        },
        data: [
          [1_750_000_000_000, 100],
          [1_750_000_060_000, 125]
        ]
      }
    ]
  },
  emptyStateReason: null,
  errorMessage: null
};

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
