/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Domain query contract shared by URL state and transport adapters.
export type ExploreSignal = 'metrics' | 'logs' | 'traces';

export type ExploreTimeRange = 'last-15m' | 'last-30m' | 'last-1h' | 'last-6h' | 'last-24h';
export type MetricTemporalAggregation = 'raw' | 'rate' | 'increase' | 'delta';
export type TraceSpanScope = 'root' | 'entrypoint';

type SharedExploreQuery = {
  timeRange: ExploreTimeRange;
  entityId?: string | undefined;
  monitorId?: string | undefined;
  serviceName?: string | undefined;
  serviceNamespace?: string | undefined;
  environment?: string | undefined;
  intakeProfileId?: string | undefined;
  collectorId?: string | undefined;
  instance?: string | undefined;
  endpoint?: string | undefined;
  query?: string | undefined;
  windowMode?: 'preset' | undefined;
  autoRefreshMs?: number | undefined;
  start?: number | undefined;
  end?: number | undefined;
  timeZone?: string | undefined;
};

export type MetricExploreQuery = SharedExploreQuery & {
  signal: 'metrics';
  operationName?: string | undefined;
  metricFilter?: string | undefined;
  groupBy?: string | undefined;
  aggregation?: string | undefined;
  temporalAggregation?: MetricTemporalAggregation | undefined;
  step?: string | undefined;
};

export type LogExploreQuery = SharedExploreQuery & {
  signal: 'logs';
  logRecordUid?: string | undefined;
  live?: boolean | undefined;
  severityText?: string | undefined;
  traceId?: string | undefined;
  spanId?: string | undefined;
  resourceFilter?: string | undefined;
  attributeFilter?: string | undefined;
  hideInternal?: boolean | undefined;
  hideNoise?: boolean | undefined;
  pageIndex?: number | undefined;
};

export type TraceExploreQuery = SharedExploreQuery & {
  signal: 'traces';
  traceId?: string | undefined;
  spanId?: string | undefined;
  errorOnly?: boolean | undefined;
  resourceFilter?: string | undefined;
  attributeFilter?: string | undefined;
  spanScope?: TraceSpanScope | undefined;
  hideInternal?: boolean | undefined;
  minDurationMs?: number | undefined;
  maxDurationMs?: number | undefined;
  pageIndex?: number | undefined;
};

export type ExploreQuery = MetricExploreQuery | LogExploreQuery | TraceExploreQuery;

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/u;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/u;

export type ExploreQueryPatch = {
  signal?: ExploreSignal | undefined;
  timeRange?: ExploreTimeRange | undefined;
  entityId?: string | undefined;
  monitorId?: string | undefined;
  serviceName?: string | undefined;
  serviceNamespace?: string | undefined;
  environment?: string | undefined;
  intakeProfileId?: string | undefined;
  collectorId?: string | undefined;
  instance?: string | undefined;
  endpoint?: string | undefined;
  query?: string | undefined;
  windowMode?: 'preset' | undefined;
  autoRefreshMs?: number | undefined;
  start?: number | undefined;
  end?: number | undefined;
  timeZone?: string | undefined;
  traceId?: string | undefined;
  logRecordUid?: string | undefined;
  errorOnly?: boolean | undefined;
  live?: boolean | undefined;
  severityText?: string | undefined;
  spanId?: string | undefined;
  resourceFilter?: string | undefined;
  attributeFilter?: string | undefined;
  operationName?: string | undefined;
  metricFilter?: string | undefined;
  groupBy?: string | undefined;
  aggregation?: string | undefined;
  temporalAggregation?: MetricTemporalAggregation | undefined;
  step?: string | undefined;
  minDurationMs?: number | undefined;
  maxDurationMs?: number | undefined;
  spanScope?: TraceSpanScope | undefined;
  hideInternal?: boolean | undefined;
  hideNoise?: boolean | undefined;
  pageIndex?: number | undefined;
};

export function timeRangeMilliseconds(timeRange: ExploreTimeRange) {
  const minutes: Record<ExploreTimeRange, number> = {
    'last-15m': 15,
    'last-30m': 30,
    'last-1h': 60,
    'last-6h': 360,
    'last-24h': 1440
  };
  return minutes[timeRange] * 60_000;
}

export function exploreHandoffState(query: ExploreQuery): 'none' | 'scoped' | 'invalid' {
  const focused = focusedInvestigationHandoffState(query);
  if (focused) return focused;
  const entityInvestigation = entityInvestigationHandoffState(query);
  if (entityInvestigation) return entityInvestigation;
  const entityOrMonitor = entityOrMonitorHandoffState(query);
  return entityOrMonitor ?? onboardingHandoffState(query);
}

function entityOrMonitorHandoffState(query: ExploreQuery): 'scoped' | 'invalid' | undefined {
  if ([query.entityId, query.monitorId, query.timeZone].some(isPresent)) {
    return [query.entityId, query.monitorId, query.serviceName, query.timeZone].every(isPresent) &&
      validExactWindow(query.start, query.end)
      ? 'scoped'
      : 'invalid';
  }
  return undefined;
}

function onboardingHandoffState(query: ExploreQuery): 'none' | 'scoped' | 'invalid' {
  // Ordinary Explore filters can include a namespace. Only onboarding-owned identity/window markers activate
  // the stricter handoff contract.
  if (![query.intakeProfileId, query.collectorId, query.windowMode].some(isPresent)) {
    return 'none';
  }
  if (
    ![query.serviceName, query.serviceNamespace, query.environment].every(isPresent) ||
    ![query.intakeProfileId, query.collectorId].some(isPresent)
  )
    return 'invalid';
  if (query.windowMode === 'preset') {
    return !isPresent(query.start) && !isPresent(query.end) ? 'scoped' : 'invalid';
  }
  return validExactWindow(query.start, query.end) ? 'scoped' : 'invalid';
}

function focusedInvestigationHandoffState(query: ExploreQuery): 'scoped' | 'invalid' | undefined {
  const selectedLog = query.signal === 'logs' && query.logRecordUid != null;
  const selectedTrace = query.signal === 'traces' && query.traceId != null;
  const hasTimeEvidence = query.start != null || query.end != null || query.timeZone != null;
  if (!selectedLog && !(selectedTrace && hasTimeEvidence)) return undefined;
  if (query.signal === 'logs' && query.live) return 'invalid';
  return validFocusedIdentity(query) && validFocusedWindow(query) ? 'scoped' : 'invalid';
}

function validFocusedIdentity(query: ExploreQuery) {
  if (query.signal === 'logs') {
    return (
      validLogRecordUid(query.logRecordUid) && validOptionalTraceId(query.traceId) && validOptionalSpanId(query.spanId)
    );
  }
  return query.signal === 'traces' && validTraceId(query.traceId) && validOptionalSpanId(query.spanId);
}

function validLogRecordUid(value: string | undefined) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
}

function validOptionalTraceId(value: string | undefined) {
  return value == null || validTraceId(value);
}

function validOptionalSpanId(value: string | undefined) {
  return value == null || (typeof value === 'string' && SPAN_ID_PATTERN.test(value));
}

function validTraceId(value: string | undefined) {
  return typeof value === 'string' && TRACE_ID_PATTERN.test(value);
}

function validFocusedWindow(query: ExploreQuery) {
  return (
    validExactWindow(query.start, query.end) &&
    query.end! - query.start! <= 24 * 60 * 60_000 &&
    validTimeZone(query.timeZone)
  );
}

function validTimeZone(value: string | undefined) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function entityInvestigationHandoffState(query: ExploreQuery): 'scoped' | 'invalid' | undefined {
  if (!isPresent(query.entityId) || isPresent(query.monitorId) || !isPresent(query.timeZone)) return undefined;
  return validExactWindow(query.start, query.end) ? 'scoped' : 'invalid';
}

export function exploreUsesExactWindow(query: ExploreQuery) {
  return (
    exploreHandoffState(query) !== 'invalid' &&
    query.windowMode !== 'preset' &&
    validExactWindow(query.start, query.end)
  );
}

function isPresent(value: unknown) {
  return value != null;
}

function validExactWindow(start: number | undefined, end: number | undefined) {
  return (
    start != null && end != null && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && start < end
  );
}
