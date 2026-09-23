/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { ApiMessageError, apiMessageGet } from '@/core/http/api-message';

import {
  hertzBeatQuerySchema,
  type HertzBeatLogTableQuery,
  type HertzBeatMetricQuery,
  type HertzBeatQuery,
  type HertzBeatQueryFailure,
  type HertzBeatQueryOutcome,
  type HertzBeatTraceGanttQuery,
  type HertzBeatTraceTableQuery
} from './hertzbeat-query-contract';
import {
  HertzBeatResponseContractError,
  HertzBeatResponseStateError,
  parseLogTable,
  parseMetricResponse,
  parseTraceGantt,
  parseTraceTable,
  type HertzBeatLogRow,
  type HertzBeatMetricData,
  type HertzBeatTableData,
  type HertzBeatTraceDetail,
  type HertzBeatTraceRow
} from './hertzbeat-query-schema';

export { HERTZBEAT_QUERY_LIMITS } from './hertzbeat-query-contract';

const DEFAULT_TABLE_LIMIT = 100;

type QueryOptions = { signal?: AbortSignal | undefined };

export function queryHertzBeatData(
  query: HertzBeatMetricQuery,
  options?: QueryOptions
): Promise<HertzBeatQueryOutcome<HertzBeatMetricData>>;
export function queryHertzBeatData(
  query: HertzBeatLogTableQuery,
  options?: QueryOptions
): Promise<HertzBeatQueryOutcome<HertzBeatTableData<HertzBeatLogRow>>>;
export function queryHertzBeatData(
  query: HertzBeatTraceTableQuery,
  options?: QueryOptions
): Promise<HertzBeatQueryOutcome<HertzBeatTableData<HertzBeatTraceRow>>>;
export function queryHertzBeatData(
  query: HertzBeatTraceGanttQuery,
  options?: QueryOptions
): Promise<HertzBeatQueryOutcome<HertzBeatTraceDetail>>;
export async function queryHertzBeatData(
  query: HertzBeatQuery,
  options: QueryOptions = {}
): Promise<HertzBeatQueryOutcome<unknown>> {
  const parsed = hertzBeatQuerySchema.safeParse(query);
  if (!parsed.success) return failure('invalid_request');
  try {
    return await executeQuery(parsed.data, options.signal);
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    return mapFailure(error);
  }
}

async function executeQuery(query: HertzBeatQuery, signal?: AbortSignal): Promise<HertzBeatQueryOutcome<unknown>> {
  if (query.signal === 'metrics') {
    const data = parseMetricResponse(await request(buildMetricPath(query), signal), query.timeWindow);
    return data ? { state: 'ready', data, truncated: 'unknown' } : { state: 'empty', truncated: false };
  }
  if (query.signal === 'logs') {
    const limit = query.limit ?? DEFAULT_TABLE_LIMIT;
    const data = parseLogTable(await request(buildLogTablePath(query, limit), signal), limit);
    return data
      ? { state: 'ready', data, truncated: data.total > data.rows.length }
      : { state: 'empty', truncated: false };
  }
  if (query.queryKind === 'table') {
    const limit = query.limit ?? DEFAULT_TABLE_LIMIT;
    const data = parseTraceTable(await request(buildTraceTablePath(query, limit), signal), limit);
    return data
      ? { state: 'ready', data, truncated: data.total > data.rows.length }
      : { state: 'empty', truncated: false };
  }
  const data = parseTraceGantt(
    await request(buildTraceGanttPath(query), signal),
    query.traceId,
    query.spanId,
    query.timeWindow
  );
  return data ? { state: 'ready', data, truncated: false } : { state: 'empty', truncated: false };
}

function request(path: string, signal?: AbortSignal) {
  return apiMessageGet(path, { signal: signal ?? null });
}

function buildMetricPath(query: HertzBeatMetricQuery) {
  const params = baseParams(query, true);
  params.set('query', query.metric.name);
  set(params, 'aggregation', query.metric.aggregation);
  set(params, 'temporalAggregation', query.metric.temporalAggregation);
  setNumber(params, 'step', query.metric.stepSeconds);
  setNumber(params, 'limit', query.limit);
  set(params, 'operationName', query.metric.operationName);
  return `/api/ingestion/otlp/metrics/console?${params.toString()}`;
}

function buildLogTablePath(query: HertzBeatLogTableQuery, limit: number) {
  const params = baseParams(query, true);
  params.set('pageIndex', '0');
  params.set('pageSize', String(limit));
  set(params, 'search', query.search);
  set(params, 'severityText', query.severity);
  set(params, 'traceId', query.traceId);
  set(params, 'spanId', query.spanId);
  setBoolean(params, 'hideInternal', query.hideInternal);
  setBoolean(params, 'hideNoise', query.hideNoise);
  return `/api/logs/list?${params.toString()}`;
}

function buildTraceTablePath(query: HertzBeatTraceTableQuery, limit: number) {
  const params = baseParams(query, true);
  params.set('pageIndex', '0');
  params.set('pageSize', String(limit));
  set(params, 'operationName', query.operationName);
  setBoolean(params, 'errorOnly', query.errorOnly);
  setNumber(params, 'minDurationMs', query.minDurationMs);
  setNumber(params, 'maxDurationMs', query.maxDurationMs);
  set(params, 'spanScope', query.spanScope);
  setBoolean(params, 'hideInternal', query.hideInternal);
  return `/api/traces/list?${params.toString()}`;
}

function buildTraceGanttPath(query: HertzBeatTraceGanttQuery) {
  const params = new URLSearchParams({
    start: String(query.timeWindow.from),
    end: String(query.timeWindow.to)
  });
  set(params, 'spanId', query.spanId);
  return `/api/traces/${encodeURIComponent(query.traceId)}?${params.toString()}`;
}

function baseParams(query: HertzBeatQuery, includeEntityType: boolean) {
  const params = new URLSearchParams();
  set(params, 'entityId', query.context?.entityId);
  if (includeEntityType) set(params, 'entityType', query.context?.entityType);
  params.set('start', String(query.timeWindow.from));
  params.set('end', String(query.timeWindow.to));
  set(params, 'serviceName', query.context?.serviceName);
  set(params, 'serviceNamespace', query.context?.serviceNamespace);
  set(params, 'environment', query.context?.environment);
  set(params, 'collectorId', query.context?.collectorId);
  set(params, 'instance', query.context?.instance);
  set(params, 'endpoint', query.context?.endpoint);
  return params;
}

function set(params: URLSearchParams, key: string, value: string | undefined) {
  if (value) params.set(key, value);
}

function setNumber(params: URLSearchParams, key: string, value: number | undefined) {
  if (value != null) params.set(key, String(value));
}

function setBoolean(params: URLSearchParams, key: string, value: boolean | undefined) {
  if (value) params.set(key, 'true');
}

function mapFailure(error: unknown): HertzBeatQueryOutcome<never> {
  if (error instanceof HertzBeatResponseContractError) return failure('contract_error');
  if (error instanceof HertzBeatResponseStateError) return failure(error.kind);
  if (error instanceof ApiMessageError) {
    if (error.status === 401 || error.status === 403) return failure('permission');
    if (error.status === 400 || error.status === 422 || error.code === 3) return failure('invalid_request');
    if (error.status === 429) return failure('overloaded');
  }
  return failure('unavailable');
}

function failure(kind: HertzBeatQueryFailure['kind']): HertzBeatQueryOutcome<never> {
  const errors: Record<HertzBeatQueryFailure['kind'], HertzBeatQueryFailure> = {
    invalid_request: {
      kind: 'invalid_request',
      messageKey: 'perses.query.invalid',
      retryable: false
    },
    permission: {
      kind: 'permission',
      messageKey: 'perses.query.permission',
      retryable: false
    },
    overloaded: {
      kind: 'overloaded',
      messageKey: 'perses.query.overloaded',
      retryable: true
    },
    unavailable: {
      kind: 'unavailable',
      messageKey: 'perses.query.unavailable',
      retryable: true
    },
    contract_error: {
      kind: 'contract_error',
      messageKey: 'perses.query.contract',
      retryable: false
    }
  };
  return { state: 'error', error: errors[kind] };
}
