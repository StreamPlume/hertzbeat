/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type {
  HertzBeatLogQueryOutcome,
  HertzBeatLogTableQuery,
  HertzBeatMetricQuery,
  HertzBeatMetricQueryOutcome,
  HertzBeatTraceTableQuery,
  HertzBeatTraceTableQueryOutcome
} from '@/platform/perses';
import type { ExactTimeWindow } from '@/shared/query-context';

import { exploreEvidenceScopeKey } from './explore-model';
import type { ExploreQuery, LogExploreQuery, MetricExploreQuery, TraceExploreQuery } from './explore-query';
import {
  ExploreSignalContractError,
  type ExplorePageResult,
  type LogOverview,
  type LogRow,
  type LogTrend,
  type MetricConsole,
  type TraceRow
} from './explore-signal-contract';
import { metricSeries } from './explore-signal-model';

type Result<Query, Outcome> = { query: Query; outcome: Outcome; runtimeIdentity: string };
type ReadyMetric = Extract<HertzBeatMetricQueryOutcome, { state: 'ready' }>;
type ReadyLogs = Extract<HertzBeatLogQueryOutcome, { state: 'ready' }>;
type ReadyTraces = Extract<HertzBeatTraceTableQueryOutcome, { state: 'ready' }>;

export function createExploreMetricPersesResult(
  query: MetricExploreQuery,
  console: MetricConsole,
  timeWindow: ExactTimeWindow,
  revision: number,
  readySeries = metricSeries(console)
): Result<HertzBeatMetricQuery, ReadyMetric> {
  const series = readySeries.map(item => ({ ...item, points: strictMetricPoints(item.points) }));
  if (series.length === 0) throw new ExploreSignalContractError();
  requireMetricWindow(console, timeWindow);
  return {
    query: {
      signal: 'metrics',
      queryKind: 'time-series',
      timeWindow,
      metric: { name: 'hertzbeat_explore_snapshot' },
      limit: series.length
    },
    outcome: {
      state: 'ready',
      truncated: false,
      data: { timeWindow, source: console.datasource, series }
    },
    runtimeIdentity: evidenceIdentity(query, timeWindow, revision)
  };
}

function requireMetricWindow(console: MetricConsole, window: ExactTimeWindow) {
  if (console.context && (console.context.start !== window.from || console.context.end !== window.to)) {
    throw new ExploreSignalContractError();
  }
}

export function createExploreLogPersesResult(
  query: LogExploreQuery,
  page: ExplorePageResult<LogRow>,
  timeWindow: ExactTimeWindow,
  revision: number
): Result<HertzBeatLogTableQuery, ReadyLogs> {
  return {
    query: { signal: 'logs', queryKind: 'table', timeWindow, limit: page.size },
    outcome: {
      state: 'ready',
      truncated: page.totalElements > page.content.length,
      data: { rows: page.content, total: page.totalElements }
    },
    runtimeIdentity: evidenceIdentity(query, timeWindow, revision)
  };
}

export function createExploreTracePersesResult(
  query: TraceExploreQuery,
  page: ExplorePageResult<TraceRow>,
  timeWindow: ExactTimeWindow,
  revision: number
): Result<HertzBeatTraceTableQuery, ReadyTraces> {
  requireCompleteTraceRows(page.content);
  return {
    query: { signal: 'traces', queryKind: 'table', timeWindow, limit: page.size },
    outcome: {
      state: 'ready',
      truncated: page.totalElements > page.content.length,
      data: { rows: page.content, total: page.totalElements }
    },
    runtimeIdentity: evidenceIdentity(query, timeWindow, revision)
  };
}

export function createLogTrendPersesResult(
  trend: LogTrend,
  timeWindow: ExactTimeWindow,
  runtimeIdentity: string
): Result<HertzBeatMetricQuery, ReadyMetric> {
  const points = trend.buckets.map(bucket => ({ timestamp: bucket.start, value: bucket.count }));
  return {
    query: {
      signal: 'metrics',
      queryKind: 'time-series',
      timeWindow,
      metric: { name: 'hertzbeat_log_count' },
      limit: 1
    },
    outcome: {
      state: 'ready',
      truncated: false,
      data: {
        timeWindow,
        source: 'greptime_logs',
        series: [{ key: 'log-count', name: 'hertzbeat_log_count', labels: {}, points }]
      }
    },
    runtimeIdentity: `${runtimeIdentity}:trend`
  };
}

export function exploreOverviewRows(overview: LogOverview) {
  return [
    ['total', overview.totalCount],
    ['trace', overview.traceCount],
    ['debug', overview.debugCount],
    ['info', overview.infoCount],
    ['warn', overview.warnCount],
    ['error', overview.errorCount],
    ['fatal', overview.fatalCount]
  ] as const;
}

function evidenceIdentity(query: ExploreQuery, window: ExactTimeWindow, revision: number) {
  return JSON.stringify({ scope: exploreEvidenceScopeKey(query), window, revision });
}

function strictMetricPoints(points: unknown[][]) {
  return points.map(point => {
    if (!Array.isArray(point) || point.length < 2) throw new ExploreSignalContractError();
    const timestamp = strictFiniteNumber(point[0]);
    const value = strictFiniteNumber(point[1]);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new ExploreSignalContractError();
    return { timestamp, value };
  });
}

function strictFiniteNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) throw new ExploreSignalContractError();
  return parsed;
}

type CompleteTraceRow = TraceRow & {
  durationNanos: number;
  startTime: number;
  serviceName: string;
  rootSpanName: string;
  spanCount: number;
  serviceStats: Record<string, { spanCount: number; errorCount: number }>;
};

function requireCompleteTraceRows(rows: TraceRow[]): asserts rows is CompleteTraceRow[] {
  for (const row of rows) {
    if (!isCompleteTraceRow(row) || !hasConsistentTraceStats(row)) throw new ExploreSignalContractError();
  }
}

function isCompleteTraceRow(row: TraceRow): row is CompleteTraceRow {
  return (
    /^[0-9a-f]{32}$/u.test(row.traceId) &&
    hasText(row.serviceName) &&
    hasText(row.rootSpanName) &&
    isPositiveSafeInteger(row.startTime) &&
    isNonNegativeSafeInteger(row.durationNanos) &&
    isPositiveSafeInteger(row.spanCount) &&
    row.serviceStats != null
  );
}

function hasConsistentTraceStats(row: CompleteTraceRow) {
  const stats = Object.values(row.serviceStats);
  const spanCount = stats.reduce((total, item) => total + item.spanCount, 0);
  const errorCount = stats.reduce((total, item) => total + item.errorCount, 0);
  return (
    isNonNegativeSafeInteger(spanCount) &&
    isNonNegativeSafeInteger(errorCount) &&
    spanCount === row.spanCount &&
    errorCount === row.errorSpanCount
  );
}

function hasText(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveSafeInteger(value: number | null): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
