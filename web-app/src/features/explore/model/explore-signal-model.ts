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

import type { LiveLogRow, LogRow, MetricConsole } from './explore-signal-contract';

export type LiveLogStatus = 'waiting' | 'connected' | 'degraded' | 'paused' | 'unavailable' | 'error' | 'contract';
export type MetricSeries = {
  key: string;
  name: string;
  unit?: string | undefined;
  labels: Record<string, string>;
  points: unknown[][];
};

export type MetricPoint = { timestamp: number; value: number };

export type MetricResultState =
  | { kind: 'error'; message?: string }
  | { kind: 'contract_error' }
  | { kind: 'storage_unavailable' }
  | { kind: 'missing_context' }
  | { kind: 'unsupported_query' }
  | { kind: 'empty' }
  | { kind: 'ready'; series: MetricSeries[] };

export function metricResultState(console: MetricConsole): MetricResultState {
  const unavailable = metricUnavailableState(console);
  if (unavailable) return unavailable;
  if (console.errorMessage != null) return metricErrorState(console.errorMessage);
  const results = console.results;
  if (!results || results.status == null) return { kind: 'storage_unavailable' };
  if (results.status !== 200) return metricErrorState(results.msg ?? undefined);
  if (!Array.isArray(results.frames)) return { kind: 'storage_unavailable' };
  if (results.frames.length === 0) return { kind: 'empty' };
  if (results.frames.some(frame => !hasMetricFrameData(frame))) return { kind: 'storage_unavailable' };
  const series = metricSeries(console);
  if (series.some(item => item.points.some(point => !validMetricPoint(point)))) return { kind: 'contract_error' };
  return series.some(item => item.points.length > 0) ? { kind: 'ready', series } : { kind: 'empty' };
}

function metricUnavailableState(console: MetricConsole): MetricResultState | undefined {
  if (console.emptyStateReason === 'no_context') return { kind: 'missing_context' };
  if (console.emptyStateReason === 'unsupported_query') return { kind: 'unsupported_query' };
  if (console.emptyStateReason === 'load_failed' && console.results == null) return { kind: 'storage_unavailable' };
  return undefined;
}

export function metricSeries(console: MetricConsole): MetricSeries[] {
  return (console.results?.frames ?? []).map((frame, index) => {
    const labels = frame.schema?.labels ?? {};
    const valueField = frame.schema?.fields?.find(field => field.type === 'number');
    const name = labels.__name__ ?? valueField?.name ?? `series-${index + 1}`;
    return {
      key: `${name}-${index}`,
      name,
      unit: valueField?.unit ?? undefined,
      labels,
      points: frame.data ?? []
    };
  });
}

export function metricPoints(series: MetricSeries): MetricPoint[] {
  return series.points.flatMap(point => {
    if (!Array.isArray(point)) return [];
    const timestamp = metricNumber(point[0]);
    const value = metricNumber(point[1]);
    return timestamp != null && value != null ? [{ timestamp, value }] : [];
  });
}

export function logServiceName(row: LogRow | LiveLogRow) {
  const value = row.resource?.['service.name'] ?? row.resource?.service_name;
  return typeof value === 'string' ? value : undefined;
}

export function logBody(row: LogRow | LiveLogRow) {
  if (typeof row.body === 'string') return row.body;
  if (row.body == null) return undefined;
  try {
    return JSON.stringify(row.body);
  } catch {
    return undefined;
  }
}

export function logTimestampMs(row: LogRow | LiveLogRow) {
  const timestamp = row.timeUnixNano ?? row.observedTimeUnixNano;
  if (timestamp == null) return undefined;
  if (typeof timestamp === 'number') return Math.floor(timestamp / 1_000_000);
  if (!/^[1-9]\d{0,18}$/u.test(timestamp)) return undefined;
  const milliseconds = BigInt(timestamp) / 1_000_000n;
  return milliseconds <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(milliseconds) : undefined;
}

function metricErrorState(message?: string): MetricResultState {
  const normalized = message?.trim();
  return normalized ? { kind: 'error', message: normalized } : { kind: 'error' };
}

function metricNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validMetricPoint(point: unknown[]) {
  const timestamp = metricNumber(point[0]);
  return (
    point.length >= 2 &&
    timestamp != null &&
    Number.isSafeInteger(timestamp) &&
    timestamp > 0 &&
    metricNumber(point[1]) != null
  );
}

function hasMetricFrameData(frame: unknown) {
  return typeof frame === 'object' && frame !== null && Array.isArray((frame as { data?: unknown }).data);
}
