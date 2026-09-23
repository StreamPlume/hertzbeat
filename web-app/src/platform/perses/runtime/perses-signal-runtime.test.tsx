/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { cleanup, render } from '@testing-library/react';
import type { PanelDefinition, QueryDefinition } from '@perses-dev/spec';
import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeContract = vi.hoisted(() => ({
  panels: [] as PanelDefinition[],
  queries: [] as QueryDefinition[][],
  pluginLoaders: [] as unknown[],
  timeWindowCallbacks: [] as Array<unknown>,
  timeWindowChangeFlags: [] as Array<boolean | undefined>
}));

vi.mock('@perses-dev/dashboards', () => ({
  Panel: ({ definition }: { definition: PanelDefinition }) => {
    runtimeContract.panels.push(definition);
    return <div data-testid="perses-panel" />;
  }
}));
vi.mock('@perses-dev/plugin-system', () => ({
  DataQueriesProvider: ({
    children,
    definitions
  }: {
    children: import('react').ReactNode;
    definitions: QueryDefinition[];
  }) => {
    runtimeContract.queries.push(definitions);
    return children;
  }
}));
vi.mock('./perses-runtime-providers', () => ({
  PersesRuntimeProviders: ({
    children,
    pluginLoader,
    onTimeWindowChange,
    timeWindowChangeEnabled
  }: {
    children: import('react').ReactNode;
    pluginLoader: unknown;
    onTimeWindowChange?: unknown;
    timeWindowChangeEnabled?: boolean | undefined;
  }) => {
    runtimeContract.pluginLoaders.push(pluginLoader);
    runtimeContract.timeWindowCallbacks.push(onTimeWindowChange);
    runtimeContract.timeWindowChangeFlags.push(timeWindowChangeEnabled);
    return children;
  }
}));
vi.mock('../plugins/perses-multi-signal-plugin-loader', () => ({
  hertzBeatPersesMultiSignalPluginLoader: { kind: 'multi-signal-loader' }
}));

import { hertzBeatPersesMultiSignalPluginLoader } from '../plugins/perses-multi-signal-plugin-loader';
import { PersesSignalRuntime, type PersesSignalRuntimeProps } from './perses-signal-runtime';

const timeWindow = { from: 1_750_000_000_000, to: 1_750_000_060_000 } as const;

describe('PersesSignalRuntime', () => {
  afterEach(() => {
    cleanup();
    runtimeContract.panels = [];
    runtimeContract.queries = [];
    runtimeContract.pluginLoaders = [];
    runtimeContract.timeWindowCallbacks = [];
    runtimeContract.timeWindowChangeFlags = [];
  });

  it('routes each typed snapshot to the matching official Perses panel and query kind', () => {
    const cases: Array<{
      props: PersesSignalRuntimeProps;
      panelKind: string;
      queryKind: string;
      snapshotKind: string;
    }> = [
      {
        props: {
          kind: 'metric-time-series',
          title: 'Metric',
          timeWindow,
          data: {
            timeRange: { start: new Date(timeWindow.from), end: new Date(timeWindow.to) },
            stepMs: 15_000,
            series: []
          }
        },
        panelKind: 'TimeSeriesChart',
        queryKind: 'TimeSeriesQuery',
        snapshotKind: 'HertzBeatSnapshotTimeSeriesQuery'
      },
      {
        props: { kind: 'logs-table', title: 'Logs', timeWindow, data: { entries: [] } },
        panelKind: 'LogsTable',
        queryKind: 'LogQuery',
        snapshotKind: 'HertzBeatSnapshotLogQuery'
      },
      {
        props: { kind: 'trace-table', title: 'Traces', timeWindow, data: { searchResult: [] } },
        panelKind: 'TraceTable',
        queryKind: 'TraceQuery',
        snapshotKind: 'HertzBeatSnapshotTraceQuery'
      },
      {
        props: {
          kind: 'tracing-gantt-chart',
          title: 'Trace detail',
          timeWindow,
          selectedSpanId: '0123456789abcdef',
          data: { trace: { resourceSpans: [] } }
        },
        panelKind: 'TracingGanttChart',
        queryKind: 'TraceQuery',
        snapshotKind: 'HertzBeatSnapshotTraceQuery'
      }
    ];

    for (const item of cases) {
      const view = render(<PersesSignalRuntime {...item.props} />);
      const panel = runtimeContract.panels.at(-1);
      const query = runtimeContract.queries.at(-1)?.[0];
      expect(panel?.spec.plugin.kind).toBe(item.panelKind);
      expect(query?.kind).toBe(item.queryKind);
      expect(query?.spec.plugin.kind).toBe(item.snapshotKind);
      expect(runtimeContract.pluginLoaders.at(-1)).toBe(hertzBeatPersesMultiSignalPluginLoader);
      if (item.props.kind === 'logs-table') {
        expect(panel?.spec.plugin.spec).toMatchObject({
          allowWrap: true,
          enableDetails: true,
          showTime: true,
          showSelectionHints: false
        });
      }
      if (item.props.kind === 'tracing-gantt-chart') {
        expect(panel?.spec.plugin.spec).toMatchObject({ selectedSpanId: '0123456789abcdef' });
      }
      view.unmount();
    }
  });

  it('forwards host log display preferences to the official LogsTable spec', () => {
    const view = render(
      <PersesSignalRuntime
        kind="logs-table"
        title="Logs"
        timeWindow={timeWindow}
        data={{ entries: [] }}
        display={{ density: 'compact', wrap: false, showTime: false }}
      />
    );

    expect(runtimeContract.panels.at(-1)?.spec.plugin.spec).toMatchObject({ allowWrap: false, showTime: false });
    view.unmount();
  });

  it('uses bars only when the caller identifies a histogram-style time series', () => {
    const data = {
      timeRange: { start: new Date(timeWindow.from), end: new Date(timeWindow.to) },
      stepMs: 60_000,
      series: []
    };
    const line = render(
      <PersesSignalRuntime kind="metric-time-series" title="Metric" timeWindow={timeWindow} data={data} />
    );
    expect(runtimeContract.panels.at(-1)?.spec.plugin.spec).toMatchObject({ visual: { display: 'line' } });
    line.unmount();

    render(
      <PersesSignalRuntime
        kind="metric-time-series"
        title="Log trend"
        timeWindow={timeWindow}
        data={data}
        display="bar"
      />
    );
    expect(runtimeContract.panels.at(-1)?.spec.plugin.spec).toMatchObject({ visual: { display: 'bar' } });
  });

  it('disables official inline details only when the host provides an Inspector row selection', () => {
    render(
      <PersesSignalRuntime
        kind="logs-table"
        title="Logs"
        timeWindow={timeWindow}
        data={{ entries: [] }}
        rowSelection={{
          ariaLabel: 'Historical logs',
          controlsId: 'log-inspector',
          getAriaLabel: index => `Log ${index + 1}`,
          onSelect: vi.fn()
        }}
      />
    );

    expect(runtimeContract.panels.at(-1)?.spec.plugin.spec).toMatchObject({ enableDetails: false });
  });

  it('forwards a host time-window callback only for a metric time-series runtime', () => {
    const onTimeWindowChange = vi.fn();
    const metric = render(
      <PersesSignalRuntime
        kind="metric-time-series"
        title="Metric"
        timeWindow={timeWindow}
        data={{ timeRange: { start: new Date(timeWindow.from), end: new Date(timeWindow.to) }, series: [] }}
        onTimeWindowChange={onTimeWindowChange}
      />
    );
    expect(runtimeContract.timeWindowCallbacks.at(-1)).toBe(onTimeWindowChange);
    expect(runtimeContract.timeWindowChangeFlags.at(-1)).toBe(true);
    metric.unmount();

    const logs = render(
      <PersesSignalRuntime kind="logs-table" title="Logs" timeWindow={timeWindow} data={{ entries: [] }} />
    );
    expect(runtimeContract.timeWindowCallbacks.at(-1)).toBeUndefined();
    logs.unmount();
  });

  it('disables metric time-window interaction when the host marks retained evidence stale', () => {
    render(
      <PersesSignalRuntime
        kind="metric-time-series"
        title="Retained metric"
        timeWindow={timeWindow}
        data={{ timeRange: { start: new Date(timeWindow.from), end: new Date(timeWindow.to) }, series: [] }}
        timeWindowChangeEnabled={false}
      />
    );

    expect(runtimeContract.timeWindowChangeFlags.at(-1)).toBe(false);
  });
});
