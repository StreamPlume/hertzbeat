/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { buildTopologyInvestigationPath } from '@/features/topology';

import type {
  InvestigationServiceIdentity,
  InvestigationTraceDetail,
  LogInvestigationSnapshot,
  TraceInvestigationSnapshot
} from './explore-investigation-contract';
import { buildExplorePath } from './explore-url-model';
import { mergeExploreQuery, signalSelectionPatch } from './explore-model';
import type { ExploreQueryPatch, LogExploreQuery, TraceExploreQuery } from './explore-query';

type HandoffIdentity = Pick<
  InvestigationServiceIdentity,
  'entityId' | 'serviceName' | 'serviceNamespace' | 'deploymentEnvironment'
>;

export function buildTraceInvestigationMetricsPath(query: TraceExploreQuery, snapshot: TraceInvestigationSnapshot) {
  const identity = traceIdentity(snapshot);
  return identity ? metricsPath(query, snapshot.window, identity) : undefined;
}

export function buildLogInvestigationMetricsPath(query: LogExploreQuery, snapshot: LogInvestigationSnapshot) {
  const identity = logIdentity(snapshot);
  return identity ? metricsPath(query, snapshot.window, identity) : undefined;
}

export function buildTraceInvestigationTopologyPath(snapshot: TraceInvestigationSnapshot) {
  const identity = traceIdentity(snapshot);
  const focusEntityId = safeEntityId(identity?.entityId);
  if (!identity || focusEntityId == null) return undefined;
  return buildTopologyInvestigationPath({
    entityId: focusEntityId,
    window: { from: snapshot.window.start, to: snapshot.window.end },
    ...(identity.deploymentEnvironment ? { environment: identity.deploymentEnvironment } : {})
  });
}

export function buildLogInvestigationTopologyPath(snapshot: LogInvestigationSnapshot) {
  const identity = selectedLogIdentity(snapshot);
  const focusEntityId = safeEntityId(identity?.entityId);
  if (!identity || focusEntityId == null) return undefined;
  return buildTopologyInvestigationPath({
    entityId: focusEntityId,
    window: { from: snapshot.window.start, to: snapshot.window.end },
    ...(identity.deploymentEnvironment ? { environment: identity.deploymentEnvironment } : {})
  });
}

export function traceInvestigationIdentity(snapshot: TraceInvestigationSnapshot) {
  return traceIdentity(snapshot);
}

export function logInvestigationIdentity(snapshot: LogInvestigationSnapshot) {
  return logIdentity(snapshot);
}

function metricsPath(
  source: TraceExploreQuery | LogExploreQuery,
  window: { start: number; end: number },
  identity: HandoffIdentity
) {
  return buildExplorePath(
    mergeExploreQuery(source, {
      ...signalSelectionPatch('metrics'),
      ...clearedContext(),
      signal: 'metrics',
      start: window.start,
      end: window.end,
      entityId: identity.entityId,
      serviceName: identity.serviceName,
      serviceNamespace: identity.serviceNamespace ?? undefined,
      environment: identity.deploymentEnvironment ?? undefined
    })
  );
}

function traceIdentity(snapshot: TraceInvestigationSnapshot): HandoffIdentity | undefined {
  if (snapshot.red.state === 'ready' && snapshot.red.identity) return snapshot.red.identity;
  if (snapshot.gantt.state === 'ready' && snapshot.gantt.detail) return detailIdentity(snapshot.gantt.detail);
  return undefined;
}

function logIdentity(snapshot: LogInvestigationSnapshot): HandoffIdentity | undefined {
  const selectedIdentity = selectedLogIdentity(snapshot);
  if (selectedIdentity) return selectedIdentity;
  if (snapshot.trace.state === 'ready' && snapshot.trace.detail) return detailIdentity(snapshot.trace.detail);
  return undefined;
}

function selectedLogIdentity(snapshot: LogInvestigationSnapshot): HandoffIdentity | undefined {
  return snapshot.selectedLog.state === 'ready' && snapshot.selectedLog.log?.identity
    ? snapshot.selectedLog.log.identity
    : undefined;
}

function detailIdentity(detail: InvestigationTraceDetail): HandoffIdentity {
  return {
    entityId: detail.entityId ?? '',
    serviceName: detail.serviceName,
    serviceNamespace: detail.serviceNamespace,
    deploymentEnvironment: detail.deploymentEnvironment
  };
}

function safeEntityId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function clearedContext(): ExploreQueryPatch {
  return {
    entityId: undefined,
    monitorId: undefined,
    intakeProfileId: undefined,
    collectorId: undefined,
    serviceName: undefined,
    serviceNamespace: undefined,
    environment: undefined,
    instance: undefined,
    endpoint: undefined
  };
}
