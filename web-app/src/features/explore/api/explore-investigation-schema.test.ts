/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';

import {
  ExploreInvestigationContractError,
  parseLogInvestigation,
  parseTraceInvestigation
} from './explore-investigation-schema';

const traceId = '0123456789abcdef0123456789abcdef';
const spanId = '0123456789abcdef';
const window = { from: 1_000, to: 2_000 } as const;

describe('Explore investigation composite schema', () => {
  it('parses the exact Trace contract and preserves honest block provenance', () => {
    const parsed = parseTraceInvestigation(traceSnapshot(), traceId, spanId, window);

    expect(parsed).toMatchObject({
      traceId,
      selectedSpanId: spanId,
      window: { start: 1_000, end: 2_000 },
      gantt: { state: 'ready', reason: 'observed', source: 'greptime_traces' },
      sameTraceLogs: { state: 'empty', reason: 'no_data', source: 'greptime_logs', logs: [] },
      red: { state: 'unavailable', reason: 'identity_unavailable', source: 'greptime_flow' },
      metrics: { state: 'unavailable', reason: 'query_strategy_unavailable', source: 'otlp_metrics' },
      dependencies: { state: 'empty', reason: 'no_data', source: 'greptime_traces' }
    });
  });

  it('rejects Trace identity, window, span-selection, and state contradictions', () => {
    const valid = traceSnapshot();
    for (const candidate of [
      { ...valid, traceId: 'fedcba9876543210fedcba9876543210' },
      { ...valid, traceId: '0123456789ABCDEF0123456789ABCDEF' },
      { ...valid, traceId: '0123456789abcdef0123456789abcde' },
      { ...valid, traceId: '0123456789abcdef0123456789abcdeg' },
      { ...valid, selectedSpanId: '0123456789abcdeG' },
      { ...valid, window: { start: 1_001, end: 2_000 } },
      { ...valid, selectedSpanId: 'fedcba9876543210' },
      { ...valid, gantt: { ...valid.gantt, detail: { ...valid.gantt.detail, durationNanos: 1_000_000 } } },
      { ...valid, gantt: { ...valid.gantt, detail: { ...valid.gantt.detail, durationNanos: '9223372036854775808' } } },
      {
        ...valid,
        gantt: {
          ...valid.gantt,
          detail: {
            ...valid.gantt.detail,
            spans: [{ ...valid.gantt.detail.spans[0], durationNanos: 1_000_000 }]
          }
        }
      },
      { ...valid, sameTraceLogs: { ...valid.sameTraceLogs, state: 'ready', reason: 'observed' } },
      { ...valid, gantt: { ...valid.gantt, reason: 'no_data' } },
      { ...valid, privateSql: 'select * from secrets' }
    ]) {
      expect(() => parseTraceInvestigation(candidate, traceId, spanId, window)).toThrow(
        ExploreInvestigationContractError
      );
    }
  });

  it('rejects ready correlated evidence when the Trace Gantt is non-ready', () => {
    const valid = traceSnapshot();
    const nonReadyGantt = { state: 'empty', reason: 'no_data', source: 'greptime_traces', detail: null };
    const readyIdentity = {
      workspaceId: 'default',
      entityId: '7',
      entityType: 'service',
      serviceName: 'checkout',
      serviceNamespace: null,
      deploymentEnvironment: null
    };
    const candidates = [
      {
        ...valid,
        gantt: nonReadyGantt,
        sameTraceLogs: {
          state: 'ready',
          reason: 'observed',
          source: 'greptime_logs',
          truncated: false,
          logs: [logRecord('event-8', '1787934874782123456')]
        }
      },
      {
        ...valid,
        gantt: nonReadyGantt,
        red: {
          state: 'ready',
          reason: 'observed',
          source: 'greptime_flow',
          resolutionSeconds: 60,
          identity: readyIdentity,
          summary: redValues(),
          series: [{ timestamp: 1_500, ...redValues() }]
        }
      },
      {
        ...valid,
        gantt: nonReadyGantt,
        metrics: {
          state: 'ready',
          reason: 'observed',
          source: 'otlp_metrics',
          truncated: false,
          series: [{ metricName: 'up', unit: null, labels: {}, points: [{ timestamp: 1_500, value: 1 }] }]
        }
      },
      {
        ...valid,
        gantt: nonReadyGantt,
        dependencies: {
          state: 'ready',
          reason: 'observed',
          source: 'greptime_traces',
          truncated: false,
          edges: [
            {
              sourceServiceName: 'checkout',
              targetServiceName: 'payments',
              sourceEntityId: '7',
              targetEntityId: '8',
              spanId,
              status: 'OK',
              durationMillis: 1
            }
          ]
        }
      }
    ];

    for (const candidate of candidates) {
      expect(() => parseTraceInvestigation(candidate, traceId, spanId, window)).toThrow(
        ExploreInvestigationContractError
      );
    }
  });

  it('parses selected and nearby Logs with lossless decimal times', () => {
    const parsed = parseLogInvestigation(logSnapshot(), 'event-7', window);

    expect(parsed.selectedLog).toMatchObject({
      state: 'ready',
      log: {
        logRecordUid: 'event-7',
        timeUnixNano: '1787934874782123456',
        observedTimeUnixNano: '1787934874782123999',
        traceId,
        spanId
      }
    });
    expect(parsed.nearbyLogs).toMatchObject({
      state: 'ready',
      hasMoreBefore: true,
      hasMoreAfter: false,
      before: [{ logRecordUid: 'event-6', timeUnixNano: '1787934874781123456' }],
      after: []
    });
  });

  it('fails closed on numeric nanoseconds, a mismatched selected record, and forged ready evidence', () => {
    const valid = logSnapshot();
    const selected = valid.selectedLog.log;
    for (const candidate of [
      {
        ...valid,
        selectedLog: { ...valid.selectedLog, log: { ...selected, timeUnixNano: Number('1787934874782123456') } }
      },
      { ...valid, selectedLog: { ...valid.selectedLog, log: { ...selected, logRecordUid: 'event-other' } } },
      {
        ...valid,
        nearbyLogs: {
          ...valid.nearbyLogs,
          state: 'empty',
          reason: 'no_data',
          hasMoreBefore: false
        }
      },
      { ...valid, trace: { ...valid.trace, state: 'ready', reason: 'observed' } }
    ]) {
      expect(() => parseLogInvestigation(candidate, 'event-7', window)).toThrow(ExploreInvestigationContractError);
    }
  });

  it('accepts exact non-ready Log dependency shapes and rejects cross-scope evidence', () => {
    const missing = {
      ...logSnapshot(),
      selectedLog: { state: 'empty', reason: 'not_found', source: 'greptime_logs', log: null },
      trace: { state: 'empty', reason: 'not_correlated', source: 'greptime_traces', detail: null },
      metrics: {
        state: 'unavailable',
        reason: 'query_strategy_unavailable',
        source: 'otlp_metrics',
        truncated: false,
        series: []
      },
      nearbyLogs: {
        state: 'empty',
        reason: 'no_data',
        source: 'greptime_logs',
        hasMoreBefore: false,
        hasMoreAfter: false,
        before: [],
        after: []
      }
    };
    expect(parseLogInvestigation(missing, 'event-7', window).selectedLog.state).toBe('empty');
    expect(() =>
      parseLogInvestigation({ ...missing, nearbyLogs: logSnapshot().nearbyLogs }, 'event-7', window)
    ).toThrow(ExploreInvestigationContractError);

    const upstreamUnavailable = {
      ...missing,
      selectedLog: { state: 'unavailable', reason: 'storage_unavailable', source: 'greptime_logs', log: null },
      trace: { state: 'unavailable', reason: 'upstream_unavailable', source: 'greptime_traces', detail: null },
      metrics: {
        state: 'unavailable',
        reason: 'upstream_unavailable',
        source: 'otlp_metrics',
        truncated: false,
        series: []
      },
      nearbyLogs: {
        state: 'unavailable',
        reason: 'upstream_unavailable',
        source: 'greptime_logs',
        hasMoreBefore: false,
        hasMoreAfter: false,
        before: [],
        after: []
      }
    };
    expect(parseLogInvestigation(upstreamUnavailable, 'event-7', window).selectedLog.state).toBe('unavailable');
    expect(() => parseLogInvestigation({ ...upstreamUnavailable, trace: missing.trace }, 'event-7', window)).toThrow(
      ExploreInvestigationContractError
    );
  });
});

function redValues() {
  return {
    requestCount: 1,
    errorCount: 0,
    requestRatePerSecond: 1,
    errorRate: 0,
    latencyAverageMs: 1,
    latencyP95Ms: 1
  };
}

function traceSnapshot() {
  return {
    traceId,
    selectedSpanId: spanId,
    window: { start: 1_000, end: 2_000 },
    gantt: {
      state: 'ready',
      reason: 'observed',
      source: 'greptime_traces',
      detail: traceDetail()
    },
    sameTraceLogs: {
      state: 'empty',
      reason: 'no_data',
      source: 'greptime_logs',
      truncated: false,
      logs: []
    },
    red: {
      state: 'unavailable',
      reason: 'identity_unavailable',
      source: 'greptime_flow',
      resolutionSeconds: 60,
      identity: null,
      summary: null,
      series: []
    },
    metrics: {
      state: 'unavailable',
      reason: 'query_strategy_unavailable',
      source: 'otlp_metrics',
      truncated: false,
      series: []
    },
    dependencies: {
      state: 'empty',
      reason: 'no_data',
      source: 'greptime_traces',
      truncated: false,
      edges: []
    }
  };
}

function logSnapshot() {
  return {
    logRecordUid: 'event-7',
    window: { start: 1_000, end: 2_000 },
    selectedLog: {
      state: 'ready',
      reason: 'observed',
      source: 'greptime_logs',
      log: logRecord('event-7', '1787934874782123456')
    },
    trace: {
      state: 'empty',
      reason: 'not_correlated',
      source: 'greptime_traces',
      detail: null
    },
    metrics: {
      state: 'unavailable',
      reason: 'query_strategy_unavailable',
      source: 'otlp_metrics',
      truncated: false,
      series: []
    },
    nearbyLogs: {
      state: 'ready',
      reason: 'observed',
      source: 'greptime_logs',
      hasMoreBefore: true,
      hasMoreAfter: false,
      before: [logRecord('event-6', '1787934874781123456')],
      after: []
    }
  };
}

function traceDetail() {
  return {
    rootSpanId: spanId,
    serviceName: 'checkout',
    serviceNamespace: 'commerce',
    deploymentEnvironment: 'prod',
    entityId: '7',
    entityType: 'service',
    rootSpanName: 'POST /checkout',
    durationNanos: '1000000',
    status: 'ERROR',
    startTime: 1_100,
    errorSpanCount: 1,
    resourceAttributes: { 'service.name': 'checkout' },
    spans: [
      {
        spanId,
        parentSpanId: null,
        spanName: 'POST /checkout',
        serviceName: 'checkout',
        serviceNamespace: 'commerce',
        deploymentEnvironment: 'prod',
        entityId: '7',
        entityType: 'service',
        status: 'ERROR',
        statusMessage: 'checkout failed',
        spanKind: 'SERVER',
        traceState: null,
        scopeName: 'checkout',
        scopeVersion: '1.0.0',
        durationNanos: '1000000',
        startTime: 1_100,
        highlighted: true,
        resourceAttributes: { 'service.name': 'checkout' },
        spanAttributes: { 'http.route': '/checkout' },
        events: [
          {
            timeUnixNano: '1787934874782123456',
            name: 'exception',
            attributes: { 'exception.type': 'Timeout' },
            droppedAttributesCount: 0
          }
        ],
        links: [],
        codeNavigationHint: null
      }
    ]
  };
}

function logRecord(uid: string, timeUnixNano: string) {
  return {
    logRecordUid: uid,
    timeUnixNano,
    observedTimeUnixNano: '1787934874782123999',
    severityNumber: 17,
    severityText: 'ERROR',
    body: 'checkout failed',
    traceId,
    spanId,
    identity: {
      workspaceId: 'team-a',
      entityId: '7',
      entityType: 'service',
      serviceName: 'checkout',
      serviceNamespace: 'commerce',
      deploymentEnvironment: 'prod'
    },
    attributes: { 'http.route': '/checkout' },
    resourceAttributes: { 'service.name': 'checkout' }
  };
}
