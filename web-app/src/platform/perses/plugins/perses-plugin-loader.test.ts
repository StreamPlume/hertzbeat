/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { getPluginModuleCompoundKey } from '@perses-dev/plugin-system';
import { LogsTable } from '@perses-dev/logs-table-plugin/lib/index.js';
import { TimeSeriesChart } from '@perses-dev/timeseries-chart-plugin/lib/index.js';
import { TraceTable } from '@perses-dev/trace-table-plugin/lib/index.js';
import { TracingGanttChart } from '@perses-dev/tracing-gantt-chart-plugin/lib/index.js';
import { describe, expect, it } from 'vitest';

import {
  HERTZBEAT_SNAPSHOT_LOG_QUERY_KIND,
  HERTZBEAT_SNAPSHOT_QUERY_KIND,
  HERTZBEAT_SNAPSHOT_TRACE_QUERY_KIND,
  HertzBeatSnapshotLogQuery,
  HertzBeatSnapshotTimeSeriesQuery,
  HertzBeatSnapshotTraceQuery
} from './hertzbeat-snapshot-query';
import { hertzBeatPersesMultiSignalPluginLoader } from './perses-multi-signal-plugin-loader';
import { hertzBeatPersesPluginLoader } from './perses-plugin-loader';

describe('HertzBeat Perses plugin loader', () => {
  it('keeps the time-series loader free of multi-signal panel plugins', async () => {
    const resources = await hertzBeatPersesPluginLoader.getInstalledPlugins();
    expect(resources.map(resource => resource.metadata.name)).toEqual([
      'hertzbeat-perses-runtime',
      '@perses-dev/timeseries-chart-plugin'
    ]);
    const timeSeriesModule = (await hertzBeatPersesPluginLoader.importPluginModule(resources[1]!)) as Record<
      string,
      unknown
    >;
    expect(
      timeSeriesModule[getPluginModuleCompoundKey({ kind: 'Panel', name: 'TimeSeriesChart', version: '0.13.0' })]
    ).toBe(TimeSeriesChart);
  });

  it('registers snapshot query bridges and all four official panels only in the multi-signal loader', async () => {
    // Importing LogsTable is also the packaging regression contract for 0.3.0.
    // Its pnpm patch restores ansiColors.css verbatim from the same version's
    // __mf/css/async/__federation_expose_LogsTable.eedb54d8.css and adds only
    // the trailing POSIX newline expected for a source file.
    const resources = await hertzBeatPersesMultiSignalPluginLoader.getInstalledPlugins();
    expect(resources.map(resource => resource.metadata.name)).toEqual([
      'hertzbeat-perses-runtime',
      '@perses-dev/timeseries-chart-plugin',
      '@perses-dev/logs-table-plugin',
      '@perses-dev/trace-table-plugin',
      '@perses-dev/tracing-gantt-chart-plugin'
    ]);

    const snapshotResource = resources[0]!;
    const loaded = (await hertzBeatPersesMultiSignalPluginLoader.importPluginModule(snapshotResource)) as Record<
      string,
      unknown
    >;
    const compoundKey = getPluginModuleCompoundKey({
      kind: 'TimeSeriesQuery',
      name: HERTZBEAT_SNAPSHOT_QUERY_KIND,
      version: '2.0.0'
    });
    expect(loaded[compoundKey]).toBe(HertzBeatSnapshotTimeSeriesQuery);
    expect(
      loaded[
        getPluginModuleCompoundKey({
          kind: 'LogQuery',
          name: HERTZBEAT_SNAPSHOT_LOG_QUERY_KIND,
          version: '2.0.0'
        })
      ]
    ).toBe(HertzBeatSnapshotLogQuery);
    expect(
      loaded[
        getPluginModuleCompoundKey({
          kind: 'TraceQuery',
          name: HERTZBEAT_SNAPSHOT_TRACE_QUERY_KIND,
          version: '2.0.0'
        })
      ]
    ).toBe(HertzBeatSnapshotTraceQuery);

    const timeSeriesResource = resources[1]!;
    const timeSeriesModule = (await hertzBeatPersesMultiSignalPluginLoader.importPluginModule(
      timeSeriesResource
    )) as Record<string, unknown>;
    const timeSeriesCompoundKey = getPluginModuleCompoundKey({
      kind: 'Panel',
      name: 'TimeSeriesChart',
      version: '0.13.0'
    });
    expect(timeSeriesModule[timeSeriesCompoundKey]).toBe(TimeSeriesChart);

    const panelCases = [
      { resource: resources[2]!, name: 'LogsTable', version: '0.3.0', implementation: LogsTable },
      { resource: resources[3]!, name: 'TraceTable', version: '0.11.0', implementation: TraceTable },
      {
        resource: resources[4]!,
        name: 'TracingGanttChart',
        version: '0.13.0',
        implementation: TracingGanttChart
      }
    ];
    for (const panel of panelCases) {
      const module = (await hertzBeatPersesMultiSignalPluginLoader.importPluginModule(panel.resource)) as Record<
        string,
        unknown
      >;
      expect(module[getPluginModuleCompoundKey({ kind: 'Panel', name: panel.name, version: panel.version })]).toBe(
        panel.implementation
      );
    }
  });
});
