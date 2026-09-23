/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';

import type { LogInvestigationViewState, TraceInvestigationViewState } from '../model/explore-investigation-contract';
import { ExploreLogInvestigationView } from './explore-log-investigation-view';
import { ExploreTraceInvestigationView } from './explore-trace-investigation-view';

const runtime = vi.hoisted(() => ({ gantt: vi.fn(), logs: vi.fn(), metric: vi.fn() }));
type ReadyTrace = Extract<TraceInvestigationViewState, { kind: 'ready' }>;
type ReadyLog = Extract<LogInvestigationViewState, { kind: 'ready' }>;

vi.mock('@/platform/perses', async importOriginal => ({
  ...(await importOriginal<typeof import('@/platform/perses')>()),
  HertzBeatTracingGanttChartResult: (props: { ariaLabel: string }) => {
    runtime.gantt(props);
    return <div data-testid="perses-gantt">{props.ariaLabel}</div>;
  },
  HertzBeatLogsTableResult: (props: { ariaLabel: string }) => {
    runtime.logs(props);
    return <div data-testid="perses-logs">{props.ariaLabel}</div>;
  },
  HertzBeatMetricTimeSeriesResult: (props: { ariaLabel: string }) => {
    runtime.metric(props);
    return <div data-testid="perses-metric">{props.ariaLabel}</div>;
  }
}));

describe('focused Explore investigation presentation', () => {
  beforeAll(async () => {
    await initializeI18n();
    await loadLocale('en-US');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps Trace, Logs, Metrics, and Topology as separate ready sections without the legacy waterfall', () => {
    renderTrace(traceReady());

    expect(screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.traces') })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: i18n.t('exploreInvestigation.title') })).toHaveAttribute(
      'data-explore-investigation',
      'true'
    );
    expect(screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.logs') })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.metrics') })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.topology') })).toBeInTheDocument();
    expect(screen.getByTestId('perses-gantt')).toBeInTheDocument();
    expect(screen.getByText('3.00 s')).toBeInTheDocument();
    expect(screen.getByTestId('perses-logs')).toBeInTheDocument();
    expect(screen.getByTestId('perses-metric')).toBeInTheDocument();
    expect(document.querySelector('[data-timing]')).toBeNull();
  });

  it('renders empty and unavailable Trace blocks compactly without creating Perses canvases', () => {
    const ready = traceReady();
    renderTrace({
      ...ready,
      snapshot: {
        ...ready.snapshot,
        sameTraceLogs: { ...ready.snapshot.sameTraceLogs, state: 'empty', reason: 'no_data', logs: [] },
        red: { ...ready.snapshot.red, state: 'empty', reason: 'no_data', summary: null, series: [] },
        metrics: { ...ready.snapshot.metrics, state: 'unavailable', reason: 'storage_unavailable', series: [] },
        dependencies: {
          ...ready.snapshot.dependencies,
          state: 'unavailable',
          reason: 'query_strategy_unavailable',
          edges: []
        }
      },
      perses: { gantt: ready.perses.gantt, metrics: [] }
    });

    expect(screen.getAllByText(i18n.t('exploreInvestigation.states.empty')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(i18n.t('exploreInvestigation.states.unavailable')).length).toBeGreaterThan(0);
    expect(runtime.logs).not.toHaveBeenCalled();
    expect(runtime.metric).not.toHaveBeenCalled();
  });

  it('keeps selected Log and nearby Logs together while using the controller callback for Trace focus', () => {
    const focusTrace = vi.fn();
    const openTopology = vi.fn();
    renderLog(logReady(), { onFocusTrace: focusTrace, onOpenTopology: openTopology });

    expect(screen.getByRole('region', { name: i18n.t('exploreInvestigation.title') })).toHaveAttribute(
      'data-explore-investigation',
      'true'
    );
    expect(
      screen.getByRole('complementary', { name: i18n.t('exploreInvestigation.sections.selectedLog') })
    ).toHaveTextContent('payment timeout');
    expect(screen.getByText(i18n.t('exploreInvestigation.logs.anchor'))).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.nearbyLogs') })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.topology') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('exploreInvestigation.actions.focusTrace') }));
    expect(focusTrace).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('exploreInvestigation.actions.openTopology') }));
    expect(openTopology).toHaveBeenCalledOnce();
  });

  it('keeps Log Topology visible but honestly unavailable without a safe authoritative identity', () => {
    renderLog(logReady(), { onOpenTopology: undefined });

    const topology = screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.topology') });
    expect(topology).toHaveTextContent(i18n.t('exploreInvestigation.states.unavailable'));
    expect(screen.queryByRole('button', { name: i18n.t('exploreInvestigation.actions.openTopology') })).toBeNull();
  });

  it('does not mount or hand off to Trace when the selected Log has no trace context', () => {
    const focusTrace = vi.fn();
    const ready = logReady();
    renderLog(
      {
        ...ready,
        snapshot: {
          ...ready.snapshot,
          trace: {
            ...ready.snapshot.trace,
            state: 'empty',
            reason: 'not_correlated',
            detail: null
          }
        },
        perses: { ...ready.perses, gantt: undefined }
      },
      { onFocusTrace: focusTrace }
    );

    expect(screen.getByText(i18n.t('exploreInvestigation.states.noTraceContext'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('exploreInvestigation.actions.focusTrace') })).toBeNull();
    expect(runtime.gantt).not.toHaveBeenCalled();
    expect(focusTrace).not.toHaveBeenCalled();
  });

  it('keeps route-only back navigation enabled while retained evidence is stale', () => {
    renderTrace(traceReady(), { evidenceCurrent: false });

    expect(screen.getByRole('button', { name: i18n.t('exploreInvestigation.actions.backToResults') })).toBeEnabled();
  });

  it('keeps manual refresh beside Back in the exact-window context band', () => {
    const refresh = vi.fn();
    renderTrace(traceReady(), { onRefresh: refresh });

    const refreshButton = screen.getByRole('button', { name: i18n.t('common.refresh') });
    const context = refreshButton.closest('header');
    expect(context).not.toBeNull();
    fireEvent.click(refreshButton);
    expect(refresh).toHaveBeenCalledOnce();
    expect(
      within(context as HTMLElement).getByRole('button', {
        name: i18n.t('exploreInvestigation.actions.backToResults')
      })
    ).toBeInTheDocument();
  });

  it('renders facts as one semantic list inside the outer signal surface', () => {
    renderTrace(traceReady());

    const traces = screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.traces') });
    expect(within(traces).getAllByRole('term').length).toBeGreaterThan(0);
    expect(within(traces).getAllByRole('definition').length).toBeGreaterThan(0);
  });

  it('does not let ready RED evidence mask unavailable service metrics', () => {
    const ready = traceReady();
    renderTrace({
      ...ready,
      snapshot: {
        ...ready.snapshot,
        metrics: { ...ready.snapshot.metrics, state: 'unavailable', reason: 'storage_unavailable', series: [] }
      },
      perses: { ...ready.perses, metrics: [] }
    });

    const metrics = screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.metrics') });
    expect(
      within(metrics).getByRole('region', { name: i18n.t('exploreInvestigation.metrics.red') })
    ).toBeInTheDocument();
    expect(
      within(metrics).getByRole('region', { name: i18n.t('exploreInvestigation.metrics.service') })
    ).toHaveTextContent(i18n.t('exploreInvestigation.states.unavailable'));
  });

  it('disables focused handoffs while retained evidence is stale', () => {
    renderTrace(traceReady(), { evidenceCurrent: false });
    expect(screen.getByRole('button', { name: i18n.t('exploreInvestigation.actions.openLogs') })).toBeDisabled();
    expect(screen.getByRole('button', { name: i18n.t('exploreInvestigation.actions.openMetrics') })).toBeDisabled();
    expect(screen.getByRole('button', { name: i18n.t('exploreInvestigation.actions.openTopology') })).toBeDisabled();
  });

  it('does not offer a generic Topology handoff without a safe authoritative route', () => {
    renderTrace(traceReady(), { onOpenTopology: undefined });

    expect(screen.queryByRole('button', { name: i18n.t('exploreInvestigation.actions.openTopology') })).toBeNull();
  });

  it('allows a safe Trace Topology handoff when exact-trace dependencies are empty', () => {
    const ready = traceReady();
    const openTopology = vi.fn();
    renderTrace(
      {
        ...ready,
        snapshot: {
          ...ready.snapshot,
          dependencies: { ...ready.snapshot.dependencies, state: 'empty', reason: 'no_data', edges: [] }
        }
      },
      { onOpenTopology: openTopology }
    );

    const topology = screen.getByRole('region', { name: i18n.t('exploreInvestigation.sections.topology') });
    expect(topology).toHaveTextContent(i18n.t('exploreInvestigation.states.empty'));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('exploreInvestigation.actions.openTopology') }));
    expect(openTopology).toHaveBeenCalledOnce();
  });
});

function renderTrace(
  state: ReadyTrace,
  overrides: Partial<React.ComponentProps<typeof ExploreTraceInvestigationView>> = {}
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ExploreTraceInvestigationView
        state={state}
        evidenceCurrent
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        onSelectSpan={vi.fn()}
        onOpenLogs={vi.fn()}
        onOpenMetrics={vi.fn()}
        onOpenTopology={vi.fn()}
        {...overrides}
      />
    </I18nextProvider>
  );
}

function renderLog(state: ReadyLog, overrides: Partial<React.ComponentProps<typeof ExploreLogInvestigationView>> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ExploreLogInvestigationView
        state={state}
        evidenceCurrent
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        onFocusTrace={vi.fn()}
        onOpenMetrics={vi.fn()}
        onOpenTopology={vi.fn()}
        {...overrides}
      />
    </I18nextProvider>
  );
}

function traceReady(): ReadyTrace {
  return {
    kind: 'ready',
    route: {
      kind: 'trace',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      window: { from: 1_750_000_000_000, to: 1_750_000_060_000, timeZone: 'UTC' }
    },
    snapshot: {
      traceId: '0123456789abcdef0123456789abcdef',
      selectedSpanId: '0123456789abcdef',
      window: { start: 1_750_000_000_000, end: 1_750_000_060_000 },
      gantt: { ...observed('greptime_traces'), detail: investigationTraceDetail() },
      sameTraceLogs: { ...observed('greptime_logs'), truncated: false, logs: [investigationLog('nearby retry')] },
      red: {
        ...observed('greptime_flow'),
        resolutionSeconds: 60,
        identity: serviceIdentity(),
        summary: {
          requestCount: 12,
          errorCount: 3,
          requestRatePerSecond: 2,
          errorRate: 0.25,
          latencyAverageMs: 230,
          latencyP95Ms: 420
        },
        series: []
      },
      metrics: { ...observed('otlp_metrics'), truncated: false, series: [] },
      dependencies: {
        ...observed('greptime_traces'),
        truncated: false,
        edges: [
          {
            sourceServiceName: 'checkout',
            targetServiceName: 'mysql',
            sourceEntityId: '10',
            targetEntityId: '20',
            spanId: '0123456789abcdef',
            status: 'ERROR',
            durationMillis: 420
          }
        ]
      }
    },
    perses: {
      gantt: { query: ganttQuery(), outcome: ganttOutcome() },
      logs: { query: logsQuery(), outcome: logsOutcome() },
      metrics: [{ query: metricQuery(), outcome: metricOutcome() }]
    }
  };
}

function logReady(): ReadyLog {
  return {
    kind: 'ready',
    route: {
      kind: 'log',
      logRecordUid: 'log-1',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      window: { from: 1_750_000_000_000, to: 1_750_000_060_000, timeZone: 'UTC' }
    },
    snapshot: {
      logRecordUid: 'log-1',
      window: { start: 1_750_000_000_000, end: 1_750_000_060_000 },
      selectedLog: { ...observed('greptime_logs'), log: investigationLog('payment timeout') },
      trace: { ...observed('greptime_traces'), detail: investigationTraceDetail() },
      metrics: { ...observed('otlp_metrics'), truncated: false, series: [] },
      nearbyLogs: {
        ...observed('greptime_logs'),
        hasMoreBefore: false,
        hasMoreAfter: false,
        before: [],
        after: [investigationLog('nearby retry')]
      }
    },
    perses: {
      gantt: { query: ganttQuery(), outcome: ganttOutcome() },
      logs: { query: logsQuery(), outcome: logsOutcome() },
      metrics: [{ query: metricQuery(), outcome: metricOutcome() }]
    }
  };
}

function observed(source: 'greptime_traces' | 'greptime_logs' | 'greptime_flow' | 'otlp_metrics') {
  return { state: 'ready' as const, reason: 'observed' as const, source };
}

function serviceIdentity() {
  return {
    workspaceId: 'default',
    entityId: '10',
    entityType: 'service',
    serviceName: 'checkout',
    serviceNamespace: 'shop',
    deploymentEnvironment: 'production'
  };
}

function investigationLog(body: string) {
  return {
    logRecordUid: 'log-1',
    timeUnixNano: '1750000000000000000',
    observedTimeUnixNano: null,
    severityNumber: 17,
    severityText: 'ERROR',
    body,
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    identity: serviceIdentity(),
    attributes: { 'retry.count': '2' },
    resourceAttributes: { 'service.name': 'checkout' }
  };
}

function investigationTraceDetail() {
  return {
    rootSpanId: '0123456789abcdef',
    serviceName: 'checkout',
    serviceNamespace: 'shop',
    deploymentEnvironment: 'production',
    entityId: '10',
    entityType: 'service',
    rootSpanName: 'POST /checkout',
    durationNanos: '3000000000',
    status: 'ERROR',
    startTime: 1_750_000_000_000,
    errorSpanCount: 1,
    resourceAttributes: { 'service.name': 'checkout' },
    spans: [
      {
        spanId: '0123456789abcdef',
        parentSpanId: null,
        spanName: 'POST /checkout',
        serviceName: 'checkout',
        serviceNamespace: 'shop',
        deploymentEnvironment: 'production',
        entityId: '10',
        entityType: 'service',
        status: 'ERROR',
        statusMessage: null,
        spanKind: 'server',
        traceState: null,
        scopeName: null,
        scopeVersion: null,
        durationNanos: '3000000000',
        startTime: 1_750_000_000_000,
        highlighted: true,
        resourceAttributes: { 'service.name': 'checkout' },
        spanAttributes: { 'http.status_code': '504' },
        events: [],
        links: [],
        codeNavigationHint: null
      }
    ]
  };
}

function ganttQuery() {
  return {
    signal: 'traces' as const,
    queryKind: 'gantt' as const,
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    timeWindow: { from: 1_750_000_000_000, to: 1_750_000_060_000 }
  };
}

function ganttOutcome() {
  return {
    state: 'ready' as const,
    truncated: false as const,
    data: {
      traceId: '0123456789abcdef0123456789abcdef',
      rootSpanId: '0123456789abcdef',
      rootSpanName: 'POST /checkout',
      serviceName: 'checkout',
      serviceNamespace: null,
      startTime: 1_750_000_000_000,
      durationNanos: '3000000000',
      errorSpanCount: 1,
      status: 'ERROR',
      resourceAttributes: {},
      spans: [traceSpan()]
    }
  };
}

function logsQuery() {
  return {
    signal: 'logs' as const,
    queryKind: 'table' as const,
    traceId: '0123456789abcdef0123456789abcdef',
    timeWindow: { from: 1_750_000_000_000, to: 1_750_000_060_000 }
  };
}

function logsOutcome() {
  return {
    state: 'ready' as const,
    truncated: false as const,
    data: { rows: [persesLogRow('nearby retry')], total: 1 }
  };
}

function metricQuery() {
  return {
    signal: 'metrics' as const,
    queryKind: 'time-series' as const,
    timeWindow: { from: 1_750_000_000_000, to: 1_750_000_060_000 },
    metric: { name: 'process_cpu_seconds_total' }
  };
}

function metricOutcome() {
  return {
    state: 'ready' as const,
    truncated: false as const,
    data: {
      timeWindow: { from: 1_750_000_000_000, to: 1_750_000_060_000 },
      source: 'greptime',
      series: [{ key: 'cpu', name: 'cpu', labels: {}, points: [{ timestamp: 1_750_000_000_000, value: 0.5 }] }]
    }
  };
}

function persesLogRow(body: string) {
  return {
    logRecordUid: 'log-1',
    timeUnixNano: '1750000000000000000',
    observedTimeUnixNano: null,
    severityNumber: 17,
    severityText: 'ERROR',
    body,
    attributes: { 'retry.count': 2 },
    droppedAttributesCount: null,
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    traceFlags: 1,
    resource: { 'service.name': 'checkout' },
    resourceSchemaUrl: null,
    instrumentationScope: null,
    scopeSchemaUrl: null
  };
}

function traceSpan() {
  return {
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    parentSpanId: null,
    spanName: 'POST /checkout',
    serviceName: 'checkout',
    status: 'error',
    spanKind: 'server',
    statusMessage: null,
    traceState: null,
    scopeName: null,
    scopeVersion: null,
    durationNanos: '3000000000',
    startTime: 1_750_000_000_000,
    highlighted: true,
    resourceAttributes: { 'service.name': 'checkout' },
    spanAttributes: { 'http.status_code': '504' },
    events: [],
    links: [],
    codeNavigationHint: null
  };
}
