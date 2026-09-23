/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

type EntityRedValues = {
  requestCount: number;
  errorCount: number;
  requestRatePerSecond: number;
  errorRate: number;
  latencyAverageMs: number | null;
  latencyP95Ms: number | null;
};

export type EntityRedPoint = EntityRedValues & { timestamp: number };

type EntityRedBase = {
  source: 'greptime_flow';
  resolutionSeconds: 60;
  window: { start: number; end: number };
  identity: {
    workspaceId: string;
    entityId: string;
    entityType: string;
    serviceName: string;
    serviceNamespace: string | null;
    deploymentEnvironment: string | null;
  };
};

export type EntityRedReadySignal = EntityRedBase & {
  state: 'ready';
  summary: EntityRedValues;
  series: EntityRedPoint[];
};

export type EntityRedSignal =
  EntityRedReadySignal | (EntityRedBase & { state: 'empty' | 'unavailable'; summary: null; series: [] });

export type EntityRedViewState = EntityRedReadySignal | { state: 'empty' | 'unavailable' };
