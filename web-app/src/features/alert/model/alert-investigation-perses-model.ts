/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { createInvestigationLogResult, createInvestigationMetricResults } from '@/features/explore';

import type {
  AlertInvestigationIdentity,
  AlertInvestigationPersesResults,
  AlertInvestigationSnapshot
} from './alert-investigation-contract';

export function createAlertInvestigationPersesResults(
  snapshot: AlertInvestigationSnapshot
): AlertInvestigationPersesResults {
  const window = { from: snapshot.window.start, to: snapshot.window.end };
  const context = queryContext(snapshot.identity.identity);
  return {
    metrics: createInvestigationMetricResults(
      snapshot.metrics.series.map(series => ({
        metricName: series.name,
        unit: null,
        labels: series.labels,
        points: series.points
      })),
      snapshot.metrics.state,
      snapshot.metrics.truncated,
      window,
      context
    ),
    ...(snapshot.logs.state === 'ready'
      ? { logs: createInvestigationLogResult(snapshot.logs.records, snapshot.logs.truncated, window, context) }
      : {})
  };
}

function queryContext(identity: AlertInvestigationIdentity | null) {
  if (!identity) return {};
  return {
    ...(identity.entityId ? { entityId: String(identity.entityId) } : {}),
    ...(identity.monitorId ? { monitorId: String(identity.monitorId) } : {}),
    ...(identity.serviceName ? { serviceName: identity.serviceName } : {}),
    ...(identity.serviceNamespace ? { serviceNamespace: identity.serviceNamespace } : {}),
    ...(identity.deploymentEnvironment ? { environment: identity.deploymentEnvironment } : {})
  };
}
