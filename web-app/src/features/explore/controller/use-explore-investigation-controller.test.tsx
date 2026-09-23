/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadLogInvestigation, loadTraceInvestigation } from '../api/explore-investigation-api';
import { ExploreInvestigationContractError } from '../api/explore-investigation-schema';
import { parseExploreQuery } from '../model/explore-model';
import { useLogInvestigationController } from './use-log-investigation-controller';
import { useTraceInvestigationController } from './use-trace-investigation-controller';

vi.mock('../api/explore-investigation-api', () => ({
  loadLogInvestigation: vi.fn(),
  loadTraceInvestigation: vi.fn()
}));
vi.mock('@/shared/time', () => ({ useSharedTimeOptional: () => ({ refreshRevision: 3 }) }));

const loadTrace = vi.mocked(loadTraceInvestigation);
const loadLog = vi.mocked(loadLogInvestigation);
const traceId = '0123456789abcdef0123456789abcdef';
const spanId = '0123456789abcdef';

describe('Explore focused investigation controllers', () => {
  beforeEach(() => {
    loadTrace.mockReset();
    loadLog.mockReset();
  });

  it('queries an exact Trace composite and exposes only parsed ready evidence', async () => {
    loadTrace.mockResolvedValue(traceSnapshot());
    const { result } = renderHook(
      () =>
        useTraceInvestigationController(
          traceQuery(`signal=traces&traceId=${traceId}&spanId=${spanId}&start=1000&end=2000&timeZone=UTC&entityId=7`)
        ),
      { wrapper: wrapper() }
    );

    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(loadTrace).toHaveBeenCalledWith(
      traceId,
      spanId,
      { from: 1_000, to: 2_000, timeZone: 'UTC' },
      expect.any(AbortSignal)
    );
    if (result.current.state.kind === 'ready') {
      expect(result.current.state.perses.gantt).toBeUndefined();
      expect(result.current.state.snapshot.gantt.state).toBe('empty');
    }
  });

  it('does not query incomplete focused anchors and separates invalid from inactive routes', () => {
    const invalid = renderHook(
      () => useTraceInvestigationController(traceQuery(`signal=traces&traceId=${traceId}&start=1000&end=2000`)),
      { wrapper: wrapper() }
    );
    const inactive = renderHook(() => useLogInvestigationController(logQuery('signal=logs&query=timeout')), {
      wrapper: wrapper()
    });

    expect(invalid.result.current.state).toEqual({ kind: 'invalid' });
    expect(inactive.result.current.state).toEqual({ kind: 'inactive' });
    expect(loadTrace).not.toHaveBeenCalled();
    expect(loadLog).not.toHaveBeenCalled();
  });

  it('lets a refetch error win over retained data and keeps contract failure distinct', async () => {
    loadLog.mockResolvedValueOnce(logSnapshot()).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(
      () =>
        useLogInvestigationController(logQuery('signal=logs&logRecordUid=event-7&start=1000&end=2000&timeZone=UTC')),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.state.kind).toBe('unavailable'));

    loadLog.mockRejectedValueOnce(new ExploreInvestigationContractError());
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.state.kind).toBe('contract_error'));
  });

  it('aborts the previous owner when the exact Trace scope changes', async () => {
    const observedSignals: AbortSignal[] = [];
    loadTrace.mockImplementation((_traceId, _spanId, _window, signal) => {
      if (signal) observedSignals.push(signal);
      return new Promise(() => undefined);
    });
    const { rerender } = renderHook(
      ({ trace }) =>
        useTraceInvestigationController(
          traceQuery(`signal=traces&traceId=${trace}&start=1000&end=2000&timeZone=UTC&entityId=7`)
        ),
      { initialProps: { trace: traceId }, wrapper: wrapper() }
    );
    await waitFor(() => expect(observedSignals).toHaveLength(1));

    rerender({ trace: 'fedcba9876543210fedcba9876543210' });
    await waitFor(() => expect(observedSignals).toHaveLength(2));
    expect(observedSignals[0]?.aborted).toBe(true);
  });
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function traceQuery(search: string) {
  const query = parseExploreQuery(new URLSearchParams(search));
  if (query.signal !== 'traces') throw new Error('Trace query expected');
  return query;
}

function logQuery(search: string) {
  const query = parseExploreQuery(new URLSearchParams(search));
  if (query.signal !== 'logs') throw new Error('Log query expected');
  return query;
}

function traceSnapshot() {
  return {
    traceId,
    selectedSpanId: spanId,
    window: { start: 1_000, end: 2_000 },
    gantt: { state: 'empty' as const, reason: 'no_data' as const, source: 'greptime_traces' as const, detail: null },
    sameTraceLogs: {
      state: 'empty' as const,
      reason: 'no_data' as const,
      source: 'greptime_logs' as const,
      truncated: false,
      logs: []
    },
    red: {
      state: 'unavailable' as const,
      reason: 'identity_unavailable' as const,
      source: 'greptime_flow' as const,
      resolutionSeconds: 60 as const,
      identity: null,
      summary: null,
      series: []
    },
    metrics: {
      state: 'unavailable' as const,
      reason: 'query_strategy_unavailable' as const,
      source: 'otlp_metrics' as const,
      truncated: false,
      series: []
    },
    dependencies: {
      state: 'empty' as const,
      reason: 'no_data' as const,
      source: 'greptime_traces' as const,
      truncated: false,
      edges: []
    }
  };
}

function logSnapshot() {
  return {
    logRecordUid: 'event-7',
    window: { start: 1_000, end: 2_000 },
    selectedLog: { state: 'empty' as const, reason: 'not_found' as const, source: 'greptime_logs' as const, log: null },
    trace: {
      state: 'empty' as const,
      reason: 'not_correlated' as const,
      source: 'greptime_traces' as const,
      detail: null
    },
    metrics: {
      state: 'unavailable' as const,
      reason: 'query_strategy_unavailable' as const,
      source: 'otlp_metrics' as const,
      truncated: false,
      series: []
    },
    nearbyLogs: {
      state: 'empty' as const,
      reason: 'no_data' as const,
      source: 'greptime_logs' as const,
      hasMoreBefore: false,
      hasMoreAfter: false,
      before: [],
      after: []
    }
  };
}
