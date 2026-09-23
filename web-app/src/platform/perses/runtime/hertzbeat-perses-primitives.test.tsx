/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryHertzBeatData } from '../datasource/hertzbeat-query-client';
import type { HertzBeatQueryOutcome } from '../datasource/hertzbeat-query-contract';
import persesPrimitiveStyles from './hertzbeat-perses-primitives.module.css?raw';

const runtimeControl = vi.hoisted<{ fail: boolean; rowSelection: unknown }>(() => ({
  fail: false,
  rowSelection: undefined
}));
vi.mock('../datasource/hertzbeat-query-client', async importOriginal => {
  const actual = await importOriginal<typeof import('../datasource/hertzbeat-query-client')>();
  return { ...actual, queryHertzBeatData: vi.fn() };
});
vi.mock('./perses-signal-runtime', () => ({
  PersesSignalRuntime: ({
    kind,
    onTimeWindowChange,
    timeWindowChangeEnabled,
    rowSelection
  }: {
    kind: string;
    onTimeWindowChange?: ((window: { from: number; to: number }) => void) | undefined;
    timeWindowChangeEnabled?: boolean | undefined;
    rowSelection?: unknown;
  }) => {
    runtimeControl.rowSelection = rowSelection;
    if (runtimeControl.fail) throw new Error('private runtime detail');
    if (kind === 'logs-table' || kind === 'trace-table') {
      return (
        <section className="MuiCard-root">
          <div className="MuiCardContent-root">
            <div
              className="MuiBox-root"
              data-testid="official-panel-inner-surface"
              style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)' }}
            >
              <table aria-label={`official ${kind}`} data-testid={`official-${kind}`} />
            </div>
          </div>
        </section>
      );
    }
    if (kind === 'tracing-gantt-chart') {
      return <button data-testid={`official-${kind}`}>Inspect span</button>;
    }
    return (
      <button
        type="button"
        data-testid={`official-${kind}`}
        disabled={timeWindowChangeEnabled === false}
        onClick={() => onTimeWindowChange?.({ from: timeWindow.from + 1_000, to: timeWindow.to - 1_000 })}
      >
        Zoom time series
      </button>
    );
  }
}));

import {
  HertzBeatLogsTable,
  HertzBeatLogsTableResult,
  HertzBeatMetricTimeSeries,
  HertzBeatMetricTimeSeriesResult,
  HertzBeatTraceTable,
  HertzBeatTracingGanttChart,
  type HertzBeatPersesPrimitiveMessages
} from './hertzbeat-perses-primitives';

const request = vi.mocked(queryHertzBeatData);
const timeWindow = { from: 1_750_000_000_000, to: 1_750_000_060_000 } as const;
const messages: HertzBeatPersesPrimitiveMessages = {
  loading: 'Loading signal',
  empty: 'No signal data',
  truncated: 'Results are truncated',
  truncationUnknown: 'Result completeness is unknown',
  runtimeError: 'Visualization unavailable',
  investigationActions: count => `Investigation actions (${count})`,
  failures: {
    'perses.query.invalid': 'Invalid query',
    'perses.query.permission': 'Permission denied',
    'perses.query.overloaded': 'Query capacity unavailable',
    'perses.query.unavailable': 'Storage unavailable',
    'perses.query.contract': 'Unexpected response'
  }
};

describe('HertzBeat Perses primitives', () => {
  beforeEach(() => {
    request.mockReset();
    runtimeControl.fail = false;
    runtimeControl.rowSelection = undefined;
  });
  afterEach(cleanup);

  it('forces the official log row onto stable time and message tracks', () => {
    expect(persesPrimitiveStyles).toMatch(
      /data-log-show-time='true'[\s\S]*grid-template-columns:\s*184px minmax\(0, 1fr\)\s*!important/s
    );
    expect(persesPrimitiveStyles).toMatch(
      /data-log-density[\s\S]*data-log-index[\s\S]*div:last-of-type[\s\S]*margin-left:\s*0\s*!important/s
    );
  });

  it('keeps row-internal actions below the compact and comfortable content box heights', () => {
    expect(persesPrimitiveStyles).toMatch(
      /data-log-density='compact'[\s\S]*data-log-index[^}]*min-height:\s*36px[^}]*padding-block:\s*4px/s
    );
    expect(persesPrimitiveStyles).toMatch(
      /data-log-density='comfortable'[\s\S]*data-log-index[^}]*min-height:\s*44px[^}]*padding-block:\s*8px/s
    );
    expect(persesPrimitiveStyles).toMatch(
      /data-log-index[^}]*div:last-of-type\s+button\)\s*\{[^}]*width:\s*24px[^}]*height:\s*24px[^}]*min-height:\s*24px/s
    );
  });

  it('renders loading, cancels on unmount, and never converts cancellation into an error state', () => {
    let requestSignal: AbortSignal | undefined;
    request.mockImplementation(
      (_query, options) =>
        new Promise((_resolve, reject) => {
          requestSignal = options?.signal;
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
            once: true
          });
        }) as never
    );

    const view = render(
      <HertzBeatLogsTable
        title="Logs"
        ariaLabel="Logs table"
        query={{ signal: 'logs', queryKind: 'table', timeWindow }}
        messages={messages}
      />
    );

    const loading = screen.getByRole('status', { name: 'Logs table' });
    expect(loading).toHaveTextContent('Loading signal');
    expect(loading).toHaveStyle({ minHeight: '388px', gridTemplateRows: '360px auto auto' });
    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
  });

  it('keeps empty and permission failure distinct and localized by the caller', async () => {
    request.mockResolvedValueOnce({ state: 'empty', truncated: false }).mockResolvedValueOnce({
      state: 'error',
      error: { kind: 'permission', messageKey: 'perses.query.permission', retryable: false }
    });

    const view = render(
      <HertzBeatLogsTable
        title="Logs"
        ariaLabel="Logs table"
        query={{ signal: 'logs', queryKind: 'table', timeWindow }}
        messages={messages}
      />
    );
    expect(await screen.findByRole('status', { name: 'Logs table' })).toHaveTextContent('No signal data');

    view.rerender(
      <HertzBeatLogsTable
        title="Logs"
        ariaLabel="Logs table"
        query={{ signal: 'logs', queryKind: 'table', timeWindow, search: 'failed' }}
        messages={messages}
      />
    );
    expect(await screen.findByRole('alert', { name: 'Logs table' })).toHaveTextContent('Permission denied');
    expect(screen.queryByTestId('official-logs-table')).not.toBeInTheDocument();
  });

  it('clears resolved evidence synchronously when the query identity changes', async () => {
    request.mockResolvedValueOnce(metricOutcome() as never).mockImplementationOnce(
      (_query, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
            once: true
          });
        }) as never
    );

    const view = render(
      <HertzBeatMetricTimeSeries
        title="Metrics"
        ariaLabel="Metric time series"
        query={{ signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'up' } }}
        messages={messages}
      />
    );
    expect(await screen.findByTestId('official-metric-time-series')).toBeInTheDocument();

    view.rerender(
      <HertzBeatMetricTimeSeries
        title="Metrics"
        ariaLabel="Metric time series"
        query={{ signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'cpu_usage' } }}
        messages={messages}
      />
    );

    expect(screen.queryByTestId('official-metric-time-series')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Metric time series' })).toHaveTextContent('Loading signal');
  });

  it('resets a sanitized runtime failure when the query identity changes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    request.mockResolvedValue(metricOutcome() as never);
    runtimeControl.fail = true;
    const view = render(
      <HertzBeatMetricTimeSeries
        title="Metrics"
        ariaLabel="Metric time series"
        query={{ signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'up' } }}
        messages={messages}
      />
    );
    expect(await screen.findByRole('alert', { name: 'Metric time series' })).toHaveTextContent(
      'Visualization unavailable'
    );
    expect(screen.queryByText('private runtime detail')).not.toBeInTheDocument();

    runtimeControl.fail = false;
    view.rerender(
      <HertzBeatMetricTimeSeries
        title="Metrics"
        ariaLabel="Metric time series"
        query={{ signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'cpu_usage' } }}
        messages={messages}
      />
    );
    expect(await screen.findByTestId('official-metric-time-series')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('renders every official primitive from M2 typed ready outcomes', async () => {
    request
      .mockResolvedValueOnce(metricOutcome() as never)
      .mockResolvedValueOnce(logOutcome() as never)
      .mockResolvedValueOnce(traceTableOutcome() as never)
      .mockResolvedValueOnce(traceDetailOutcome() as never);

    const view = render(
      <HertzBeatMetricTimeSeries
        title="Metrics"
        ariaLabel="Metric time series"
        query={{ signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'up' } }}
        messages={messages}
      />
    );
    expect(await screen.findByTestId('official-metric-time-series')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Metric time series' })).toHaveStyle({ height: '360px' });
    expect(view.container.querySelector('[data-visualization-runtime="perses"]')).toHaveStyle({
      minHeight: '388px',
      gridTemplateRows: '360px auto auto'
    });
    expect(screen.getByRole('status', { name: 'Metric time series completeness' })).toHaveTextContent(
      'Result completeness is unknown'
    );

    view.rerender(
      <HertzBeatLogsTable
        title="Logs"
        ariaLabel="Logs table"
        query={{ signal: 'logs', queryKind: 'table', timeWindow }}
        logDisplay={{ density: 'compact', wrap: false, showTime: false }}
        messages={messages}
      />
    );
    expect(await screen.findByTestId('official-logs-table')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Logs table' })).toContainElement(
      screen.getByRole('table', { name: 'official logs-table' })
    );
    expect(view.container.querySelector('[data-visualization-runtime="perses"]')).toHaveAttribute(
      'data-log-density',
      'compact'
    );
    expect(view.container.querySelector('[data-visualization-runtime="perses"]')).toHaveAttribute(
      'data-log-wrap',
      'false'
    );
    expect(view.container.querySelector('[data-visualization-runtime="perses"]')).toHaveAttribute(
      'data-log-show-time',
      'false'
    );
    const completeness = screen.getByRole('status', { name: 'Logs table completeness' });
    expect(completeness).toHaveTextContent('Results are truncated');
    expect(completeness).toHaveStyle({ height: '28px', minHeight: '28px' });

    view.rerender(
      <HertzBeatTraceTable
        title="Traces"
        ariaLabel="Trace table"
        query={{ signal: 'traces', queryKind: 'table', timeWindow }}
        messages={messages}
      />
    );
    expect(await screen.findByTestId('official-trace-table')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trace table' })).toContainElement(
      screen.getByRole('table', { name: 'official trace-table' })
    );

    view.rerender(
      <HertzBeatTracingGanttChart
        title="Trace"
        ariaLabel="Trace gantt"
        query={{ signal: 'traces', queryKind: 'gantt', timeWindow, traceId: '0123456789abcdef0123456789abcdef' }}
        messages={messages}
      />
    );
    expect(await screen.findByTestId('official-tracing-gantt-chart')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Trace gantt' })).toContainElement(
      screen.getByRole('button', { name: 'Inspect span' })
    );
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('binds loaded table evidence to a host-owned runtime identity and accessible row actions', () => {
    const open = vi.fn();
    const view = render(
      <HertzBeatLogsTableResult
        title="Logs"
        ariaLabel="Logs table"
        query={{ signal: 'logs', queryKind: 'table', timeWindow }}
        outcome={logOutcome() as never}
        runtimeIdentity="scope-a:revision-1"
        interactions={[
          {
            key: 'log-1',
            label: 'checkout ready',
            actions: [
              { label: 'Investigate log checkout ready', onAction: open },
              { label: 'Open trace checkout ready', disabled: true, onAction: vi.fn() }
            ]
          }
        ]}
        messages={messages}
      />
    );

    const interactions = view.container.querySelector('[data-perses-host-interactions]');
    expect(interactions).toBeInstanceOf(HTMLDetailsElement);
    expect(interactions).not.toHaveAttribute('open');
    expect(screen.queryByRole('button', { name: 'Investigate log checkout ready' })).not.toBeInTheDocument();
    fireEvent.click(within(interactions as HTMLElement).getByText('Investigation actions (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Investigate log checkout ready' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Open trace checkout ready' })).toBeDisabled();
    expect(view.container.querySelector('[data-visualization-runtime="perses"]')).toHaveStyle({
      gridTemplateRows: '360px auto auto'
    });

    view.rerender(
      <HertzBeatLogsTableResult
        title="Logs"
        ariaLabel="Logs table"
        query={{ signal: 'logs', queryKind: 'table', timeWindow }}
        outcome={logOutcome() as never}
        runtimeIdentity="scope-b:revision-1"
        messages={messages}
      />
    );
    expect(screen.queryByRole('button', { name: 'Investigate log checkout ready' })).not.toBeInTheDocument();
  });

  it('forwards host-owned log row selection through the thin official LogsTable adapter boundary', () => {
    const rowSelection = {
      ariaLabel: 'Historical logs',
      controlsId: 'log-inspector',
      selectedIndex: 0,
      getAriaLabel: () => 'Selected log',
      onSelect: vi.fn()
    };
    render(
      <HertzBeatLogsTableResult
        title="Logs"
        ariaLabel="Logs table"
        query={{ signal: 'logs', queryKind: 'table', timeWindow }}
        outcome={logOutcome() as never}
        runtimeIdentity="scope-a:revision-1"
        logRowSelection={rowSelection}
        messages={messages}
      />
    );

    expect(runtimeControl.rowSelection).toBe(rowSelection);
  });

  it('forwards a time-series zoom only when the caller owns a callback', () => {
    const onTimeWindowChange = vi.fn();
    render(
      <HertzBeatMetricTimeSeriesResult
        title="Log trend"
        ariaLabel="Log trend"
        query={{ signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'hertzbeat_log_count' } }}
        outcome={metricOutcome() as never}
        onTimeWindowChange={onTimeWindowChange}
        messages={messages}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zoom time series' }));
    expect(onTimeWindowChange).toHaveBeenCalledWith({ from: timeWindow.from + 1_000, to: timeWindow.to - 1_000 });
  });

  it('forwards a disabled time-series range interaction to the Perses runtime', () => {
    render(
      <HertzBeatMetricTimeSeriesResult
        title="Retained Log trend"
        ariaLabel="Retained Log trend"
        query={{ signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'hertzbeat_log_count' } }}
        outcome={metricOutcome() as never}
        timeWindowChangeEnabled={false}
        messages={messages}
      />
    );

    expect(screen.getByRole('button', { name: 'Zoom time series' })).toBeDisabled();
  });
});

function metricOutcome(): HertzBeatQueryOutcome<unknown> {
  return {
    state: 'ready',
    data: {
      timeWindow,
      source: 'Greptime-promql',
      series: [
        { key: 'up-0', name: 'up', labels: { __name__: 'up' }, points: [{ timestamp: timeWindow.from, value: 1 }] }
      ]
    },
    truncated: 'unknown'
  };
}

function logOutcome(): HertzBeatQueryOutcome<unknown> {
  return {
    state: 'ready',
    data: {
      total: 2,
      rows: [
        {
          timeUnixNano: 1_750_000_001_000_000_000,
          observedTimeUnixNano: null,
          severityNumber: 9,
          severityText: 'INFO',
          body: 'checkout ready',
          attributes: {},
          droppedAttributesCount: 0,
          traceId: '0123456789abcdef0123456789abcdef',
          spanId: '0123456789abcdef',
          traceFlags: 1,
          resource: { 'service.name': 'checkout' },
          resourceSchemaUrl: null,
          instrumentationScope: null,
          scopeSchemaUrl: null
        }
      ]
    },
    truncated: true
  };
}

function traceTableOutcome(): HertzBeatQueryOutcome<unknown> {
  return {
    state: 'ready',
    data: {
      total: 1,
      rows: [
        {
          traceId: '0123456789abcdef0123456789abcdef',
          rootSpanId: '0123456789abcdef',
          serviceName: 'checkout',
          serviceNamespace: 'commerce',
          rootSpanName: 'POST /orders',
          durationNanos: 10_000_000,
          status: 'OK',
          startTime: timeWindow.from,
          spanCount: 2,
          errorSpanCount: 0,
          serviceStats: { checkout: { spanCount: 2, errorCount: 0 } },
          resourceAttributes: {}
        }
      ]
    },
    truncated: false
  };
}

function traceDetailOutcome(): HertzBeatQueryOutcome<unknown> {
  return {
    state: 'ready',
    data: {
      traceId: '0123456789abcdef0123456789abcdef',
      rootSpanId: '0123456789abcdef',
      serviceName: 'checkout',
      serviceNamespace: 'commerce',
      rootSpanName: 'POST /orders',
      durationNanos: 10_000_000,
      status: 'OK',
      startTime: timeWindow.from,
      errorSpanCount: 0,
      resourceAttributes: {},
      spans: [
        {
          traceId: '0123456789abcdef0123456789abcdef',
          spanId: '0123456789abcdef',
          parentSpanId: null,
          spanName: 'POST /orders',
          serviceName: 'checkout',
          status: 'OK',
          spanKind: 'SERVER',
          statusMessage: null,
          traceState: null,
          scopeName: 'checkout-http',
          scopeVersion: null,
          durationNanos: 10_000_000,
          startTime: timeWindow.from,
          highlighted: false,
          resourceAttributes: { 'service.name': 'checkout' },
          spanAttributes: {},
          events: [],
          links: [],
          codeNavigationHint: null
        }
      ]
    },
    truncated: false
  };
}
