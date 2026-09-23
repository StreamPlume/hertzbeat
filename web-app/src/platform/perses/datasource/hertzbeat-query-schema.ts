/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { z } from 'zod';

import type { ExactTimeWindow } from '@/shared/query-context';

import { HERTZBEAT_QUERY_LIMITS } from './hertzbeat-query-contract';

const nullableText = z.string().nullable();
const safeInteger = z.number().int().safe();
const nonNegativeInteger = safeInteger.nonnegative();
const nullableNonNegativeInteger = nonNegativeInteger.nullable();
const javaLong = z
  .number()
  .finite()
  .refine(Number.isInteger)
  .refine(value => value >= 0);
const nullableJavaLong = javaLong.nullable();
const positiveUint64Decimal = z
  .string()
  .regex(/^[1-9]\d{0,19}$/u)
  .refine(value => value.length < 20 || value <= '18446744073709551615');
const nullablePositiveLongDecimal = z
  .string()
  .regex(/^[1-9]\d{0,18}$/u)
  .refine(value => value.length < 19 || value <= '9223372036854775807')
  .nullable();
const nonNegativeLongDecimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/u)
  .refine(value => value.length < 19 || value <= '9223372036854775807');
const compositeTraceId = z.string().regex(/^[0-9a-f]{32}$/u);
const compositeSpanId = z.string().regex(/^[0-9a-f]{16}$/u);
const nullableLogRecordUid = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
  .nullable();
const stringMap = z.record(z.string(), z.string());
const nullableStringMap = stringMap.nullable();

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValue), z.record(z.string(), jsonValue)])
);
const nullableJsonMap = z.record(z.string(), jsonValue).nullable();

const metricField = z.object({
  name: nullableText,
  type: z.enum(['number', 'string', 'time', 'bool']).nullable(),
  unit: nullableText
});
const metricFrame = z.object({
  schema: z
    .object({ fields: z.array(metricField).nullable(), labels: nullableStringMap, meta: nullableStringMap })
    .nullable(),
  data: z.array(z.array(jsonValue)).max(HERTZBEAT_QUERY_LIMITS.metricPointsPerSeries).nullable()
});
const metricConsole = z.object({
  context: z
    .object({
      entityId: nullableJavaLong,
      entityType: nullableText,
      entityName: nullableText,
      serviceName: nullableText,
      serviceNamespace: nullableText,
      environment: nullableText,
      collectorId: nullableText,
      instance: nullableText,
      endpoint: nullableText,
      operationName: nullableText,
      start: nullableNonNegativeInteger,
      end: nullableNonNegativeInteger
    })
    .nullable(),
  query: nullableText,
  datasource: nullableText,
  queryMode: nullableText,
  results: z
    .object({
      refId: nullableText,
      status: safeInteger.nullable(),
      msg: nullableText,
      frames: z.array(metricFrame).max(HERTZBEAT_QUERY_LIMITS.metricSeries).nullable()
    })
    .nullable(),
  stats: z
    .object({
      totalSeries: nonNegativeInteger,
      nonEmptySeries: nonNegativeInteger,
      latestObservedAt: nullableNonNegativeInteger
    })
    .refine(stats => stats.nonEmptySeries <= stats.totalSeries)
    .nullable(),
  emptyStateReason: nullableText,
  errorMessage: nullableText
});

const instrumentationScope = z.object({
  name: nullableText,
  version: nullableText,
  attributes: nullableJsonMap,
  droppedAttributesCount: nullableNonNegativeInteger
});
const logRowSchema = z.object({
  logRecordUid: nullableLogRecordUid,
  timeUnixNano: nullablePositiveLongDecimal,
  observedTimeUnixNano: nullablePositiveLongDecimal,
  severityNumber: nullableNonNegativeInteger,
  severityText: nullableText,
  body: jsonValue,
  attributes: nullableJsonMap,
  droppedAttributesCount: nullableNonNegativeInteger,
  traceId: nullableText,
  spanId: nullableText,
  traceFlags: nullableNonNegativeInteger,
  resource: nullableJsonMap,
  resourceSchemaUrl: nullableText,
  instrumentationScope: instrumentationScope.nullable(),
  scopeSchemaUrl: nullableText
});

const traceSummaryShape = {
  traceId: z.string().min(1),
  rootSpanId: nullableText,
  serviceName: nullableText,
  serviceNamespace: nullableText,
  rootSpanName: nullableText,
  durationNanos: nullableJavaLong,
  status: nullableText,
  startTime: nullableNonNegativeInteger,
  errorSpanCount: nonNegativeInteger,
  resourceAttributes: nullableStringMap
};
const traceServiceStat = z
  .object({
    spanCount: nonNegativeInteger.positive(),
    errorCount: nonNegativeInteger
  })
  .refine(stat => stat.errorCount <= stat.spanCount);
const traceServiceStats = z
  .record(
    z.string().refine(serviceName => serviceName.trim().length > 0),
    traceServiceStat
  )
  .refine(stats => Object.keys(stats).length > 0);
const traceRowShape = {
  ...traceSummaryShape,
  spanCount: nonNegativeInteger.positive(),
  serviceStats: traceServiceStats
};
const traceRowSchema = z.object(traceRowShape).superRefine((row, context) => {
  const stats = Object.values(row.serviceStats);
  const spanTotal = stats.reduce((sum, stat) => sum + stat.spanCount, 0);
  const errorTotal = stats.reduce((sum, stat) => sum + stat.errorCount, 0);
  if (
    !Number.isSafeInteger(spanTotal) ||
    !Number.isSafeInteger(errorTotal) ||
    spanTotal !== row.spanCount ||
    errorTotal !== row.errorSpanCount
  ) {
    context.addIssue({ code: 'custom', message: 'Trace service statistics do not match trace totals' });
  }
});
type HertzBeatMetricSeries = {
  key: string;
  name: string;
  unit?: string | undefined;
  labels: Record<string, string>;
  points: Array<{ timestamp: number; value: number }>;
};
export type HertzBeatMetricData = {
  timeWindow: ExactTimeWindow;
  source: string | null;
  series: HertzBeatMetricSeries[];
};
export type HertzBeatLogRow = z.infer<typeof logRowSchema>;
export type HertzBeatTraceRow = z.infer<typeof traceRowSchema>;
export type HertzBeatTableData<T> = { rows: T[]; total: number };

export class HertzBeatResponseContractError extends Error {
  constructor() {
    super('Unexpected observability response');
    this.name = 'HertzBeatResponseContractError';
  }
}

export class HertzBeatResponseStateError extends Error {
  constructor(readonly kind: 'invalid_request' | 'unavailable') {
    super('Observability response is not ready');
    this.name = 'HertzBeatResponseStateError';
  }
}

export function parseMetricResponse(value: unknown, window: ExactTimeWindow): HertzBeatMetricData | undefined {
  const parsed = metricConsole.safeParse(value);
  if (!parsed.success) throw new HertzBeatResponseContractError();
  const console = parsed.data;
  requireMetricReadyState(console);
  if (console.context?.start !== window.from || console.context.end !== window.to) {
    throw new HertzBeatResponseContractError();
  }
  const frames = requireMetricFrames(console);
  if (frames.length === 0) return undefined;
  const series = frames.map((frame, index) => metricSeries(frame, index));
  return series.some(item => item.points.length > 0)
    ? { timeWindow: window, source: console.datasource, series }
    : undefined;
}

function requireMetricReadyState(console: z.infer<typeof metricConsole>) {
  if (console.emptyStateReason === 'no_context' || console.emptyStateReason === 'unsupported_query') {
    throw new HertzBeatResponseStateError('invalid_request');
  }
  if (console.errorMessage != null || console.emptyStateReason === 'load_failed') {
    throw new HertzBeatResponseStateError('unavailable');
  }
}

function requireMetricFrames(console: z.infer<typeof metricConsole>) {
  if (!console.results || console.results.status !== 200 || !console.results.frames) {
    throw new HertzBeatResponseStateError('unavailable');
  }
  const frames = console.results.frames;
  const nonEmptyFrames = frames.filter(frame => (frame.data?.length ?? 0) > 0).length;
  if (
    !console.stats ||
    console.stats.totalSeries !== frames.length ||
    console.stats.nonEmptySeries !== nonEmptyFrames
  ) {
    throw new HertzBeatResponseContractError();
  }
  return frames;
}

export function parseLogTable(value: unknown, limit: number): HertzBeatTableData<HertzBeatLogRow> | undefined {
  const result = z
    .object({
      content: z.array(logRowSchema),
      totalElements: nonNegativeInteger,
      pageIndex: z.literal(0),
      pageSize: z.literal(limit)
    })
    .safeParse(value);
  if (
    !result.success ||
    (result.data.content.length === 0 && result.data.totalElements > 0) ||
    result.data.content.length > Math.min(limit, result.data.totalElements)
  ) {
    throw new HertzBeatResponseContractError();
  }
  return result.data.content.length > 0 ? { rows: result.data.content, total: result.data.totalElements } : undefined;
}

export function parseTraceTable(value: unknown, limit: number): HertzBeatTableData<HertzBeatTraceRow> | undefined {
  const result = z
    .object({
      content: z.array(traceRowSchema),
      totalElements: nonNegativeInteger,
      totalPages: nonNegativeInteger,
      number: z.literal(0),
      size: z.literal(limit)
    })
    .safeParse(value);
  if (!result.success || result.data.totalPages !== Math.ceil(result.data.totalElements / limit)) {
    throw new HertzBeatResponseContractError();
  }
  if (
    (result.data.content.length === 0 && result.data.totalElements > 0) ||
    result.data.content.length > Math.min(limit, result.data.totalElements)
  ) {
    throw new HertzBeatResponseContractError();
  }
  return result.data.content.length > 0 ? { rows: result.data.content, total: result.data.totalElements } : undefined;
}

export function parseTraceGantt(
  value: unknown,
  traceId: string,
  selectedSpanId: string | undefined,
  window: ExactTimeWindow
): HertzBeatTraceDetail | undefined {
  const result = traceCompositeSchema.safeParse(value);
  if (
    !result.success ||
    result.data.traceId !== traceId ||
    result.data.selectedSpanId !== (selectedSpanId ?? null) ||
    result.data.window.start !== window.from ||
    result.data.window.end !== window.to
  ) {
    throw new HertzBeatResponseContractError();
  }
  if (result.data.gantt.state === 'empty') return undefined;
  if (result.data.gantt.state === 'unavailable') throw new HertzBeatResponseStateError('unavailable');
  return compositeTraceDetail(result.data.gantt.detail, traceId);
}

const boundedText = z.string().trim().min(1).max(2_048);
const boundedStringMap = z.record(z.string().trim().min(1).max(192), z.string().max(4_096));
const compositeEvent = z
  .object({
    timeUnixNano: positiveUint64Decimal,
    name: z.string().max(512).nullable(),
    attributes: boundedStringMap,
    droppedAttributesCount: nullableNonNegativeInteger
  })
  .strict();
const compositeLink = z
  .object({
    traceId: compositeTraceId,
    spanId: compositeSpanId,
    traceState: z.string().max(512).nullable(),
    attributes: boundedStringMap,
    droppedAttributesCount: nullableNonNegativeInteger
  })
  .strict();
const compositeCodeHint = z
  .object({
    repositoryUrl: z.string().max(2_048).nullable(),
    provider: z.string().max(128).nullable(),
    defaultPath: z.string().max(2_048).nullable(),
    searchQuery: z.string().max(2_048).nullable(),
    label: z.string().max(256).nullable()
  })
  .strict();
const compositeSpan = z
  .object({
    spanId: compositeSpanId,
    parentSpanId: compositeSpanId.nullable(),
    spanName: boundedText,
    serviceName: boundedText,
    serviceNamespace: z.string().max(256).nullable(),
    deploymentEnvironment: z.string().max(128).nullable(),
    entityId: z.string().max(20).nullable(),
    entityType: z.string().max(64).nullable(),
    status: boundedText,
    statusMessage: z.string().max(2_048).nullable(),
    spanKind: z.string().max(64).nullable(),
    traceState: z.string().max(512).nullable(),
    scopeName: z.string().max(256).nullable(),
    scopeVersion: z.string().max(128).nullable(),
    durationNanos: nonNegativeLongDecimal,
    startTime: safeInteger.positive(),
    highlighted: z.boolean(),
    resourceAttributes: boundedStringMap,
    spanAttributes: boundedStringMap,
    events: z.array(compositeEvent).max(1_024),
    links: z.array(compositeLink).max(1_024),
    codeNavigationHint: compositeCodeHint.nullable()
  })
  .strict();
const compositeDetail = z
  .object({
    rootSpanId: compositeSpanId,
    serviceName: boundedText,
    serviceNamespace: z.string().max(256).nullable(),
    deploymentEnvironment: z.string().max(128).nullable(),
    entityId: z.string().max(20).nullable(),
    entityType: z.string().max(64).nullable(),
    rootSpanName: boundedText,
    durationNanos: nonNegativeLongDecimal,
    status: boundedText,
    startTime: safeInteger.positive(),
    errorSpanCount: nonNegativeInteger,
    resourceAttributes: boundedStringMap,
    spans: z.array(compositeSpan).min(1).max(10_000)
  })
  .strict();
const compositeGantt = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('ready'),
      reason: z.literal('observed'),
      source: z.literal('greptime_traces'),
      detail: compositeDetail
    })
    .strict(),
  z
    .object({
      state: z.literal('empty'),
      reason: z.literal('no_data'),
      source: z.literal('greptime_traces'),
      detail: z.null()
    })
    .strict(),
  z
    .object({
      state: z.literal('unavailable'),
      reason: z.enum([
        'storage_unavailable',
        'malformed_data',
        'limit_exceeded',
        'identity_unavailable',
        'upstream_unavailable',
        'query_strategy_unavailable'
      ]),
      source: z.literal('greptime_traces'),
      detail: z.null()
    })
    .strict()
]);
const traceCompositeSchema = z
  .object({
    traceId: compositeTraceId,
    selectedSpanId: compositeSpanId.nullable(),
    window: z.object({ start: safeInteger.positive(), end: safeInteger.positive() }).strict(),
    gantt: compositeGantt,
    sameTraceLogs: z.unknown(),
    red: z.unknown(),
    metrics: z.unknown(),
    dependencies: z.unknown()
  })
  .strict();

function compositeTraceDetail(detail: z.infer<typeof compositeDetail>, traceId: string) {
  const spanIds = detail.spans.map(span => span.spanId);
  if (new Set(spanIds).size !== spanIds.length || !spanIds.includes(detail.rootSpanId)) {
    throw new HertzBeatResponseContractError();
  }
  return {
    traceId,
    rootSpanId: detail.rootSpanId,
    serviceName: detail.serviceName,
    serviceNamespace: detail.serviceNamespace,
    rootSpanName: detail.rootSpanName,
    durationNanos: detail.durationNanos,
    status: detail.status,
    startTime: detail.startTime,
    errorSpanCount: detail.errorSpanCount,
    resourceAttributes: detail.resourceAttributes,
    spans: detail.spans.map(span => ({
      traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      spanName: span.spanName,
      serviceName: span.serviceName,
      status: span.status,
      statusMessage: span.statusMessage,
      spanKind: span.spanKind,
      traceState: span.traceState,
      scopeName: span.scopeName,
      scopeVersion: span.scopeVersion,
      durationNanos: span.durationNanos,
      startTime: span.startTime,
      highlighted: span.highlighted,
      resourceAttributes: span.resourceAttributes,
      spanAttributes: span.spanAttributes,
      events: span.events,
      links: span.links,
      codeNavigationHint: span.codeNavigationHint
    }))
  };
}

export type HertzBeatTraceDetail = ReturnType<typeof compositeTraceDetail>;

function metricSeries(frame: z.infer<typeof metricFrame>, index: number): HertzBeatMetricSeries {
  if (!frame.schema?.fields || !frame.schema.labels || !frame.data) throw new HertzBeatResponseContractError();
  const timeIndex = frame.schema.fields.findIndex(field => field.type === 'time');
  const valueIndex = frame.schema.fields.findIndex(field => field.type === 'number');
  if (timeIndex < 0 || valueIndex < 0) throw new HertzBeatResponseContractError();
  const valueField = frame.schema.fields[valueIndex];
  if (!valueField) throw new HertzBeatResponseContractError();
  const name = frame.schema.labels.__name__ ?? valueField.name ?? `series-${index + 1}`;
  const points = frame.data.map(row => {
    const timestamp = finiteNumber(row[timeIndex]);
    const value = finiteNumber(row[valueIndex]);
    if (timestamp == null || value == null) throw new HertzBeatResponseContractError();
    return { timestamp, value };
  });
  return {
    key: `${name}-${index}`,
    name,
    ...(valueField.unit ? { unit: valueField.unit } : {}),
    labels: frame.schema.labels,
    points
  };
}

function finiteNumber(value: JsonValue | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
