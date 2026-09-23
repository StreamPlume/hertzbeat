/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';

import { ExploreSignalContractError, type LogRow, type MetricConsole, type TraceRow } from './explore-signal-contract';
import {
  createExploreLogPersesResult,
  createExploreMetricPersesResult,
  createExploreTracePersesResult,
  createLogTrendPersesResult
} from './explore-perses-result-model';

const window = { from: 1_750_000_000_000, to: 1_750_000_060_000 } as const;

describe('Explore Perses result adapters', () => {
  it('keeps the complete metric evidence scope in the runtime identity', () => {
    const first = createExploreMetricPersesResult(
      { signal: 'metrics', timeRange: 'last-30m', query: 'latency', metricFilter: 'method=GET' },
      metricConsole,
      window,
      3
    );
    const second = createExploreMetricPersesResult(
      { signal: 'metrics', timeRange: 'last-30m', query: 'latency', metricFilter: 'method=POST' },
      metricConsole,
      window,
      3
    );

    expect(first.runtimeIdentity).not.toBe(second.runtimeIdentity);
    expect(first.runtimeIdentity).toContain('metricFilter=method%3DGET');
    expect(first.runtimeIdentity).toContain('"revision":3');
    expect(first.outcome.data.series[0]?.points).toEqual([{ timestamp: window.from, value: 5 }]);
  });

  it('rejects a malformed ready metric sample instead of dropping it into empty evidence', () => {
    const malformed = structuredClone(metricConsole);
    malformed.results!.frames![0]!.data = [[window.from, 'not-a-number']];

    expect(() =>
      createExploreMetricPersesResult(
        { signal: 'metrics', timeRange: 'last-30m', query: 'latency' },
        malformed,
        window,
        0
      )
    ).toThrow(ExploreSignalContractError);
  });

  it('maps the authoritative log page and trace page without fabricating pagination totals', () => {
    const logs = createExploreLogPersesResult(
      { signal: 'logs', timeRange: 'last-30m', query: 'timeout', pageIndex: 2 },
      { content: [logRow], totalElements: 57, totalPages: 3, number: 2, size: 20 },
      window,
      4
    );
    const traces = createExploreTracePersesResult(
      { signal: 'traces', timeRange: 'last-30m', errorOnly: true, pageIndex: 1 },
      { content: [traceRow], totalElements: 22, totalPages: 2, number: 1, size: 20 },
      window,
      4
    );

    expect(logs.outcome.data).toEqual({ rows: [logRow], total: 57 });
    expect(logs.query.limit).toBe(20);
    expect(logs.runtimeIdentity).toContain('page=2');
    expect(traces.outcome.data.total).toBe(22);
    expect(traces.runtimeIdentity).toContain('errorOnly=true');
  });

  it('rejects incomplete trace rows and maps log trend independently', () => {
    expect(() =>
      createExploreTracePersesResult(
        { signal: 'traces', timeRange: 'last-30m' },
        {
          content: [{ ...traceRow, serviceStats: null }],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 20
        },
        window,
        0
      )
    ).toThrow(ExploreSignalContractError);

    expect(() =>
      createExploreTracePersesResult(
        { signal: 'traces', timeRange: 'last-30m' },
        {
          content: [{ ...traceRow, spanCount: 3 }],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 20
        },
        window,
        0
      )
    ).toThrow(ExploreSignalContractError);

    const trend = createLogTrendPersesResult(
      { start: window.from, end: window.to, intervalMs: 60_000, buckets: [{ start: window.from, count: 7 }] },
      window,
      'scope'
    );
    expect(trend.outcome.data.series[0]?.points[0]).toEqual({
      timestamp: window.from,
      value: 7
    });
  });
});

const metricConsole: MetricConsole = {
  context: {
    entityId: null,
    entityType: null,
    entityName: null,
    serviceName: null,
    serviceNamespace: null,
    environment: null,
    operationName: null,
    start: window.from,
    end: window.to
  },
  query: 'latency',
  datasource: 'greptime',
  queryMode: 'range',
  results: {
    refId: 'A',
    status: 200,
    msg: null,
    frames: [
      {
        schema: {
          fields: [{ name: 'value', type: 'number', unit: 'ms' }],
          labels: { __name__: 'latency' },
          meta: null
        },
        data: [[window.from, 5]]
      }
    ]
  },
  stats: { totalSeries: 1, nonEmptySeries: 1, latestObservedAt: window.from },
  emptyStateReason: null,
  errorMessage: null
};

const logRow: LogRow = {
  logRecordUid: 'log-1',
  timeUnixNano: '1750000000000000000',
  observedTimeUnixNano: null,
  severityNumber: 17,
  severityText: 'ERROR',
  body: 'timeout',
  attributes: {},
  droppedAttributesCount: 0,
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '0123456789abcdef',
  traceFlags: 1,
  resource: {},
  resourceSchemaUrl: null,
  instrumentationScope: null,
  scopeSchemaUrl: null
};

const traceRow: TraceRow = {
  traceId: '0123456789abcdef0123456789abcdef',
  rootSpanId: '0123456789abcdef',
  serviceName: 'checkout',
  serviceNamespace: 'commerce',
  rootSpanName: 'POST /checkout',
  durationNanos: 5_000_000,
  status: 'ERROR',
  startTime: window.from,
  errorSpanCount: 1,
  resourceAttributes: {},
  spanCount: 2,
  serviceStats: { checkout: { spanCount: 2, errorCount: 1 } }
};
