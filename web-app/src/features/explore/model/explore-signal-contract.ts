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

import type { PagedCollection } from '@/shared/pagination';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export const LIVE_LOG_RETENTION_LIMIT = 500;
export type ExplorePageResult<T> = PagedCollection<T>;

type TraceSummary = {
  traceId: string;
  rootSpanId: string | null;
  serviceName: string | null;
  serviceNamespace: string | null;
  rootSpanName: string | null;
  durationNanos: number | null;
  status: string | null;
  startTime: number | null;
  errorSpanCount: number;
  resourceAttributes: Record<string, string> | null;
};
export type TraceRow = TraceSummary & {
  spanCount: number | null;
  serviceStats: Record<string, { spanCount: number; errorCount: number }> | null;
};

type SharedLogRow = {
  severityNumber: number | null;
  severityText: string | null;
  body: JsonValue;
  attributes: Record<string, JsonValue> | null;
  droppedAttributesCount: number | null;
  traceId: string | null;
  spanId: string | null;
  traceFlags: number | null;
  resource: Record<string, JsonValue> | null;
  resourceSchemaUrl: string | null;
  instrumentationScope: {
    name: string | null;
    version: string | null;
    attributes: Record<string, JsonValue> | null;
    droppedAttributesCount: number | null;
  } | null;
  scopeSchemaUrl: string | null;
};
export type LogRow = SharedLogRow & {
  logRecordUid: string | null;
  timeUnixNano: string | null;
  observedTimeUnixNano: string | null;
};
export type LiveLogRow = SharedLogRow & {
  timeUnixNano: number | null;
  observedTimeUnixNano: number | null;
};
export type LogStreamGap = {
  observedAt: number;
  reason: 'queue_overflow';
  droppedCount: number;
};
export type LogOverview = {
  totalCount: number;
  traceCount: number;
  debugCount: number;
  infoCount: number;
  warnCount: number;
  errorCount: number;
  fatalCount: number;
};
export type LogTrend = {
  start: number;
  end: number;
  intervalMs: number;
  buckets: Array<{ start: number; count: number }>;
};
type LogStatisticEvidence<T> = { kind: 'ready'; data: T } | { kind: 'error' };
export type LogHistoryEvidence = {
  page: ExplorePageResult<LogRow>;
  overview: LogStatisticEvidence<LogOverview>;
  trend: LogStatisticEvidence<LogTrend>;
};

type MetricField = {
  name: string | null;
  type: 'number' | 'string' | 'time' | 'bool' | null;
  unit: string | null;
};
type MetricFrame = {
  schema: {
    fields: MetricField[] | null;
    labels: Record<string, string> | null;
    meta: Record<string, string> | null;
  } | null;
  data: JsonValue[][] | null;
};
export type MetricConsole = {
  context: {
    entityId: number | null;
    entityType: string | null;
    entityName: string | null;
    serviceName: string | null;
    serviceNamespace: string | null;
    environment: string | null;
    operationName: string | null;
    start: number | null;
    end: number | null;
  } | null;
  query: string | null;
  datasource: string | null;
  queryMode: string | null;
  results: { refId: string | null; status: number | null; msg: string | null; frames: MetricFrame[] | null } | null;
  stats: { totalSeries: number; nonEmptySeries: number; latestObservedAt: number | null } | null;
  emptyStateReason: string | null;
  errorMessage: string | null;
};
export type MetricSignalEvidence = MetricConsole | { kind: 'inventory_empty' };

export function isMetricConsole(evidence: MetricSignalEvidence): evidence is MetricConsole {
  return !('kind' in evidence);
}

export class ExploreSignalContractError extends Error {
  constructor(message = 'Explore signal response does not match its contract') {
    super(message);
    this.name = 'ExploreSignalContractError';
  }
}
export class ExploreSignalMissingError extends Error {
  constructor() {
    super('Explore signal detail is missing');
    this.name = 'ExploreSignalMissingError';
  }
}
export class ExploreSignalUnavailableError extends Error {
  constructor() {
    super('Explore signal evidence is unavailable');
    this.name = 'ExploreSignalUnavailableError';
  }
}
