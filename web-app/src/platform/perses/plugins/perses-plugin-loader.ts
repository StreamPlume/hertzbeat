/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import type { PluginLoader } from '@perses-dev/plugin-system';
import { dynamicImportPluginLoader, getPluginModuleCompoundKey } from '@perses-dev/plugin-system';
// The 0.13.0 CommonJS entry resolves a non-existent lib/package.json. Pin the
// published ESM entry until the upstream package corrects that export.
import * as timeSeriesChartPlugin from '@perses-dev/timeseries-chart-plugin/lib/index.js';

import {
  HertzBeatSnapshotLogQuery,
  HertzBeatSnapshotTimeSeriesQuery,
  HertzBeatSnapshotTraceQuery,
  hertzBeatSnapshotPluginModule
} from './hertzbeat-snapshot-query';

export function withCompoundPluginKeys(loader: PluginLoader): PluginLoader {
  return {
    getInstalledPlugins: () => loader.getInstalledPlugins(),
    importPluginModule: async resource => {
      const imported = await loader.importPluginModule(resource);
      if (!imported || typeof imported !== 'object') return imported;
      const module = imported as Record<string, unknown>;
      const remapped: Record<string, unknown> = { ...module };
      resource.spec.plugins.forEach(plugin => {
        const implementation = module[plugin.spec.name];
        if (!implementation) return;
        remapped[
          getPluginModuleCompoundKey({
            kind: plugin.kind,
            name: plugin.spec.name,
            version: resource.metadata.version,
            ...(resource.metadata.registry ? { registry: resource.metadata.registry } : {})
          })
        ] = implementation;
      });
      return remapped;
    }
  };
}

export const hertzBeatSnapshotPlugin = {
  HertzBeatSnapshotLogQuery,
  HertzBeatSnapshotTimeSeriesQuery,
  HertzBeatSnapshotTraceQuery
};

export const hertzBeatPersesPluginLoader = withCompoundPluginKeys(
  dynamicImportPluginLoader([
    {
      resource: hertzBeatSnapshotPluginModule,
      importPlugin: () => Promise.resolve(hertzBeatSnapshotPlugin)
    },
    {
      resource: timeSeriesChartPlugin.getPluginModule(),
      importPlugin: () => Promise.resolve(timeSeriesChartPlugin)
    }
  ])
);
