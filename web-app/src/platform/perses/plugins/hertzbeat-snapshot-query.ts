/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import type {
  LogQueryPlugin,
  PluginModuleResource,
  TimeSeriesQueryPlugin,
  TraceQueryPlugin
} from '@perses-dev/plugin-system';
import type { LogData, TimeSeriesData, TraceData } from '@perses-dev/spec';

export const HERTZBEAT_SNAPSHOT_QUERY_KIND = 'HertzBeatSnapshotTimeSeriesQuery';
export const HERTZBEAT_SNAPSHOT_LOG_QUERY_KIND = 'HertzBeatSnapshotLogQuery';
export const HERTZBEAT_SNAPSHOT_TRACE_QUERY_KIND = 'HertzBeatSnapshotTraceQuery';

export type HertzBeatSnapshotQuerySpec = {
  data: TimeSeriesData;
};
export type HertzBeatSnapshotLogQuerySpec = { data: LogData };
export type HertzBeatSnapshotTraceQuerySpec = { data: TraceData };

const emptyData: TimeSeriesData = {
  timeRange: { start: new Date(0), end: new Date(1) },
  stepMs: 15_000,
  series: []
};

export const HertzBeatSnapshotTimeSeriesQuery: TimeSeriesQueryPlugin<HertzBeatSnapshotQuerySpec> = {
  createInitialOptions: () => ({ data: emptyData }),
  getTimeSeriesData: spec => Promise.resolve(spec.data)
};

export const HertzBeatSnapshotLogQuery: LogQueryPlugin<HertzBeatSnapshotLogQuerySpec> = {
  createInitialOptions: () => ({ data: { entries: [] } }),
  getLogData: (spec, context) =>
    Promise.resolve({
      logs: spec.data,
      timeRange: spec.data.timeRange ?? context.timeRange
    })
};

export const HertzBeatSnapshotTraceQuery: TraceQueryPlugin<HertzBeatSnapshotTraceQuerySpec> = {
  createInitialOptions: () => ({ data: {} }),
  getTraceData: spec => Promise.resolve(spec.data)
};

export const hertzBeatSnapshotPluginModule: PluginModuleResource = {
  kind: 'PluginModule',
  metadata: { name: 'hertzbeat-perses-runtime', version: '2.0.0' },
  spec: {
    plugins: [
      {
        kind: 'TimeSeriesQuery',
        spec: {
          name: HERTZBEAT_SNAPSHOT_QUERY_KIND,
          display: {
            name: 'HertzBeat metric snapshot',
            description: 'Renders an authorized metric response already loaded through the HertzBeat API.'
          }
        }
      },
      {
        kind: 'LogQuery',
        spec: {
          name: HERTZBEAT_SNAPSHOT_LOG_QUERY_KIND,
          display: {
            name: 'HertzBeat log snapshot',
            description: 'Renders authorized logs already loaded through the HertzBeat API.'
          }
        }
      },
      {
        kind: 'TraceQuery',
        spec: {
          name: HERTZBEAT_SNAPSHOT_TRACE_QUERY_KIND,
          display: {
            name: 'HertzBeat trace snapshot',
            description: 'Renders authorized traces already loaded through the HertzBeat API.'
          }
        }
      }
    ]
  }
};
