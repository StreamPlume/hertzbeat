/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { useEffect, useState } from 'react';

import { queryHertzBeatData } from '../datasource/hertzbeat-query-client';
import type {
  HertzBeatLogTableQuery,
  HertzBeatMetricQuery,
  HertzBeatQueryOutcome,
  HertzBeatTraceGanttQuery,
  HertzBeatTraceTableQuery
} from '../datasource/hertzbeat-query-contract';
import type {
  HertzBeatLogRow,
  HertzBeatMetricData,
  HertzBeatTableData,
  HertzBeatTraceDetail,
  HertzBeatTraceRow
} from '../datasource/hertzbeat-query-schema';
import { toPersesLogData, toPersesTraceDetailData, toPersesTraceSearchData } from './perses-signal-data';
import {
  HertzBeatPrimitiveFrame,
  type HertzBeatLogTableDisplay,
  type HertzBeatPrimitiveFrameProps,
  type HertzBeatPersesPrimitiveMessages,
  type HertzBeatPersesTableInteraction,
  type PrimitiveState,
  type ReadyOutcome,
  type SharedPrimitiveProps
} from './hertzbeat-perses-primitive-frame';
import { toPersesTimeSeriesData } from './perses-time-series-model';
import type { HertzBeatLogRowSelection } from './hertzbeat-logs-table-adapter';

export type {
  HertzBeatLogRowSelection,
  HertzBeatLogTableDisplay,
  HertzBeatPersesPrimitiveMessages,
  HertzBeatPersesTableInteraction
};

export type HertzBeatMetricQueryOutcome = HertzBeatQueryOutcome<HertzBeatMetricData>;
export type HertzBeatLogQueryOutcome = HertzBeatQueryOutcome<HertzBeatTableData<HertzBeatLogRow>>;
export type HertzBeatTraceTableQueryOutcome = HertzBeatQueryOutcome<HertzBeatTableData<HertzBeatTraceRow>>;
export type HertzBeatTraceGanttQueryOutcome = HertzBeatQueryOutcome<HertzBeatTraceDetail>;
export type HertzBeatTraceQueryOutcome = HertzBeatTraceTableQueryOutcome | HertzBeatTraceGanttQueryOutcome;

export function HertzBeatMetricTimeSeries(props: SharedPrimitiveProps & { query: HertzBeatMetricQuery }) {
  const state = useHertzBeatQuery(props.query, executeMetricQuery);
  return renderPrimitive(props, state, outcome => ({
    kind: 'metric-time-series' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesTimeSeriesData(outcome.data.series, props.query.timeWindow),
    display: props.timeSeriesDisplay,
    onTimeWindowChange: props.onTimeWindowChange,
    timeWindowChangeEnabled: props.timeWindowChangeEnabled
  }));
}

export function HertzBeatLogsTable(props: SharedPrimitiveProps & { query: HertzBeatLogTableQuery }) {
  const state = useHertzBeatQuery(props.query, executeLogQuery);
  return renderPrimitive(props, state, outcome => ({
    kind: 'logs-table' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesLogData(outcome.data, props.query.timeWindow),
    ...(props.logDisplay ? { display: props.logDisplay } : {}),
    ...(props.logRowSelection ? { rowSelection: props.logRowSelection } : {})
  }));
}

export function HertzBeatTraceTable(props: SharedPrimitiveProps & { query: HertzBeatTraceTableQuery }) {
  const state = useHertzBeatQuery(props.query, executeTraceTableQuery);
  return renderPrimitive(props, state, outcome => ({
    kind: 'trace-table' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesTraceSearchData(outcome.data, outcome.truncated === true)
  }));
}

export function HertzBeatTracingGanttChart(props: SharedPrimitiveProps & { query: HertzBeatTraceGanttQuery }) {
  const state = useHertzBeatQuery(props.query, executeTraceGanttQuery);
  return renderPrimitive(props, state, outcome => ({
    kind: 'tracing-gantt-chart' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesTraceDetailData(outcome.data),
    selectedSpanId: props.query.spanId
  }));
}

export function HertzBeatMetricTimeSeriesResult(
  props: SharedPrimitiveProps & { query: HertzBeatMetricQuery; outcome: ReadyOutcome<HertzBeatMetricData> }
) {
  return renderPrimitive(props, resolvedState(props.query, props.outcome, props.runtimeIdentity), outcome => ({
    kind: 'metric-time-series' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesTimeSeriesData(outcome.data.series, props.query.timeWindow),
    display: props.timeSeriesDisplay,
    onTimeWindowChange: props.onTimeWindowChange,
    timeWindowChangeEnabled: props.timeWindowChangeEnabled
  }));
}

export function HertzBeatLogsTableResult(
  props: SharedPrimitiveProps & {
    query: HertzBeatLogTableQuery;
    outcome: ReadyOutcome<HertzBeatTableData<HertzBeatLogRow>>;
  }
) {
  return renderPrimitive(props, resolvedState(props.query, props.outcome, props.runtimeIdentity), outcome => ({
    kind: 'logs-table' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesLogData(outcome.data, props.query.timeWindow),
    ...(props.logDisplay ? { display: props.logDisplay } : {}),
    ...(props.logRowSelection ? { rowSelection: props.logRowSelection } : {})
  }));
}

export function HertzBeatTraceTableResult(
  props: SharedPrimitiveProps & {
    query: HertzBeatTraceTableQuery;
    outcome: ReadyOutcome<HertzBeatTableData<HertzBeatTraceRow>>;
  }
) {
  return renderPrimitive(props, resolvedState(props.query, props.outcome, props.runtimeIdentity), outcome => ({
    kind: 'trace-table' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesTraceSearchData(outcome.data, outcome.truncated === true)
  }));
}

export function HertzBeatTracingGanttChartResult(
  props: SharedPrimitiveProps & { query: HertzBeatTraceGanttQuery; outcome: ReadyOutcome<HertzBeatTraceDetail> }
) {
  return renderPrimitive(props, resolvedState(props.query, props.outcome, props.runtimeIdentity), outcome => ({
    kind: 'tracing-gantt-chart' as const,
    title: props.title,
    timeWindow: props.query.timeWindow,
    data: toPersesTraceDetailData(outcome.data),
    selectedSpanId: props.query.spanId
  }));
}

function renderPrimitive<Data>(
  props: SharedPrimitiveProps,
  state: PrimitiveState<Data>,
  toRuntimeProps: HertzBeatPrimitiveFrameProps<Data>['toRuntimeProps']
) {
  return <HertzBeatPrimitiveFrame {...props} state={state} toRuntimeProps={toRuntimeProps} />;
}

function resolvedState<Query, Data>(
  query: Query,
  outcome: ReadyOutcome<Data>,
  runtimeIdentity?: string
): PrimitiveState<Data> {
  return { kind: 'resolved', queryKey: runtimeIdentity ?? JSON.stringify(query), outcome };
}

function executeMetricQuery(query: HertzBeatMetricQuery, signal: AbortSignal) {
  return queryHertzBeatData(query, { signal });
}

function executeLogQuery(query: HertzBeatLogTableQuery, signal: AbortSignal) {
  return queryHertzBeatData(query, { signal });
}

function executeTraceTableQuery(query: HertzBeatTraceTableQuery, signal: AbortSignal) {
  return queryHertzBeatData(query, { signal });
}

function executeTraceGanttQuery(query: HertzBeatTraceGanttQuery, signal: AbortSignal) {
  return queryHertzBeatData(query, { signal });
}

function useHertzBeatQuery<Query, Data>(
  query: Query,
  execute: (query: Query, signal: AbortSignal) => Promise<HertzBeatQueryOutcome<Data>>
): PrimitiveState<Data> {
  const queryKey = JSON.stringify(query);
  const [state, setState] = useState<PrimitiveState<Data>>({ kind: 'loading', queryKey });
  useEffect(() => {
    const controller = new AbortController();
    const executableQuery = JSON.parse(queryKey) as Query;
    async function resolveQuery() {
      try {
        const outcome = await execute(executableQuery, controller.signal);
        if (!controller.signal.aborted) setState({ kind: 'resolved', queryKey, outcome });
      } catch {
        if (!controller.signal.aborted) {
          setState({
            kind: 'resolved',
            queryKey,
            outcome: {
              state: 'error',
              error: { kind: 'unavailable', messageKey: 'perses.query.unavailable', retryable: true }
            }
          });
        }
      }
    }
    void resolveQuery();
    return () => controller.abort();
  }, [execute, queryKey]);
  return state.queryKey === queryKey ? state : { kind: 'loading', queryKey };
}
