/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiMessageError, apiMessageGet } from '@/core/http/api-message';

import { HERTZBEAT_QUERY_LIMITS, queryHertzBeatData } from './hertzbeat-query-client';

vi.mock('@/core/http/api-message', async importOriginal => {
  const actual = await importOriginal<typeof import('@/core/http/api-message')>();
  return { ...actual, apiMessageGet: vi.fn() };
});

const request = vi.mocked(apiMessageGet);
const timeWindow = { from: 1_000, to: 2_000 } as const;
const context = {
  entityId: '42',
  entityType: 'service',
  serviceName: 'checkout',
  serviceNamespace: 'commerce',
  environment: 'prod',
  collectorId: 'collector-a',
  instance: 'checkout-01',
  endpoint: '/orders'
} as const;

describe('HertzBeat Perses query client', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('queries a simple metric through the authenticated same-origin console path', async () => {
    const signal = new AbortController().signal;
    request.mockResolvedValue(metricConsole());

    const result = await queryHertzBeatData(
      {
        signal: 'metrics',
        queryKind: 'time-series',
        timeWindow,
        context,
        metric: {
          name: 'http_server_duration_seconds',
          aggregation: 'avg',
          temporalAggregation: 'rate',
          stepSeconds: 15,
          operationName: 'POST /orders'
        },
        limit: 20
      },
      { signal }
    );

    const [path, options] = request.mock.calls[0] ?? [];
    expect(path).toMatch(/^\/api\/ingestion\/otlp\/metrics\/console\?/u);
    const params = new URL(path as string, 'https://hertzbeat.local').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      entityId: '42',
      entityType: 'service',
      start: '1000',
      end: '2000',
      serviceName: 'checkout',
      serviceNamespace: 'commerce',
      environment: 'prod',
      collectorId: 'collector-a',
      instance: 'checkout-01',
      endpoint: '/orders',
      query: 'http_server_duration_seconds',
      aggregation: 'avg',
      temporalAggregation: 'rate',
      step: '15',
      limit: '20',
      operationName: 'POST /orders'
    });
    expect(options).toEqual({ signal });
    expect(path).not.toMatch(/workspace|sql|promql|secret|greptime/iu);
    expect(result).toEqual({
      state: 'ready',
      data: {
        timeWindow,
        source: 'Greptime-promql',
        series: [
          {
            key: 'http_server_duration_seconds-0',
            name: 'http_server_duration_seconds',
            unit: 'seconds',
            labels: { __name__: 'http_server_duration_seconds', service_name: 'checkout' },
            points: [
              { timestamp: 1_000, value: 12 },
              { timestamp: 2_000, value: 14 }
            ]
          }
        ]
      },
      truncated: 'unknown'
    });
  });

  it('keeps a valid empty metric response distinct from fake zero evidence', async () => {
    request.mockResolvedValue(metricConsole({ frames: [], totalSeries: 0, nonEmptySeries: 0 }));

    await expect(
      queryHertzBeatData({
        signal: 'metrics',
        queryKind: 'time-series',
        timeWindow,
        metric: { name: 'http_requests_total' }
      })
    ).resolves.toEqual({ state: 'empty', truncated: false });
  });

  it('rejects metric frame and statistics contradictions instead of reporting false empty evidence', async () => {
    request
      .mockResolvedValueOnce(metricConsole({ frames: [], totalSeries: 1, nonEmptySeries: 0 }))
      .mockResolvedValueOnce(metricConsole({ frames: [metricFrame()], totalSeries: 0, nonEmptySeries: 0 }));
    const query = {
      signal: 'metrics',
      queryKind: 'time-series',
      timeWindow,
      metric: { name: 'up' }
    } as const;

    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error' }
    });
    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error' }
    });
  });

  it('queries bounded log and trace tables through their typed endpoints', async () => {
    request
      .mockResolvedValueOnce({ content: [logRow()], totalElements: 3, pageIndex: 0, pageSize: 2 })
      .mockResolvedValueOnce({ content: [traceRow()], totalElements: 1, totalPages: 1, number: 0, size: 2 });

    const logs = await queryHertzBeatData({
      signal: 'logs',
      queryKind: 'table',
      timeWindow,
      context,
      search: 'checkout failed',
      severity: 'ERROR',
      traceId: '0123456789abcdef0123456789abcdef',
      hideInternal: true,
      limit: 2
    });
    const traces = await queryHertzBeatData({
      signal: 'traces',
      queryKind: 'table',
      timeWindow,
      context,
      operationName: 'POST /orders',
      errorOnly: true,
      spanScope: 'entrypoint',
      limit: 2
    });

    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/logs/list?entityId=42&entityType=service&start=1000&end=2000&serviceName=checkout&serviceNamespace=commerce&environment=prod&collectorId=collector-a&instance=checkout-01&endpoint=%2Forders&pageIndex=0&pageSize=2&search=checkout+failed&severityText=ERROR&traceId=0123456789abcdef0123456789abcdef&hideInternal=true',
      '/api/traces/list?entityId=42&entityType=service&start=1000&end=2000&serviceName=checkout&serviceNamespace=commerce&environment=prod&collectorId=collector-a&instance=checkout-01&endpoint=%2Forders&pageIndex=0&pageSize=2&operationName=POST+%2Forders&errorOnly=true&spanScope=entrypoint'
    ]);
    expect(logs).toMatchObject({ state: 'ready', truncated: true, data: { rows: [{ severityText: 'ERROR' }] } });
    expect(traces).toMatchObject({
      state: 'ready',
      truncated: false,
      data: { rows: [{ traceId: '0123456789abcdef0123456789abcdef' }] }
    });
  });

  it('rejects numeric nanoseconds from the historical log endpoint', async () => {
    request.mockResolvedValue({
      content: [{ ...logRow(), timeUnixNano: 1_000_000_000 }],
      totalElements: 1,
      pageIndex: 0,
      pageSize: 2
    });

    await expect(
      queryHertzBeatData({ signal: 'logs', queryKind: 'table', timeWindow, limit: 2 })
    ).resolves.toMatchObject({ state: 'error', error: { kind: 'contract_error' } });
  });

  it.each([{ spanCount: -1 }, { spanCount: 1.5 }, { spanCount: undefined }])(
    'rejects trace table row with invalid or missing span count',
    async override => {
      request.mockResolvedValue({
        content: [{ ...traceRow(), ...override }],
        totalElements: 1,
        totalPages: 1,
        number: 0,
        size: 2
      });

      await expect(
        queryHertzBeatData({ signal: 'traces', queryKind: 'table', timeWindow, limit: 2 })
      ).resolves.toMatchObject({ state: 'error', error: { kind: 'contract_error' } });
    }
  );

  it.each([
    { serviceStats: undefined },
    { serviceStats: { checkout: { spanCount: 0, errorCount: 0 } } },
    { serviceStats: { checkout: { spanCount: 2, errorCount: 3 } } },
    { serviceStats: { checkout: { spanCount: 1, errorCount: 0 } }, spanCount: 2 }
  ])('rejects trace table row with missing, invalid, or incomplete service statistics', async override => {
    request.mockResolvedValue({
      content: [{ ...traceRow(), ...override }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 2
    });

    await expect(
      queryHertzBeatData({ signal: 'traces', queryKind: 'table', timeWindow, limit: 2 })
    ).resolves.toMatchObject({ state: 'error', error: { kind: 'contract_error' } });
  });

  it('rejects an empty first page when log or trace totals claim missing rows', async () => {
    request
      .mockResolvedValueOnce({ content: [], totalElements: 1, pageIndex: 0, pageSize: 2 })
      .mockResolvedValueOnce({ content: [], totalElements: 1, totalPages: 1, number: 0, size: 2 });

    const logs = await queryHertzBeatData({ signal: 'logs', queryKind: 'table', timeWindow, limit: 2 });
    const traces = await queryHertzBeatData({ signal: 'traces', queryKind: 'table', timeWindow, limit: 2 });

    expect(logs).toMatchObject({ state: 'error', error: { kind: 'contract_error' } });
    expect(traces).toMatchObject({ state: 'error', error: { kind: 'contract_error' } });
  });

  it('loads one trace gantt primitive without exposing a free-form endpoint', async () => {
    request.mockResolvedValue(traceComposite('ready', 'fedcba9876543210'));

    const result = await queryHertzBeatData({
      signal: 'traces',
      queryKind: 'gantt',
      timeWindow,
      context,
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: 'fedcba9876543210'
    });

    expect(request.mock.calls[0]?.[0]).toBe(
      '/api/traces/0123456789abcdef0123456789abcdef?start=1000&end=2000&spanId=fedcba9876543210'
    );
    expect(result).toMatchObject({
      state: 'ready',
      truncated: false,
      data: {
        traceId: '0123456789abcdef0123456789abcdef',
        spans: [{ spanId: '0123456789abcdef' }, { spanId: 'fedcba9876543210' }]
      }
    });
  });

  it('rejects a mismatched composite window or selected span instead of displaying stale Gantt evidence', async () => {
    request
      .mockResolvedValueOnce({ ...traceComposite('ready'), window: { start: 1_001, end: 2_000 } })
      .mockResolvedValueOnce(traceComposite('ready', 'span-other'));

    await expect(
      queryHertzBeatData({
        signal: 'traces',
        queryKind: 'gantt',
        timeWindow,
        traceId: '0123456789abcdef0123456789abcdef'
      })
    ).resolves.toMatchObject({ state: 'error', error: { kind: 'contract_error' } });
    await expect(
      queryHertzBeatData({
        signal: 'traces',
        queryKind: 'gantt',
        timeWindow,
        traceId: '0123456789abcdef0123456789abcdef'
      })
    ).resolves.toMatchObject({ state: 'error', error: { kind: 'contract_error' } });
  });

  it('preserves lossless event nanoseconds and rejects numeric or uint64-overflow values', async () => {
    const valid = traceComposite('ready');
    if (valid.gantt.detail) {
      valid.gantt.detail.spans[0]!.events = [
        {
          timeUnixNano: '18446744073709551615',
          name: 'exception',
          attributes: {},
          droppedAttributesCount: 0
        }
      ];
    }
    request
      .mockResolvedValueOnce(valid)
      .mockResolvedValueOnce(withEventTime(1_750_000_001_005_000_000))
      .mockResolvedValueOnce(withEventTime('18446744073709551616'));
    const query = {
      signal: 'traces',
      queryKind: 'gantt',
      timeWindow,
      traceId: '0123456789abcdef0123456789abcdef'
    } as const;

    const ready = await queryHertzBeatData(query);
    expect(ready.state).toBe('ready');
    if (ready.state === 'ready') {
      expect(ready.data.spans?.[0]?.events?.[0]?.timeUnixNano).toBe('18446744073709551615');
    }
    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error' }
    });
    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error' }
    });
  });

  it('rejects numeric or out-of-range composite Trace durations', async () => {
    const numeric = traceComposite('ready');
    const overflow = traceComposite('ready');
    if (numeric.gantt.detail) numeric.gantt.detail.durationNanos = 10_000_000 as unknown as string;
    if (overflow.gantt.detail) overflow.gantt.detail.spans[0]!.durationNanos = '9223372036854775808';
    request.mockResolvedValueOnce(numeric).mockResolvedValueOnce(overflow);
    const query = {
      signal: 'traces',
      queryKind: 'gantt',
      timeWindow,
      traceId: '0123456789abcdef0123456789abcdef'
    } as const;

    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error' }
    });
    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error' }
    });
  });

  it('maps honest composite Gantt empty and unavailable states without manufacturing detail', async () => {
    request.mockResolvedValueOnce(traceComposite('empty')).mockResolvedValueOnce(traceComposite('unavailable'));
    const query = {
      signal: 'traces',
      queryKind: 'gantt',
      timeWindow,
      traceId: '0123456789abcdef0123456789abcdef'
    } as const;

    await expect(queryHertzBeatData(query)).resolves.toEqual({ state: 'empty', truncated: false });
    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'unavailable' }
    });
  });

  it('rejects unbounded or transport-shaped input before issuing a request', async () => {
    const invalid = [
      { signal: 'metrics', queryKind: 'time-series', timeWindow: { from: 2_000, to: 1_000 }, metric: { name: 'up' } },
      { signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'sum(rate(up[5m]))' } },
      {
        signal: 'logs',
        queryKind: 'table',
        timeWindow,
        limit: HERTZBEAT_QUERY_LIMITS.tableRows + 1,
        url: 'https://greptime.invalid',
        sql: 'select * from secrets'
      },
      {
        signal: 'traces',
        queryKind: 'table',
        timeWindow,
        traceId: '0123456789abcdef0123456789abcdef'
      },
      {
        signal: 'traces',
        queryKind: 'gantt',
        timeWindow,
        traceId: '0123456789ABCDEF0123456789ABCDEF'
      },
      {
        signal: 'traces',
        queryKind: 'gantt',
        timeWindow,
        traceId: '0123456789abcdef0123456789abcde'
      },
      {
        signal: 'traces',
        queryKind: 'gantt',
        timeWindow,
        traceId: '0123456789abcdef0123456789abcdeg'
      },
      {
        signal: 'traces',
        queryKind: 'gantt',
        timeWindow,
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdeG'
      }
    ];

    for (const candidate of invalid) {
      await expect(queryHertzBeatData(candidate as never)).resolves.toMatchObject({
        state: 'error',
        error: { kind: 'invalid_request', retryable: false }
      });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('accepts the full positive Java Long entity id range and rejects overflow', async () => {
    request.mockResolvedValue(metricConsole({ entityId: Number('9223372036854775807') }));
    const query = {
      signal: 'metrics',
      queryKind: 'time-series',
      timeWindow,
      metric: { name: 'up' }
    } as const;

    const accepted = await queryHertzBeatData({
      ...query,
      context: { entityId: '9223372036854775807' }
    });
    const rejected = await queryHertzBeatData({
      ...query,
      context: { entityId: '9223372036854775808' }
    });

    expect(accepted.state).toBe('ready');
    expect(request.mock.calls[0]?.[0]).toContain('entityId=9223372036854775807');
    expect(rejected).toMatchObject({ state: 'error', error: { kind: 'invalid_request' } });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects metric responses that exceed the defensive series or point budgets', async () => {
    request
      .mockResolvedValueOnce(metricConsole({ frames: Array.from({ length: 33 }, () => metricFrame()) }))
      .mockResolvedValueOnce(
        metricConsole({
          frames: [
            {
              ...metricFrame(),
              data: Array.from({ length: HERTZBEAT_QUERY_LIMITS.metricPointsPerSeries + 1 }, (_, index) => [
                index,
                index
              ])
            }
          ]
        })
      );
    const query = {
      signal: 'metrics',
      queryKind: 'time-series',
      timeWindow,
      metric: { name: 'up' }
    } as const;

    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error', messageKey: 'perses.query.contract' }
    });
    await expect(queryHertzBeatData(query)).resolves.toMatchObject({
      state: 'error',
      error: { kind: 'contract_error', messageKey: 'perses.query.contract' }
    });
  });

  it('returns sanitized typed failures and never exposes backend diagnostics', async () => {
    request
      .mockRejectedValueOnce(new ApiMessageError('permission sql=SELECT secret', { status: 403 }))
      .mockRejectedValueOnce(new ApiMessageError('capacity query=private_metric', { status: 429 }))
      .mockResolvedValueOnce({ unexpected: 'private payload' });

    const query = {
      signal: 'metrics',
      queryKind: 'time-series',
      timeWindow,
      metric: { name: 'up' }
    } as const;
    const permission = await queryHertzBeatData(query);
    const overloaded = await queryHertzBeatData(query);
    const contract = await queryHertzBeatData(query);

    expect(permission).toEqual({
      state: 'error',
      error: {
        kind: 'permission',
        messageKey: 'perses.query.permission',
        retryable: false
      }
    });
    expect(overloaded).toEqual({
      state: 'error',
      error: { kind: 'overloaded', messageKey: 'perses.query.overloaded', retryable: true }
    });
    expect(contract).toEqual({
      state: 'error',
      error: {
        kind: 'contract_error',
        messageKey: 'perses.query.contract',
        retryable: false
      }
    });
    expect(JSON.stringify([permission, overloaded, contract])).not.toMatch(
      /SELECT|secret|private_metric|private payload/u
    );
  });

  it('propagates caller cancellation instead of converting it into an unavailable state', async () => {
    const controller = new AbortController();
    request.mockImplementation(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new ApiMessageError('cancelled')));
        })
    );
    const pending = queryHertzBeatData(
      { signal: 'metrics', queryKind: 'time-series', timeWindow, metric: { name: 'up' } },
      { signal: controller.signal }
    );

    controller.abort(new DOMException('Cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(request.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });
});

function metricConsole(
  options: { entityId?: number; frames?: unknown[]; totalSeries?: number; nonEmptySeries?: number } = {}
) {
  return {
    context: {
      entityId: options.entityId ?? 42,
      entityType: 'service',
      entityName: 'Checkout API',
      serviceName: 'checkout',
      serviceNamespace: 'commerce',
      environment: 'prod',
      collectorId: 'collector-a',
      instance: 'checkout-01',
      endpoint: '/orders',
      operationName: 'POST /orders',
      start: 1_000,
      end: 2_000
    },
    query: 'http_server_duration_seconds',
    datasource: 'Greptime-promql',
    queryMode: 'promql',
    results: {
      refId: 'otlp-metrics-console',
      status: 200,
      msg: null,
      frames: options.frames ?? [metricFrame()]
    },
    stats: {
      totalSeries: options.totalSeries ?? 1,
      nonEmptySeries: options.nonEmptySeries ?? 1,
      latestObservedAt: 2_000
    },
    emptyStateReason: null,
    errorMessage: null
  };
}

function metricFrame() {
  return {
    schema: {
      fields: [
        { name: '__ts__', type: 'time', unit: null },
        { name: '__value__', type: 'number', unit: 'seconds' }
      ],
      labels: { __name__: 'http_server_duration_seconds', service_name: 'checkout' },
      meta: {}
    },
    data: [
      [1_000, 12],
      [2_000, 14]
    ]
  };
}

function logRow() {
  return {
    logRecordUid: 'event-1',
    timeUnixNano: '1000000000',
    observedTimeUnixNano: '1000000000',
    severityNumber: 17,
    severityText: 'ERROR',
    body: 'checkout failed',
    attributes: {},
    droppedAttributesCount: 0,
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    traceFlags: 1,
    resource: { 'service.name': 'checkout' },
    resourceSchemaUrl: null,
    instrumentationScope: null,
    scopeSchemaUrl: null
  };
}

function traceRow() {
  return {
    traceId: '0123456789abcdef0123456789abcdef',
    rootSpanId: '0123456789abcdef',
    serviceName: 'checkout',
    serviceNamespace: 'commerce',
    rootSpanName: 'POST /orders',
    durationNanos: 10_000_000,
    status: 'ERROR',
    startTime: 1_000,
    errorSpanCount: 1,
    spanCount: 2,
    serviceStats: {
      checkout: { spanCount: 1, errorCount: 0 },
      payment: { spanCount: 1, errorCount: 1 }
    },
    resourceAttributes: { 'service.name': 'checkout' }
  };
}

function traceComposite(state: 'ready' | 'empty' | 'unavailable', selectedSpanId: string | null = null) {
  return {
    traceId: '0123456789abcdef0123456789abcdef',
    selectedSpanId,
    window: { start: 1_000, end: 2_000 },
    gantt: {
      state,
      reason: state === 'ready' ? 'observed' : state === 'empty' ? 'no_data' : 'storage_unavailable',
      source: 'greptime_traces',
      detail: state === 'ready' ? compositeTraceDetail() : null
    },
    sameTraceLogs: {},
    red: {},
    metrics: {},
    dependencies: {}
  };
}

function compositeTraceDetail() {
  return {
    rootSpanId: '0123456789abcdef',
    serviceName: 'checkout',
    serviceNamespace: 'commerce',
    deploymentEnvironment: 'prod',
    entityId: '42',
    entityType: 'service',
    rootSpanName: 'POST /orders',
    durationNanos: '10000000',
    status: 'ERROR',
    startTime: 1_000,
    errorSpanCount: 1,
    resourceAttributes: { 'service.name': 'checkout' },
    spans: [compositeSpan('0123456789abcdef', null, false), compositeSpan('fedcba9876543210', '0123456789abcdef', true)]
  };
}

function compositeSpan(spanId: string, parentSpanId: string | null, failed: boolean) {
  return {
    spanId,
    parentSpanId,
    spanName: spanId === '0123456789abcdef' ? 'POST /orders' : 'SELECT cart',
    serviceName: 'checkout',
    serviceNamespace: 'commerce',
    deploymentEnvironment: 'prod',
    entityId: '42',
    entityType: 'service',
    status: failed ? 'ERROR' : 'OK',
    statusMessage: failed ? 'database unavailable' : null,
    spanKind: failed ? 'CLIENT' : 'SERVER',
    traceState: null,
    scopeName: 'checkout',
    scopeVersion: '1.0.0',
    durationNanos: '5000000',
    startTime: 1_000,
    highlighted: failed,
    resourceAttributes: {},
    spanAttributes: {},
    events: [] as Array<Record<string, unknown>>,
    links: [],
    codeNavigationHint: null
  };
}

function withEventTime(timeUnixNano: string | number) {
  const value = traceComposite('ready');
  if (value.gantt.detail) {
    value.gantt.detail.spans[0]!.events = [
      { timeUnixNano, name: 'exception', attributes: {}, droppedAttributesCount: 0 }
    ];
  }
  return value;
}
