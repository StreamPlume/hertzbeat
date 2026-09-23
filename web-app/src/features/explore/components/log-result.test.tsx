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

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';

import { ExploreLogStatistics } from './explore-log-statistics';
import { LogResult } from './log-result';

describe('LogResult', () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true });
    await initializeI18n();
    await loadLocale('en-US');
  });

  afterEach(() => cleanup());

  it('opens an inspectable OTLP log detail without leaving the workbench', () => {
    const navigate = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <Subject navigate={navigate} />
      </I18nextProvider>
    );
    const logRow = screen.getByRole('row', { name: /payment timeout/ });
    expect(document.querySelector('.ant-table-tbody-virtual')).not.toBeNull();
    expect(logRow).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(logRow, { key: ' ' });
    expect(screen.getByRole('dialog', { name: i18n.t('exploreLog.detail') })).toBeInTheDocument();
    expect(screen.getByText(/service.version/)).toBeInTheDocument();
    expect(screen.getByText(/retry.count/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('exploreLog.openTrace') }));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('signal=traces'));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('traceId=0123456789abcdef0123456789abcdef'));
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('timeRange=last-30m'));
  });

  it('delegates historical selection to the focused route callback without opening a local detail drawer', () => {
    const onSelectLog = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <Subject onSelectLog={onSelectLog} />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('row', { name: /payment timeout/ }));
    expect(onSelectLog).toHaveBeenCalledWith(expect.objectContaining({ logRecordUid: 'log-1' }));
    expect(screen.queryByRole('dialog', { name: i18n.t('exploreLog.detail') })).toBeNull();
  });

  it('closes selected log evidence when the query scope changes', async () => {
    const view = render(
      <I18nextProvider i18n={i18n}>
        <Subject query={{ ...defaultLogQuery, serviceName: 'checkout' }} />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByRole('row', { name: /payment timeout/ }));
    expect(screen.getByRole('dialog', { name: i18n.t('exploreLog.detail') })).toBeInTheDocument();

    view.rerender(
      <I18nextProvider i18n={i18n}>
        <Subject query={{ ...defaultLogQuery, serviceName: 'payments' }} />
      </I18nextProvider>
    );

    const closingDrawer = screen.queryByRole('dialog', { name: i18n.t('exploreLog.detail') });
    if (closingDrawer) expect(within(closingDrawer).queryByText('payment timeout')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: i18n.t('exploreLog.detail') })).not.toBeInTheDocument();
    });
  });

  it('keeps an out-of-range nonzero page ready with authoritative total', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LogResult
          data={{ content: [], totalElements: 3, totalPages: 1, number: 3, size: 20 }}
          query={{ signal: 'logs', timeRange: 'last-30m', pageIndex: 3 }}
          t={i18n.t}
          navigate={vi.fn()}
        />
      </I18nextProvider>
    );
    expect(screen.getByRole('heading', { name: 'Logs' }).parentElement).toHaveTextContent('3');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('lets an operator pause, resume, and clear a live stream', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LiveSubject />
      </I18nextProvider>
    );
    expect(screen.getByText('live payment timeout')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('exploreLog.pauseDisconnect') }));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('exploreLog.pauseDisconnectGap'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('live payment timeout')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: i18n.t('exploreLog.resumeNewStream') }));
    expect(screen.getByText('Connecting to log stream')).toBeInTheDocument();
  });

  it('does not turn a missing live view into a historical empty result', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LogResult query={{ signal: 'logs', timeRange: 'last-30m', live: true }} t={i18n.t} navigate={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('exploreLog.streamFailed'));
    expect(screen.queryByText(i18n.t('explore.empty.logs'))).not.toBeInTheDocument();
  });

  it('renders overview and trend as independent backend evidence regions', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LogResult
          data={{ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 }}
          statistics={{
            overview: {
              kind: 'ready',
              data: {
                totalCount: 9,
                traceCount: 1,
                debugCount: 2,
                infoCount: 3,
                warnCount: 1,
                errorCount: 2,
                fatalCount: 0
              }
            },
            trend: { kind: 'error' }
          }}
          query={{ signal: 'logs', timeRange: 'last-30m' }}
          t={i18n.t}
          navigate={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('region', { name: i18n.t('exploreLog.overview') })).toHaveTextContent('9');
    expect(screen.getByRole('region', { name: i18n.t('exploreLog.trend') })).toHaveTextContent(
      i18n.t('exploreLog.statisticsUnavailable')
    );
  });

  it('renders non-empty hourly evidence as an accessible time-series chart instead of row-by-row history', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreLogStatistics
          statistics={{
            overview: {
              kind: 'ready',
              data: {
                totalCount: 12,
                traceCount: 0,
                debugCount: 0,
                infoCount: 12,
                warnCount: 0,
                errorCount: 0,
                fatalCount: 0
              }
            },
            trend: {
              kind: 'ready',
              data: {
                start: 1_754_467_200_000,
                end: 1_754_474_400_000,
                intervalMs: 3_600_000,
                buckets: [
                  { start: 1_754_467_200_000, count: 4 },
                  { start: 1_754_470_800_000, count: 8 }
                ]
              }
            }
          }}
          timeWindow={{ from: 1_754_467_200_000, to: 1_754_474_400_000 }}
          runtimeIdentity="logs-trend:revision-1"
          t={i18n.t}
        />
      </I18nextProvider>
    );

    const trend = screen.getByRole('region', { name: i18n.t('exploreLog.trend') });
    const runtime = trend.querySelector('[data-visualization-runtime="perses"]');
    expect(runtime).toHaveAttribute('data-variant', 'compact');
    expect(runtime?.firstElementChild).not.toHaveAttribute('style');
    expect(within(trend).getByRole('img', { name: i18n.t('exploreLog.trend') })).toBeInTheDocument();
    expect(within(trend).queryByRole('list')).not.toBeInTheDocument();
  });

  it('reports a single observed trend bucket instead of presenting an empty chart grid as a trend', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreLogStatistics
          statistics={{
            overview: {
              kind: 'ready',
              data: {
                totalCount: 6,
                traceCount: 0,
                debugCount: 0,
                infoCount: 6,
                warnCount: 0,
                errorCount: 0,
                fatalCount: 0
              }
            },
            trend: {
              kind: 'ready',
              data: {
                start: 1_754_467_200_000,
                end: 1_754_470_800_000,
                intervalMs: 3_600_000,
                buckets: [{ start: 1_754_467_200_000, count: 6 }]
              }
            }
          }}
          timeWindow={{ from: 1_754_467_200_000, to: 1_754_470_800_000 }}
          runtimeIdentity="logs-trend:revision-single"
          t={i18n.t}
        />
      </I18nextProvider>
    );

    const trend = screen.getByRole('region', { name: i18n.t('exploreLog.trend') });
    expect(screen.getByRole('region', { name: i18n.t('exploreLog.overview') })).toHaveAttribute(
      'data-explore-evidence-summary'
    );
    expect(trend).toHaveAttribute('data-trend-density', 'visualization');
    expect(within(trend).getByText(i18n.t('exploreLog.trendInsufficient', { count: 6 }))).toBeInTheDocument();
    expect(within(trend).getByRole('img', { name: i18n.t('exploreLog.trend') })).toBeInTheDocument();
  });

  it.each([
    ['unavailable', 'common.unavailable'],
    ['error', 'exploreLog.streamFailed'],
    ['contract', 'explore.loadFailed']
  ] as const)('labels %s without claiming the stream is connecting', (status, messageKey) => {
    const retry = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <LogResult
          query={{ signal: 'logs', timeRange: 'last-30m', live: true }}
          t={i18n.t}
          navigate={vi.fn()}
          live={{ rows: [], status, togglePaused: vi.fn(), retry, clear: vi.fn() }}
        />
      </I18nextProvider>
    );
    expect(screen.getAllByText(i18n.t(messageKey)).length).toBeGreaterThan(0);
    expect(screen.queryByText(i18n.t('exploreLog.connecting'))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t('exploreLog.waiting'))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('exploreLog.pauseDisconnect') })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.retry') }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps gap evidence visible and offers an explicit retry', () => {
    const retry = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <LogResult
          query={{ signal: 'logs', timeRange: 'last-30m', live: true }}
          t={i18n.t}
          navigate={vi.fn()}
          live={{
            rows: [liveLogRow],
            status: 'degraded',
            gapDroppedCount: 37,
            togglePaused: vi.fn(),
            retry,
            clear: vi.fn()
          }}
        />
      </I18nextProvider>
    );

    expect(screen.getAllByText(i18n.t('exploreLog.streamGapCount', { count: 37 })).length).toBeGreaterThan(0);
    expect(screen.getByText('live payment timeout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('exploreLog.pauseDisconnect') })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common.retry') }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('discloses bounded local retention without treating it as a backend gap', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LogResult
          query={{ signal: 'logs', timeRange: 'last-30m', live: true }}
          t={i18n.t}
          navigate={vi.fn()}
          live={{
            rows: [liveLogRow],
            status: 'connected',
            locallyDroppedCount: 12,
            togglePaused: vi.fn(),
            retry: vi.fn(),
            clear: vi.fn()
          }}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      i18n.t('exploreLog.localRetention', { retained: 500, dropped: 12 })
    );
    expect(screen.queryByText(i18n.t('exploreLog.streamGapCount', { count: 12 }))).not.toBeInTheDocument();
  });
});

function Subject({
  navigate = vi.fn(),
  query = defaultLogQuery,
  onSelectLog
}: {
  navigate?: (path: string) => void;
  query?: typeof defaultLogQuery & { serviceName?: string | undefined };
  onSelectLog?: React.ComponentProps<typeof LogResult>['onSelectLog'];
}) {
  const { t } = useTranslation();
  return (
    <LogResult
      data={{
        content: [
          {
            logRecordUid: 'log-1',
            timeUnixNano: '1750000000000000000',
            observedTimeUnixNano: null,
            severityNumber: null,
            severityText: 'ERROR',
            body: 'payment timeout',
            droppedAttributesCount: null,
            traceId: '0123456789abcdef0123456789abcdef',
            spanId: '0123456789abcdef',
            traceFlags: null,
            resource: { 'service.name': 'checkout', 'service.version': '1.2.3' },
            attributes: { 'retry.count': 2 },
            resourceSchemaUrl: null,
            instrumentationScope: null,
            scopeSchemaUrl: null
          }
        ],
        totalElements: 1,
        totalPages: 1,
        number: 0,
        size: 20
      }}
      query={query}
      t={t}
      navigate={navigate}
      onSelectLog={onSelectLog}
    />
  );
}

const defaultLogQuery = { signal: 'logs', timeRange: 'last-30m' } as const;

function LiveSubject() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([liveLogRow]);
  const [paused, setPaused] = useState(false);
  return (
    <LogResult
      query={{ signal: 'logs', timeRange: 'last-30m', live: true }}
      t={t}
      navigate={vi.fn()}
      live={{
        rows,
        status: paused ? 'paused' : 'waiting',
        pauseDisconnectGap: paused,
        togglePaused: () => setPaused(current => !current),
        retry: vi.fn(),
        clear: () => setRows([])
      }}
    />
  );
}

const liveLogRow = {
  timeUnixNano: 1_750_000_000_000_000_000,
  observedTimeUnixNano: null,
  severityNumber: 17,
  severityText: 'ERROR',
  body: 'live payment timeout',
  attributes: null,
  droppedAttributesCount: null,
  traceId: null,
  spanId: null,
  traceFlags: null,
  resource: null,
  resourceSchemaUrl: null,
  instrumentationScope: null,
  scopeSchemaUrl: null
};

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
