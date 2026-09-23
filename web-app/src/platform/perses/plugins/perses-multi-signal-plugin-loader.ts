/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { dynamicImportPluginLoader } from '@perses-dev/plugin-system';
import * as logsTablePlugin from '@perses-dev/logs-table-plugin/lib/index.js';
import * as timeSeriesChartPlugin from '@perses-dev/timeseries-chart-plugin/lib/index.js';
import * as traceTablePlugin from '@perses-dev/trace-table-plugin/lib/index.js';
import * as tracingGanttChartPlugin from '@perses-dev/tracing-gantt-chart-plugin/lib/index.js';

import { hertzBeatSnapshotPluginModule } from './hertzbeat-snapshot-query';
import { hertzBeatSnapshotPlugin, withCompoundPluginKeys } from './perses-plugin-loader';

export const hertzBeatPersesMultiSignalPluginLoader = withCompoundPluginKeys(
  dynamicImportPluginLoader([
    {
      resource: hertzBeatSnapshotPluginModule,
      importPlugin: () => Promise.resolve(hertzBeatSnapshotPlugin)
    },
    {
      resource: timeSeriesChartPlugin.getPluginModule(),
      importPlugin: () => Promise.resolve(timeSeriesChartPlugin)
    },
    {
      resource: logsTablePlugin.getPluginModule(),
      importPlugin: () => Promise.resolve(logsTablePlugin)
    },
    {
      resource: traceTablePlugin.getPluginModule(),
      importPlugin: () => Promise.resolve(traceTablePlugin)
    },
    {
      resource: tracingGanttChartPlugin.getPluginModule(),
      importPlugin: () => Promise.resolve(tracingGanttChartPlugin)
    }
  ])
);
