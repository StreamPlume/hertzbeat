/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { ThemeProvider } from '@mui/material/styles';
import { ChartsProvider, generateChartsTheme, SnackbarProvider } from '@perses-dev/components';
import type {
  DashboardResource,
  DatasourceApi,
  DatasourceResource,
  GlobalDatasourceResource
} from '@perses-dev/client';
import { DatasourceStoreProvider, VariableProvider } from '@perses-dev/dashboards';
import { PluginRegistry, RouterProvider, TimeRangeProvider, type PluginLoader } from '@perses-dev/plugin-system';
import type { DurationString, TimeRangeValue } from '@perses-dev/spec';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { useRuntimeTheme } from '@/core/runtime-theme-context';
import type { ExactTimeWindow } from '@/shared/query-context';

import { HERTZBEAT_SNAPSHOT_QUERY_KIND } from '../plugins/hertzbeat-snapshot-query';
import { createHertzBeatPersesTheme } from './hertzbeat-perses-theme';
import { hertzBeatPersesPluginLoader } from '../plugins/perses-plugin-loader';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: Number.POSITIVE_INFINITY } }
});

const dashboard = {
  kind: 'Dashboard',
  metadata: { name: 'hertzbeat-investigation-runtime', project: 'hertzbeat' },
  spec: { duration: '30m', variables: [], panels: {}, layouts: [] }
} as DashboardResource;

const datasourceApi: DatasourceApi = {
  getDatasource: (): Promise<DatasourceResource | undefined> => Promise.resolve(undefined),
  getGlobalDatasource: (): Promise<GlobalDatasourceResource | undefined> => Promise.resolve(undefined),
  listDatasources: (): Promise<DatasourceResource[]> => Promise.resolve([]),
  listGlobalDatasources: (): Promise<GlobalDatasourceResource[]> => Promise.resolve([])
};

export function PersesRuntimeProviders({
  children,
  timeWindow,
  pluginLoader = hertzBeatPersesPluginLoader,
  onTimeWindowChange,
  timeWindowChangeEnabled = true
}: {
  children: ReactNode;
  timeWindow: ExactTimeWindow;
  pluginLoader?: PluginLoader | undefined;
  onTimeWindowChange?: ((window: ExactTimeWindow) => void) | undefined;
  timeWindowChangeEnabled?: boolean | undefined;
}) {
  const { theme } = useRuntimeTheme();
  const [persesTimeRange, setPersesTimeRange] = useState<TimeRangeValue>(() => toTimeRange(timeWindow));
  const lastAbsoluteWindow = useRef<ExactTimeWindow>(timeWindow);
  const [refreshInterval, setRefreshInterval] = useState<DurationString>('0s');
  const muiTheme = useMemo(() => createHertzBeatPersesTheme(theme), [theme]);
  const chartsTheme = useMemo(() => generateChartsTheme(muiTheme, {}), [muiTheme]);
  const updateTimeRange = useCallback(
    (value: TimeRangeValue) => {
      if (!timeWindowChangeEnabled) return;
      setPersesTimeRange(value);
      const nextWindow = exactWindow(value);
      if (!nextWindow || sameWindow(lastAbsoluteWindow.current, nextWindow)) return;
      lastAbsoluteWindow.current = nextWindow;
      onTimeWindowChange?.(nextWindow);
    },
    [onTimeWindowChange, timeWindowChangeEnabled]
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <ChartsProvider chartsTheme={chartsTheme}>
        <SnackbarProvider anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} variant="default" content="">
          <PluginRegistry
            pluginLoader={pluginLoader}
            defaultPluginKinds={{ Panel: 'TimeSeriesChart', TimeSeriesQuery: HERTZBEAT_SNAPSHOT_QUERY_KIND }}
          >
            <RouterProvider RouterComponent={undefined} navigate={undefined}>
              <QueryClientProvider client={queryClient}>
                <TimeRangeProvider
                  timeRange={persesTimeRange}
                  refreshInterval={refreshInterval}
                  setTimeRange={updateTimeRange}
                  setRefreshInterval={setRefreshInterval}
                >
                  <VariableProvider>
                    <DatasourceStoreProvider dashboardResource={dashboard} datasourceApi={datasourceApi}>
                      {children}
                    </DatasourceStoreProvider>
                  </VariableProvider>
                </TimeRangeProvider>
              </QueryClientProvider>
            </RouterProvider>
          </PluginRegistry>
        </SnackbarProvider>
      </ChartsProvider>
    </ThemeProvider>
  );
}

function toTimeRange(window: ExactTimeWindow): TimeRangeValue {
  return { start: new Date(window.from), end: new Date(window.to) };
}

function exactWindow(value: TimeRangeValue): ExactTimeWindow | undefined {
  if (!('start' in value)) return undefined;
  const from = value.start.getTime();
  const to = value.end.getTime();
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from > 0 && from < to ? { from, to } : undefined;
}

function sameWindow(current: ExactTimeWindow, next: ExactTimeWindow) {
  return current.from === next.from && current.to === next.to;
}
