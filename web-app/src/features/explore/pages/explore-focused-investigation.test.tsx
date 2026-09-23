/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';

import type { LogInvestigationViewState, TraceInvestigationViewState } from '../model/explore-investigation-contract';
import { ExploreFocusedLogPage, ExploreFocusedTracePage } from './explore-focused-investigation';

const controllers = vi.hoisted(() => ({ trace: vi.fn(), log: vi.fn() }));

vi.mock('../controller/use-trace-investigation-controller', () => ({
  useTraceInvestigationController: controllers.trace
}));
vi.mock('../controller/use-log-investigation-controller', () => ({
  useLogInvestigationController: controllers.log
}));
vi.mock('../components/explore-trace-investigation-view', () => ({
  ExploreTraceInvestigationView: (props: {
    onBack: () => void;
    onRefresh: () => void;
    onSelectSpan: (spanId: string) => void;
    onOpenLogs: () => void;
    onOpenMetrics?: (() => void) | undefined;
    onOpenTopology?: (() => void) | undefined;
  }) => (
    <div>
      <button onClick={props.onBack}>trace-back</button>
      <button onClick={props.onRefresh}>trace-refresh</button>
      <button onClick={() => props.onSelectSpan('fedcba9876543210')}>select-span</button>
      <button onClick={props.onOpenLogs}>trace-logs</button>
      {props.onOpenMetrics ? <button onClick={props.onOpenMetrics}>trace-metrics</button> : null}
      {props.onOpenTopology ? <button onClick={props.onOpenTopology}>trace-topology</button> : null}
    </div>
  )
}));
vi.mock('../components/explore-log-investigation-view', () => ({
  ExploreLogInvestigationView: (props: {
    onBack: () => void;
    onRefresh: () => void;
    onFocusTrace: () => void;
    onOpenTopology?: (() => void) | undefined;
  }) => (
    <div>
      <button onClick={props.onBack}>log-back</button>
      <button onClick={props.onRefresh}>log-refresh</button>
      <button onClick={props.onFocusTrace}>log-trace</button>
      {props.onOpenTopology ? <button onClick={props.onOpenTopology}>log-topology</button> : null}
    </div>
  )
}));

describe('Explore focused investigation page wiring', () => {
  beforeAll(async () => {
    await initializeI18n();
    await loadLocale('en-US');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses route builders for Trace actions and returns without focused identities', () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    controllers.trace.mockReturnValue({ state: traceReady(), refetch });
    const openPath = vi.fn();
    renderSubject(
      <ExploreFocusedTracePage
        query={traceQuery()}
        t={i18n.t}
        updateQuery={vi.fn()}
        time={undefined}
        openPath={openPath}
      />
    );

    fireEvent.click(screen.getByText('select-span'));
    expect(pathParams(lastPath(openPath))).toMatchObject({
      signal: 'traces',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: 'fedcba9876543210'
    });
    fireEvent.click(screen.getByText('trace-logs'));
    expect(pathParams(lastPath(openPath))).toMatchObject({
      signal: 'logs',
      traceId: '0123456789abcdef0123456789abcdef'
    });
    fireEvent.click(screen.getByText('trace-metrics'));
    expect(pathParams(lastPath(openPath))).toMatchObject({ signal: 'metrics' });
    fireEvent.click(screen.getByText('trace-topology'));
    expect(pathParams(lastPath(openPath))).toMatchObject({
      focusEntityId: '10',
      environment: 'production',
      sourceKind: 'otel',
      start: '1750000000000',
      end: '1750000060000'
    });
    fireEvent.click(screen.getByText('trace-back'));
    expect(pathParams(lastPath(openPath))).not.toHaveProperty('traceId');
    expect(pathParams(lastPath(openPath))).not.toHaveProperty('spanId');
    fireEvent.click(screen.getByText('trace-refresh'));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('hands a selected Log to its exact Trace and clears the Log anchor on return', () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    controllers.log.mockReturnValue({ state: logReady(), refetch });
    const openPath = vi.fn();
    renderSubject(
      <ExploreFocusedLogPage query={logQuery()} t={i18n.t} updateQuery={vi.fn()} time={undefined} openPath={openPath} />
    );

    fireEvent.click(screen.getByText('log-trace'));
    expect(pathParams(lastPath(openPath))).toMatchObject({
      signal: 'traces',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef'
    });
    expect(pathParams(lastPath(openPath))).not.toHaveProperty('logRecordUid');
    fireEvent.click(screen.getByText('log-topology'));
    expect(pathParams(lastPath(openPath))).toMatchObject({
      focusEntityId: '10',
      environment: 'production',
      sourceKind: 'otel',
      start: '1750000000000',
      end: '1750000060000'
    });
    fireEvent.click(screen.getByText('log-back'));
    expect(pathParams(lastPath(openPath))).not.toHaveProperty('logRecordUid');
    fireEvent.click(screen.getByText('log-refresh'));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not offer Log Topology navigation from a trace fallback identity', () => {
    const ready = logReady();
    controllers.log.mockReturnValue({
      state: {
        ...ready,
        snapshot: {
          ...ready.snapshot,
          selectedLog: {
            ...ready.snapshot.selectedLog,
            log: ready.snapshot.selectedLog.log
              ? { ...ready.snapshot.selectedLog.log, identity: null }
              : ready.snapshot.selectedLog.log
          },
          trace: {
            state: 'ready',
            reason: 'observed',
            source: 'greptime_traces',
            detail: traceDetail(identity())
          }
        }
      },
      refetch: vi.fn().mockResolvedValue(undefined)
    });
    renderSubject(
      <ExploreFocusedLogPage query={logQuery()} t={i18n.t} updateQuery={vi.fn()} time={undefined} openPath={vi.fn()} />
    );

    expect(screen.queryByText('log-topology')).toBeNull();
  });
});

function renderSubject(subject: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{subject}</I18nextProvider>);
}

function traceQuery() {
  return {
    signal: 'traces' as const,
    timeRange: 'last-30m' as const,
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    start: 1_750_000_000_000,
    end: 1_750_000_060_000,
    timeZone: 'UTC'
  };
}

function logQuery() {
  return {
    signal: 'logs' as const,
    timeRange: 'last-30m' as const,
    logRecordUid: 'log-1',
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    start: 1_750_000_000_000,
    end: 1_750_000_060_000,
    timeZone: 'UTC'
  };
}

function traceReady(): Extract<TraceInvestigationViewState, { kind: 'ready' }> {
  return {
    kind: 'ready',
    route: { kind: 'trace', traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef', window: window() },
    snapshot: {
      traceId: '0123456789abcdef0123456789abcdef',
      selectedSpanId: '0123456789abcdef',
      window: { start: window().from, end: window().to },
      gantt: { ...unavailable('greptime_traces'), detail: null },
      sameTraceLogs: { ...unavailable('greptime_logs'), truncated: false, logs: [] },
      red: {
        state: 'ready',
        reason: 'observed',
        source: 'greptime_flow',
        resolutionSeconds: 60,
        identity: identity(),
        summary: null,
        series: []
      },
      metrics: { ...unavailable('otlp_metrics'), truncated: false, series: [] },
      dependencies: { ...unavailable('greptime_traces'), truncated: false, edges: [] }
    },
    perses: { metrics: [] }
  };
}

function logReady(): Extract<LogInvestigationViewState, { kind: 'ready' }> {
  return {
    kind: 'ready',
    route: {
      kind: 'log',
      logRecordUid: 'log-1',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      window: window()
    },
    snapshot: {
      logRecordUid: 'log-1',
      window: { start: window().from, end: window().to },
      selectedLog: {
        state: 'ready',
        reason: 'observed',
        source: 'greptime_logs',
        log: {
          logRecordUid: 'log-1',
          timeUnixNano: '1750000000000000000',
          observedTimeUnixNano: null,
          severityNumber: 17,
          severityText: 'ERROR',
          body: 'payment timeout',
          traceId: '0123456789abcdef0123456789abcdef',
          spanId: '0123456789abcdef',
          identity: identity(),
          attributes: {},
          resourceAttributes: {}
        }
      },
      trace: { ...unavailable('greptime_traces'), detail: null },
      metrics: { ...unavailable('otlp_metrics'), truncated: false, series: [] },
      nearbyLogs: { ...unavailable('greptime_logs'), hasMoreBefore: false, hasMoreAfter: false, before: [], after: [] }
    },
    perses: { metrics: [] }
  };
}

function unavailable(source: 'greptime_traces' | 'greptime_logs' | 'greptime_flow' | 'otlp_metrics') {
  return { state: 'unavailable' as const, reason: 'storage_unavailable' as const, source };
}

function identity() {
  return {
    workspaceId: 'default',
    entityId: '10',
    entityType: 'service',
    serviceName: 'checkout',
    serviceNamespace: 'shop',
    deploymentEnvironment: 'production'
  };
}

function window() {
  return { from: 1_750_000_000_000, to: 1_750_000_060_000, timeZone: 'UTC' };
}

function traceDetail(serviceIdentity: ReturnType<typeof identity>) {
  return {
    rootSpanId: '0123456789abcdef',
    serviceName: serviceIdentity.serviceName,
    serviceNamespace: serviceIdentity.serviceNamespace,
    deploymentEnvironment: serviceIdentity.deploymentEnvironment,
    entityId: serviceIdentity.entityId,
    entityType: serviceIdentity.entityType,
    rootSpanName: 'POST /checkout',
    durationNanos: '1000000',
    status: 'OK',
    startTime: window().from,
    errorSpanCount: 0,
    resourceAttributes: {},
    spans: []
  };
}

function lastPath(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.at(-1)?.[0] as string;
}

function pathParams(path: string) {
  const params = new URL(path, 'http://localhost').searchParams;
  return Object.fromEntries(params.entries());
}
