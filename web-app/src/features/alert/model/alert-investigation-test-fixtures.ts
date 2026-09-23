/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type { AlertInvestigationSnapshot } from './alert-investigation-contract';
import type { AlertInvestigationRoute } from './alert-investigation-route';

export function alertReadyRoute(): Extract<AlertInvestigationRoute, { kind: 'ready' }> {
  return { kind: 'ready', alertId: 11, window: { from: 1_000, to: 2_000, timeZone: 'UTC' }, returnTo: '/alerts' };
}

export function alertInvestigationSnapshot(): AlertInvestigationSnapshot {
  return {
    alertId: 11,
    window: { start: 1_000, end: 2_000, anchor: 1_500 },
    alert: {
      name: 'Checkout latency',
      status: 'firing',
      severity: 'critical',
      summary: 'Latency exceeded',
      content: 'Checkout p95 is high.',
      labels: {},
      annotations: {}
    },
    identity: readyIdentity(),
    ...readyEvidence()
  };
}

function readyIdentity(): AlertInvestigationSnapshot['identity'] {
  return {
    state: 'ready',
    reason: 'observed',
    source: 'persisted_alert',
    identity: {
      serviceName: 'checkout',
      serviceNamespace: 'commerce',
      deploymentEnvironment: 'prod',
      entityId: 7,
      entityType: 'service',
      monitorId: 42,
      metricName: 'http.server.duration',
      metricQuery: null
    }
  };
}

function readyEvidence(): Pick<AlertInvestigationSnapshot, 'metrics' | 'logs' | 'traces' | 'topology' | 'collection'> {
  return {
    ...readyMetricAndLogEvidence(),
    ...readyTraceEvidence(),
    ...readyOperationalEvidence()
  };
}

function readyMetricAndLogEvidence(): Pick<AlertInvestigationSnapshot, 'metrics' | 'logs'> {
  return {
    metrics: {
      state: 'ready',
      reason: 'observed',
      source: 'otlp_metrics',
      series: [{ name: 'http.server.duration', labels: {}, points: [{ timestamp: 1_000, value: 1 }] }],
      truncated: false
    },
    logs: {
      state: 'ready',
      reason: 'observed',
      source: 'greptime_logs',
      records: [
        {
          logRecordUid: 'log-1',
          timeUnixNano: '1000000000',
          observedTimeUnixNano: null,
          severityNumber: 17,
          severityText: 'ERROR',
          body: 'checkout failed',
          traceId: '0123456789abcdef0123456789abcdef',
          spanId: '0123456789abcdef',
          identity: null,
          attributes: {},
          resourceAttributes: {}
        }
      ],
      truncated: false
    }
  };
}

function readyTraceEvidence(): Pick<AlertInvestigationSnapshot, 'traces'> {
  return {
    traces: {
      state: 'ready',
      reason: 'observed',
      source: 'greptime_traces',
      traces: [
        {
          traceId: '0123456789abcdef0123456789abcdef',
          startTimeUnixNano: '1000000000',
          durationNanos: '3000000',
          status: 'error',
          spanCount: 7,
          serviceName: 'checkout'
        }
      ],
      truncated: false
    }
  };
}

function readyOperationalEvidence(): Pick<AlertInvestigationSnapshot, 'topology' | 'collection'> {
  return {
    topology: {
      state: 'ready',
      reason: 'observed',
      source: 'greptime_semantic_graph',
      edges: [
        {
          observedAt: 1_000,
          sourceType: 'service',
          sourceId: '7',
          targetType: 'service',
          targetId: '8',
          relationType: 'calls',
          provenance: 'trace',
          confidence: 0.9,
          requestCount: 12,
          errorCount: 2
        }
      ],
      truncated: false
    },
    collection: {
      state: 'ready',
      reason: 'observed',
      source: 'greptime_collection_events',
      event: {
        observedAt: 1_000,
        durationMillis: -1,
        outcome: 'FAILURE',
        collectorId: null,
        target: 'checkout:8080',
        metricSet: null,
        failureClass: 'UNREACHABLE',
        phase: 'CONNECT',
        fieldCount: 4,
        rowCount: 0
      }
    }
  };
}
