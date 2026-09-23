/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMessageGet } from '@/core/http/api-message';

import {
  buildLogInvestigationApiPath,
  buildTraceInvestigationApiPath,
  loadLogInvestigation,
  loadTraceInvestigation
} from './explore-investigation-api';

vi.mock('@/core/http/api-message', async importOriginal => {
  const actual = await importOriginal<typeof import('@/core/http/api-message')>();
  return { ...actual, apiMessageGet: vi.fn() };
});

const request = vi.mocked(apiMessageGet);
const window = { from: 1_000, to: 2_000 } as const;
const traceId = '0123456789abcdef0123456789abcdef';
const spanId = '0123456789abcdef';

describe('Explore investigation API', () => {
  beforeEach(() => request.mockReset());

  it('loads one encoded Trace composite with exact identity/window and AbortSignal', async () => {
    const signal = new AbortController().signal;
    request.mockResolvedValue(traceSnapshot());

    await expect(loadTraceInvestigation(traceId, spanId, window, signal)).resolves.toMatchObject({ traceId });
    expect(request).toHaveBeenCalledWith(`/api/traces/${traceId}?start=1000&end=2000&spanId=${spanId}`, { signal });
  });

  it('loads one selected Log composite without forwarding nanosecond time as a number', async () => {
    request.mockResolvedValue(logSnapshot());

    await expect(loadLogInvestigation('event-7', window)).resolves.toMatchObject({ logRecordUid: 'event-7' });
    expect(request).toHaveBeenCalledWith('/api/logs/context?logRecordUid=event-7&start=1000&end=2000', {
      signal: null
    });
  });

  it('rejects invalid identity/window before transport', () => {
    for (const operation of [
      () => buildTraceInvestigationApiPath('', undefined, window),
      () => buildTraceInvestigationApiPath(traceId.toUpperCase(), undefined, window),
      () => buildTraceInvestigationApiPath('0123456789abcdef0123456789abcdeg', undefined, window),
      () => buildTraceInvestigationApiPath(traceId, spanId.toUpperCase(), window),
      () => buildTraceInvestigationApiPath(traceId, '0123456789abcdeg', window),
      () => buildTraceInvestigationApiPath(traceId, undefined, { from: 2_000, to: 1_000 }),
      () => buildLogInvestigationApiPath('unsafe uid', window),
      () => buildLogInvestigationApiPath('event-7', { from: 1_000, to: 86_402_000 })
    ]) {
      expect(operation).toThrow();
    }
    expect(request).not.toHaveBeenCalled();
  });
});

function traceSnapshot() {
  return {
    traceId,
    selectedSpanId: spanId,
    window: { start: 1_000, end: 2_000 },
    gantt: { state: 'empty', reason: 'no_data', source: 'greptime_traces', detail: null },
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
}
